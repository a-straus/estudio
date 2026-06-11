export type Language = "es" | "en";

export type JobStatus = "queued" | "running" | "done" | "failed" | "cancelled";

/** Every /api error response has this shape, with a non-2xx status code. */
export interface ApiError {
  error: {
    message: string;
    code: string;
  };
}

export interface HealthResponse {
  status: "ok";
}

export type SourceType =
  | "pdf"
  | "text"
  | "lesson_audio"
  | "voice_question"
  | "gutenberg"
  | "mochi"
  | "manual"
  | "chat"
  | "suggestion";

export type SourcePageKind = "vocab" | "grammar";

export type SourcePageStatus = "pending" | "done" | "failed";

/** Camel-cased view of a `source` row. */
export interface SourceView {
  id: number;
  type: SourceType;
  title: string | null;
  ref: string | null;
  storedPath: string | null;
  transcript: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Camel-cased view of a `source_page` row. */
export interface SourcePageView {
  id: number;
  sourceId: number;
  pageNo: number;
  kind: SourcePageKind;
  status: SourcePageStatus;
  error: string | null;
  grammarTopicId: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Response body of POST /api/sources/pdf. */
export interface PdfUploadResponse {
  source: SourceView;
  jobId: number;
  pageCount: number;
}

/** Response body of GET /api/sources/:id. */
export interface SourceDetailResponse {
  source: SourceView;
  pages: SourcePageView[];
  progress: {
    total: number;
    pending: number;
    done: number;
    failed: number;
  };
}

/** Response body of POST /api/source-pages/:id/retry. */
export interface RetryPageResponse {
  jobId: number;
}

/** Camel-cased view of a `job` row as served by GET /api/jobs. */
export interface JobView {
  id: number;
  type: string;
  payload: unknown;
  status: JobStatus;
  progress: unknown | null;
  error: string | null;
  attempts: number;
  createdAt: string;
  updatedAt: string;
}
