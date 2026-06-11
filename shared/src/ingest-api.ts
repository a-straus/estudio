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
