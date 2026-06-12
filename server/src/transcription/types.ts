/**
 * Provider-neutral transcription seam, mirroring the LLM layer (../llm/types.ts).
 * Adapters (openai.ts) implement TranscriptionProvider and translate their
 * HTTP/SDK types and errors into these shapes — nothing provider-specific may
 * appear outside the adapter file.
 */

export interface TranscriptionUsage {
  /** Audio duration transcribed, in minutes — the analog of LlmUsage tokens. */
  minutes: number;
  cacheHit: boolean;
  /** Null when the adapter has no pricing for the model. */
  costEstimateUsd: number | null;
}

export interface TranscriptionResult {
  text: string;
  usage: TranscriptionUsage;
}

/** A single transcribe request: one audio payload under the provider's limit. */
export interface TranscribeParams {
  model: string;
  /** The audio bytes for this request (already under the per-request limit). */
  audio: Buffer;
  /** Source filename, e.g. "lesson.m4a" — drives the multipart upload + format. */
  filename: string;
  /** Duration of this audio in minutes, used for the cost estimate. */
  minutes: number;
}

export interface TranscriptionProvider {
  readonly name: string;
  transcribe(params: TranscribeParams): Promise<TranscriptionResult>;
}

/** A full recording handed to the service before any chunking. */
export interface AudioInput {
  data: Buffer;
  /** Source filename, e.g. "lesson.m4a" — its extension drives format handling. */
  filename: string;
  /** Total duration of the recording in minutes. */
  minutes: number;
}

/** One ordered slice of an AudioInput, sized to fit the per-request limit. */
export interface AudioChunk {
  data: Buffer;
  filename: string;
  minutes: number;
}

/**
 * Injectable audio-splitting seam: given a recording and a per-request byte
 * limit, return ordered chunks that each fit under it. Made a dependency so the
 * service's chunk → transcribe → stitch orchestration is unit-testable with a
 * mock splitter.
 */
export type SplitAudio = (input: AudioInput, maxBytes: number) => AudioChunk[];

/** Normalized provider error; `retryable` drives the service's backoff loop. */
export class TranscriptionError extends Error {
  readonly retryable: boolean;

  constructor(message: string, opts: { retryable: boolean; cause?: unknown }) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : {});
    this.name = "TranscriptionError";
    this.retryable = opts.retryable;
  }
}
