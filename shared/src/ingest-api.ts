// Ingest API request/response types.
import type { Language } from "./types.js";

/** Request body of POST /api/sources/text. `language` omitted → auto-detect. */
export interface TextIngestRequest {
  title?: string;
  text: string;
  language?: Language;
}

/** Response body of POST /api/sources/text. */
export interface TextIngestResponse {
  sourceId: number;
  jobId: number;
  /** Number of source_page chunks the paste was split into. */
  pageCount: number;
}

/**
 * Request body of POST /api/sources/gutenberg. `ref` is a bare Project
 * Gutenberg ebook id ("10") or a full ebooks URL ("gutenberg.org/ebooks/10").
 */
export interface GutenbergIngestRequest {
  ref: string;
  title?: string;
}

/**
 * Response body of POST /api/sources/gutenberg — the upfront estimate. The
 * expensive classification job is NOT started here; the owner confirms it via
 * POST /api/sources/gutenberg/:id/confirm once they've seen the spend.
 */
export interface GutenbergEstimateResponse {
  sourceId: number;
  /** Book title, derived from the Gutenberg header when present, else the ref. */
  title: string;
  /** Unique candidate words left after the local token-reduction pre-pass. */
  wordCount: number;
  /** Number of LLM classification batches (= source_page chunks). */
  batches: number;
  /** Upfront USD cost estimate for the full classification run. */
  estimateUsd: number;
}

/** Response body of POST /api/sources/gutenberg/:id/confirm. */
export interface GutenbergConfirmResponse {
  sourceId: number;
  jobId: number;
  /** Number of source_page chunks the candidate words were split into. */
  pageCount: number;
}

/**
 * Triage coverage for a source (GET /api/sources/:id/coverage). "untested" =
 * kept ('learn') words materialized into the deck that have no review history
 * yet (no card_state and no review_log row).
 */
export interface SourceCoverage {
  /** Total extraction candidates for the source. */
  total: number;
  /** Candidates the owner has sorted (decision != 'pending'). */
  triaged: number;
  /** 'learn' decisions materialized into a word row. */
  kept: number;
  /** Of the kept words, how many have no review history yet. */
  untested: number;
}
