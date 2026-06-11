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
