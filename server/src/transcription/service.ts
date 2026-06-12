import { nowIso, type DB } from "../db/db.js";
import { logger } from "../logger.js";
import {
  TranscriptionError,
  type AudioChunk,
  type AudioInput,
  type SplitAudio,
  type TranscriptionProvider,
  type TranscriptionResult,
} from "./types.js";

export interface TranscriptionConfig {
  provider: string;
  model: string;
}

// Built-in default: the OpenAI Whisper adapter. Never hardcoded at call sites —
// callers resolve through resolveConfig (setting > env > this default).
const DEFAULT_CONFIG: TranscriptionConfig = {
  provider: "openai",
  model: "whisper-1",
};

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BACKOFF_BASE_MS = 1000;
// OpenAI caps the request body at 25 MB; stay safely under it per chunk.
const DEFAULT_MAX_CHUNK_BYTES = 24 * 1024 * 1024;

// Compressed containers can't be split by naive byte ranges without frame-aware
// demuxing (ffmpeg), which is wired in the lesson-recording-ingestion task.
const COMPRESSED_FORMATS = new Set([
  "mp3",
  "m4a",
  "mp4",
  "ogg",
  "oga",
  "webm",
  "aac",
  "flac",
  "opus",
]);

function extOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i >= 0 ? filename.slice(i + 1).toLowerCase() : "";
}

/**
 * Default audio splitter: passes a recording that already fits the per-request
 * byte limit straight through as a single chunk. Splitting an OVERSIZED
 * compressed recording (m4a/mp3/ogg…) requires frame-aware demuxing (ffmpeg)
 * that needs a system binary we deliberately don't add here — that lands in
 * lesson-recording-ingestion. Until then we throw a single clearly-named error
 * rather than corrupt frames by slicing bytes. Inject a real splitter to
 * override this seam.
 */
export const defaultSplitAudio: SplitAudio = (input, maxBytes) => {
  if (input.data.length <= maxBytes) {
    return [
      {
        data: input.data,
        filename: input.filename,
        minutes: input.minutes,
      },
    ];
  }
  const ext = extOf(input.filename);
  const format = COMPRESSED_FORMATS.has(ext) ? ext : ext || "unknown";
  throw new TranscriptionError(
    `audio splitting for ${format} is wired in lesson-recording-ingestion`,
    { retryable: false },
  );
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Task-level entry point for all transcription calls. Resolves the
 * provider/model (setting `transcription` > env > built-in default), splits a
 * long recording into ordered chunks under the provider's size limit,
 * transcribes each chunk (each its own retry loop + transcription_call row,
 * success and failure alike), and stitches the returned texts back in order
 * into one transcript. Mirrors LlmService.
 */
export class TranscriptionService {
  private readonly splitAudio: SplitAudio;
  private readonly maxAttempts: number;
  private readonly backoffBaseMs: number;
  private readonly maxChunkBytes: number;
  private readonly env: NodeJS.ProcessEnv;

  constructor(
    private db: DB,
    private providers: Record<string, TranscriptionProvider>,
    opts: {
      splitAudio?: SplitAudio;
      maxAttempts?: number;
      backoffBaseMs?: number;
      maxChunkBytes?: number;
      env?: NodeJS.ProcessEnv;
    } = {},
  ) {
    this.splitAudio = opts.splitAudio ?? defaultSplitAudio;
    this.maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.backoffBaseMs = opts.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;
    this.maxChunkBytes = opts.maxChunkBytes ?? DEFAULT_MAX_CHUNK_BYTES;
    this.env = opts.env ?? process.env;
  }

  /**
   * setting row `transcription` (JSON {provider?, model?}) overrides
   * TRANSCRIPTION_PROVIDER / TRANSCRIPTION_MODEL env vars, which override the
   * built-in default. The provider/model is never hardcoded at call sites.
   */
  resolveConfig(): TranscriptionConfig {
    const row = this.db
      .prepare("SELECT value FROM setting WHERE key = ?")
      .get("transcription") as { value: string } | undefined;
    let override: Partial<TranscriptionConfig> = {};
    if (row) {
      try {
        override = JSON.parse(row.value) as Partial<TranscriptionConfig>;
      } catch {
        // unparseable setting → fall back to env/default config
      }
    }
    return {
      provider:
        override.provider ??
        this.env.TRANSCRIPTION_PROVIDER ??
        DEFAULT_CONFIG.provider,
      model:
        override.model ?? this.env.TRANSCRIPTION_MODEL ?? DEFAULT_CONFIG.model,
    };
  }

  /**
   * Transcribe a recording end-to-end: split → transcribe each chunk →
   * stitch. `task` is written to every transcription_call row (the audio
   * source, e.g. "lesson_audio"). Returns the stitched transcript with summed
   * usage. Throws if any chunk fails terminally after its retries.
   */
  async transcribe(
    task: string,
    input: AudioInput,
  ): Promise<TranscriptionResult> {
    const chunks = this.splitAudio(input, this.maxChunkBytes);

    const texts: string[] = [];
    let minutes = 0;
    let cost = 0;
    let anyCost = false;
    let cacheHit = false;

    for (const chunk of chunks) {
      const result = await this.transcribeChunk(task, chunk);
      texts.push(result.text);
      minutes += result.usage.minutes;
      if (result.usage.costEstimateUsd !== null) {
        cost += result.usage.costEstimateUsd;
        anyCost = true;
      }
      cacheHit = cacheHit || result.usage.cacheHit;
    }

    return {
      text: texts.join(" "),
      usage: { minutes, cacheHit, costEstimateUsd: anyCost ? cost : null },
    };
  }

  private async transcribeChunk(
    task: string,
    chunk: AudioChunk,
  ): Promise<TranscriptionResult> {
    const { provider: providerName, model } = this.resolveConfig();
    const provider = this.providers[providerName];

    for (let attempt = 1; ; attempt++) {
      const startedAt = Date.now();
      try {
        if (!provider) {
          throw new TranscriptionError(
            `Unknown transcription provider "${providerName}"`,
            { retryable: false },
          );
        }
        const result = await provider.transcribe({
          model,
          audio: chunk.data,
          filename: chunk.filename,
          minutes: chunk.minutes,
        });
        this.logCall(task, providerName, model, {
          latencyMs: Date.now() - startedAt,
          result,
        });
        return result;
      } catch (err) {
        const tErr =
          err instanceof TranscriptionError
            ? err
            : new TranscriptionError(
                err instanceof Error ? err.message : String(err),
                { retryable: false, cause: err },
              );
        this.logCall(task, providerName, model, {
          latencyMs: Date.now() - startedAt,
          error: tErr.message,
        });
        logger.error("transcription", "transcription call failed", {
          task,
          provider: providerName,
          model,
          attempt,
          retryable: tErr.retryable,
          err: tErr,
        });
        if (!tErr.retryable || attempt >= this.maxAttempts) throw tErr;
        await sleep(this.backoffBaseMs * 2 ** (attempt - 1));
      }
    }
  }

  private logCall(
    task: string,
    provider: string,
    model: string,
    outcome: { latencyMs: number; result?: TranscriptionResult; error?: string },
  ): void {
    const usage = outcome.result?.usage;
    const now = nowIso();
    this.db
      .prepare(
        `INSERT INTO transcription_call
           (task, provider, model, prompt_version, minutes, latency_ms,
            cache_hit, cost_estimate_usd, status, error, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        task,
        provider,
        model,
        // Transcription has no prompt template.
        null,
        usage?.minutes ?? null,
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
