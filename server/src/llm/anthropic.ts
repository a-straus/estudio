import Anthropic from "@anthropic-ai/sdk";
import {
  LlmError,
  type CompleteParams,
  type LlmProvider,
  type LlmResponse,
  type VisionParams,
} from "./types.js";

// USD per million tokens (input, output) — used only for the cost_estimate_usd
// column on llm_call rows. Unknown models get a null estimate, never a guess.
const PRICING: Record<string, { input: number; output: number }> = {
  // FABLE-DISABLED (2026-06-13): claude-fable-5 is no longer a default model
  // (see service.ts), but its price stays here so any task still pinned to it
  // via a setting/env override is costed correctly, and reverting needs no edit
  // to this table.
  "claude-fable-5": { input: 10, output: 50 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

const DEFAULT_MAX_TOKENS = 8192;

/**
 * USD-per-million-token pricing for a model, or null when the model is unknown
 * (so callers estimate nothing rather than guess). Exposed so upfront cost
 * estimates (e.g. the Gutenberg ingest confirm step) reuse the same table that
 * costs actual llm_call rows.
 */
export function modelPricing(
  model: string,
): { input: number; output: number } | null {
  return PRICING[model] ?? null;
}

/**
 * The Anthropic adapter. The client is created lazily so the server boots
 * without an API key; calls then fail with a logged, non-retryable LlmError.
 * SDK auto-retry is disabled — the retry policy (and per-attempt llm_call
 * logging) lives in LlmService.
 */
export function createAnthropicProvider(
  apiKey: string | undefined,
): LlmProvider {
  let client: Anthropic | null = null;

  function getClient(): Anthropic {
    if (!apiKey) {
      throw new LlmError("ANTHROPIC_API_KEY is not configured", {
        retryable: false,
      });
    }
    client ??= new Anthropic({ apiKey, maxRetries: 0 });
    return client;
  }

  async function send(
    params: CompleteParams,
    content: Anthropic.Messages.ContentBlockParam[],
  ): Promise<LlmResponse> {
    let response: Anthropic.Message;
    try {
      response = await getClient().messages.create({
        model: params.model,
        max_tokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
        ...(params.system !== undefined ? { system: params.system } : {}),
        messages: [{ role: "user", content }],
      });
    } catch (err) {
      throw err instanceof LlmError ? err : toLlmError(err);
    }

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");
    const usage = response.usage;
    const cacheRead = usage.cache_read_input_tokens ?? 0;
    const cacheWrite = usage.cache_creation_input_tokens ?? 0;
    const price = PRICING[params.model];
    const costEstimateUsd = price
      ? (usage.input_tokens * price.input +
          cacheWrite * price.input * 1.25 +
          cacheRead * price.input * 0.1 +
          usage.output_tokens * price.output) /
        1e6
      : null;
    return {
      text,
      usage: {
        tokensIn: usage.input_tokens + cacheRead + cacheWrite,
        tokensOut: usage.output_tokens,
        cacheHit: cacheRead > 0,
        costEstimateUsd,
      },
    };
  }

  return {
    name: "anthropic",

    complete(params: CompleteParams): Promise<LlmResponse> {
      return send(params, [{ type: "text", text: params.prompt }]);
    },

    vision(params: VisionParams): Promise<LlmResponse> {
      const blocks: Anthropic.Messages.ContentBlockParam[] =
        params.attachments.map((att) =>
          att.kind === "pdf"
            ? {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: att.data.toString("base64"),
                },
              }
            : {
                type: "image",
                source: {
                  type: "base64",
                  media_type: (att.mediaType ??
                    "image/png") as Anthropic.Messages.Base64ImageSource["media_type"],
                  data: att.data.toString("base64"),
                },
              },
        );
      blocks.push({ type: "text", text: params.prompt });
      return send(params, blocks);
    },
  };
}

function toLlmError(err: unknown): LlmError {
  if (err instanceof Anthropic.APIError) {
    // Rate limits, overload, and 5xx are worth retrying; connection errors
    // (no status) too. 4xx request errors are not.
    const status = err.status;
    const retryable = status === undefined || status === 429 || status >= 500;
    return new LlmError(`anthropic: ${err.message}`, { retryable, cause: err });
  }
  return new LlmError(err instanceof Error ? err.message : String(err), {
    retryable: false,
    cause: err,
  });
}
