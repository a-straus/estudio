import type { JobStatus, JobView } from "@estudio/shared";
import type { DB } from "./db.js";

// snake_case → camelCase mapping happens here, at the query layer.

interface JobRowDb {
  id: number;
  type: string;
  payload: string;
  status: JobStatus;
  progress: string | null;
  error: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
}

export function listJobs(db: DB): JobView[] {
  const rows = db
    .prepare(
      "SELECT id, type, payload, status, progress, error, attempts, created_at, updated_at FROM job ORDER BY id DESC",
    )
    .all() as JobRowDb[];
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    payload: JSON.parse(r.payload),
    status: r.status,
    progress: r.progress === null ? null : JSON.parse(r.progress),
    error: r.error,
    attempts: r.attempts,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}
