import {
  TranscriptionError,
  type TranscribeParams,
  type TranscriptionProvider,
  type TranscriptionResult,
} from "./types.js";

// OpenAI Whisper list price, USD per audio minute. Pricing lives in the adapter
// (like the LLM adapter); nothing else hardcodes a rate.
export const WHISPER_USD_PER_MINUTE = 0.006;

/**
 * Upfront USD estimate for transcribing `minutes` of audio at the Whisper rate.
 * Pure function — the System/UI surfaces "~$0.36/hr" (= 60 * $0.006 ~= GOAL's ~$0.40 estimate).
 */
export function estimateWhisperCostUsd(minutes: number): number {
  return minutes * WHISPER_USD_PER_MINUTE;
}

const TRANSCRIBE_URL = "https://api.openai.com/v1/audio/transcriptions";

/**
 * The OpenAI Whisper adapter. The API key is read once at boot and captured
 * here; calls without one fail with a logged, non-retryable TranscriptionError.
 * The retry policy and per-call transcription_call logging live in
 * TranscriptionService, so this adapter makes exactly one HTTP request per call.
 */
export function createOpenAiProvider(
  apiKey: string | undefined,
): TranscriptionProvider {
  return {
    name: "openai",

    async transcribe(params: TranscribeParams): Promise<TranscriptionResult> {
      if (!apiKey) {
        throw new TranscriptionError("OPENAI_API_KEY is not configured", {
          retryable: false,
        });
      }

      const form = new FormData();
      // A fresh Uint8Array view avoids handing a pooled Buffer's backing store
      // (with its sibling bytes) to Blob.
      form.append(
        "file",
        new Blob([new Uint8Array(params.audio)]),
        params.filename,
      );
      form.append("model", params.model);

      let res: Response;
      try {
        res = await fetch(TRANSCRIBE_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
        });
      } catch (err) {
        // No HTTP response at all — a transient network failure is worth retrying.
        throw new TranscriptionError(
          `openai: network error: ${err instanceof Error ? err.message : String(err)}`,
          { retryable: true, cause: err },
        );
      }

      if (!res.ok) {
        // 429 and 5xx are transient; 4xx (auth/validation) are not.
        const retryable = res.status === 429 || res.status >= 500;
        const body = await res.text().catch(() => "");
        throw new TranscriptionError(
          `openai: ${res.status} ${body.slice(0, 200)}`,
          { retryable },
        );
      }

      const json = (await res.json()) as { text?: string };
      return {
        text: json.text ?? "",
        usage: {
          minutes: params.minutes,
          cacheHit: false,
          costEstimateUsd: estimateWhisperCostUsd(params.minutes),
        },
      };
    },
  };
}
