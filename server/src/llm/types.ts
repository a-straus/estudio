/**
 * Provider-neutral LLM seam. Adapters (anthropic.ts) implement LlmProvider
 * and translate their SDK's types/errors into these shapes — nothing
 * provider-specific may appear outside the adapter file.
 */

export interface LlmUsage {
  tokensIn: number;
  tokensOut: number;
  cacheHit: boolean;
  /** Null when the adapter has no pricing for the model. */
  costEstimateUsd: number | null;
}

export interface LlmResponse {
  text: string;
  usage: LlmUsage;
}

export interface CompleteParams {
  model: string;
  prompt: string;
  system?: string;
  maxTokens?: number;
}

/** A page rendered/embedded for the vision API: raw PDF bytes or an image. */
export interface VisionAttachment {
  kind: "pdf" | "image";
  data: Buffer;
  /** Required for images (e.g. "image/png"); ignored for PDFs. */
  mediaType?: string;
}

export interface VisionParams extends CompleteParams {
  attachments: VisionAttachment[];
}

export interface LlmProvider {
  readonly name: string;
  complete(params: CompleteParams): Promise<LlmResponse>;
  vision(params: VisionParams): Promise<LlmResponse>;
}

/** Normalized provider error; `retryable` drives the service's backoff loop. */
export class LlmError extends Error {
  readonly retryable: boolean;

  constructor(message: string, opts: { retryable: boolean; cause?: unknown }) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : {});
    this.name = "LlmError";
    this.retryable = opts.retryable;
  }
}
