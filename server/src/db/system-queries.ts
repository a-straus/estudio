import fs from "node:fs";
import type {
  JobView,
  SystemErrorView,
  SystemSpendResponse,
  SystemSpendTask,
  SystemStatusResponse,
} from "@estudio/shared";
import { type DB } from "./db.js";

// snake_case → camelCase mapping happens here, at the query layer.

const RECENT_CAP = 50;

interface ErrorRowDb {
  ts: string;
  scope: SystemErrorView["scope"];
  message: string;
  detail: string | null;
}

/** Most recent error_log rows, newest first (cap ~50). */
export function listRecentErrors(db: DB): SystemErrorView[] {
  return db
    .prepare(
      "SELECT ts, scope, message, detail FROM error_log ORDER BY id DESC LIMIT ?",
    )
    .all(RECENT_CAP) as ErrorRowDb[];
}

interface JobRowDb {
  id: number;
  type: string;
  payload: string;
  status: JobView["status"];
  progress: string | null;
  error: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
}

/** Recent job rows, newest first (cap ~50). */
export function listRecentJobs(db: DB): JobView[] {
  const rows = db
    .prepare(
      "SELECT id, type, payload, status, progress, error, attempts, created_at, updated_at FROM job ORDER BY id DESC LIMIT ?",
    )
    .all(RECENT_CAP) as JobRowDb[];
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

interface SpendRowDb {
  task: string;
  cost: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
  calls: number;
}

/**
 * Cumulative LLM spend from llm_call: totals plus a per-task breakdown. Error
 * calls are included in the counts (a failed call can still have burned tokens),
 * and null cost/tokens coalesce to 0.
 */
export function getSpend(db: DB): SystemSpendResponse {
  const rows = db
    .prepare(
      `SELECT task,
              COALESCE(SUM(cost_estimate_usd), 0) AS cost,
              COALESCE(SUM(tokens_in), 0) AS tokens_in,
              COALESCE(SUM(tokens_out), 0) AS tokens_out,
              COUNT(*) AS calls
         FROM llm_call
        GROUP BY task
        ORDER BY cost DESC, task ASC`,
    )
    .all() as SpendRowDb[];

  const byTask: SystemSpendTask[] = rows.map((r) => ({
    task: r.task,
    costUsd: r.cost ?? 0,
    tokensIn: r.tokens_in ?? 0,
    tokensOut: r.tokens_out ?? 0,
    callCount: r.calls,
  }));

  return {
    totalCostUsd: byTask.reduce((s, t) => s + t.costUsd, 0),
    totalTokensIn: byTask.reduce((s, t) => s + t.tokensIn, 0),
    totalTokensOut: byTask.reduce((s, t) => s + t.tokensOut, 0),
    callCount: byTask.reduce((s, t) => s + t.callCount, 0),
    byTask,
  };
}

/** DB file status for GET /api/system/status: path, on-disk size, WAL mode. */
export function getDbStatus(db: DB): SystemStatusResponse["db"] {
  const journalMode = db.pragma("journal_mode", { simple: true }) as string;
  let fileSizeBytes = 0;
  try {
    fileSizeBytes = fs.statSync(db.name).size;
  } catch {
    // An in-memory or just-created DB may have no file yet; report 0.
  }
  return {
    path: db.name,
    fileSizeBytes,
    walMode: journalMode.toLowerCase() === "wal",
  };
}
