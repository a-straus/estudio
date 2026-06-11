import { nowIso, type DB } from "../db/db.js";
import { logger } from "../logger.js";
import { loadPrompt } from "./prompts.js";
import {
  LlmError,
  type LlmProvider,
  type LlmResponse,
  type VisionAttachment,
} from "./types.js";

export type LlmTask =
  | "pdf_extraction"
  | "page_classification"
  | "text_extraction"
  | "word_definition"
  | "grammar_curriculum"
  | "quiz_cloze";

export interface TaskConfig {
  provider: string;
  model: string;
}

const TASK_DEFAULTS: Record<LlmTask, TaskConfig> = {
  pdf_extraction: { provider: "anthropic", model: "claude-fable-5" },
  page_classification: { provider: "anthropic", model: "claude-fable-5" },
  text_extraction: { provider: "anthropic", model: "claude-fable-5" },
  word_definition: { provider: "anthropic", model: "claude-fable-5" },
  grammar_curriculum: { provider: "anthropic", model: "claude-fable-5" },
  quiz_cloze: { provider: "anthropic", model: "claude-fable-5" },
};

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BACKOFF_BASE_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Task-level entry point for all LLM calls. Resolves the provider/model for
 * the task (setting table > env > built-in default), loads the prompt
 * template at call time, retries retryable failures with exponential
 * backoff, and writes one llm_call row per attempt — success and failure.
 */
export class LlmService {
  private readonly maxAttempts: number;
  private readonly backoffBaseMs: number;
  private readonly env: NodeJS.ProcessEnv;

  constructor(
    private db: DB,
    private providers: Record<string, LlmProvider>,
    opts: {
      maxAttempts?: number;
      backoffBaseMs?: number;
      env?: NodeJS.ProcessEnv;
    } = {},
  ) {
    this.maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.backoffBaseMs = opts.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;
    this.env = opts.env ?? process.env;
  }

  /**
   * setting row `llm.<task>` (JSON {provider?, model?}) overrides
   * LLM_<TASK>_PROVIDER / LLM_<TASK>_MODEL env vars, which override the
   * built-in default. Models are never hardcoded at call sites.
   */
  resolveTaskConfig(task: LlmTask): TaskConfig {
    const def = TASK_DEFAULTS[task];
    const envKey = task.toUpperCase();
    const row = this.db
      .prepare("SELECT value FROM setting WHERE key = ?")
      .get(`llm.${task}`) as { value: string } | undefined;
    let override: Partial<TaskConfig> = {};
    if (row) {
      try {
        override = JSON.parse(row.value) as Partial<TaskConfig>;
      } catch {
        // unparseable setting → fall back to env/default config
      }
    }
    return {
      provider:
        override.provider ?? this.env[`LLM_${envKey}_PROVIDER`] ?? def.provider,
      model: override.model ?? this.env[`LLM_${envKey}_MODEL`] ?? def.model,
    };
  }

  /**
   * `substitutions` fills `{{placeholder}}` slots in the task's prompt template
   * (e.g. the target word for quiz_cloze). The recorded prompt_version still
   * hashes the raw template, not the filled text.
   */
  complete(
    task: LlmTask,
    substitutions?: Record<string, string>,
  ): Promise<string> {
    return this.run(task, undefined, substitutions);
  }

  /**
   * `substitutions` fills `{{placeholder}}` slots in the task's prompt template
   * (e.g. the calibration sample for pdf_extraction). The recorded
   * prompt_version still hashes the raw template, not the filled text.
   */
  vision(
    task: LlmTask,
    attachments: VisionAttachment[],
    substitutions?: Record<string, string>,
  ): Promise<string> {
    return this.run(task, attachments, substitutions);
  }

  private async run(
    task: LlmTask,
    attachments?: VisionAttachment[],
    substitutions?: Record<string, string>,
  ): Promise<string> {
    const { text: prompt, version: promptVersion } = loadPrompt(
      task,
      substitutions,
    );
    const { provider: providerName, model } = this.resolveTaskConfig(task);
    const provider = this.providers[providerName];

    for (let attempt = 1; ; attempt++) {
      const startedAt = Date.now();
      try {
        if (!provider) {
          throw new LlmError(`Unknown LLM provider "${providerName}"`, {
            retryable: false,
          });
        }
        const response = await (attachments
          ? provider.vision({ model, prompt, attachments })
          : provider.complete({ model, prompt }));
        this.logCall(task, providerName, model, promptVersion, {
          latencyMs: Date.now() - startedAt,
          response,
        });
        return response.text;
      } catch (err) {
        const llmErr =
          err instanceof LlmError
            ? err
            : new LlmError(err instanceof Error ? err.message : String(err), {
                retryable: false,
                cause: err,
              });
        this.logCall(task, providerName, model, promptVersion, {
          latencyMs: Date.now() - startedAt,
          error: llmErr.message,
        });
        logger.error("llm", "llm call failed", {
          task,
          provider: providerName,
          model,
          attempt,
          retryable: llmErr.retryable,
          err: llmErr,
        });
        if (!llmErr.retryable || attempt >= this.maxAttempts) throw llmErr;
        await sleep(this.backoffBaseMs * 2 ** (attempt - 1));
      }
    }
  }

  private logCall(
    task: LlmTask,
    provider: string,
    model: string,
    promptVersion: string,
    outcome: { latencyMs: number; response?: LlmResponse; error?: string },
  ): void {
    const usage = outcome.response?.usage;
    const now = nowIso();
    this.db
      .prepare(
        `INSERT INTO llm_call
           (task, provider, model, prompt_version, tokens_in, tokens_out,
            latency_ms, cache_hit, cost_estimate_usd, status, error,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        task,
        provider,
        model,
        promptVersion,
        usage?.tokensIn ?? null,
        usage?.tokensOut ?? null,
        outcome.latencyMs,
        usage?.cacheHit ? 1 : 0,
        usage?.costEstimateUsd ?? null,
        outcome.error === undefined ? "ok" : "error",
        outcome.error ?? null,
        now,
        now,
      );
  }
}
