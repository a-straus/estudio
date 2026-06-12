// System page API payload types — shared by the system routes (server) and the
// System screen (web). JSON is camelCase. The System page is the machine's
// honest ledger: spend, jobs, errors, backups.

import type { JobView } from "./types.js";

/** One error_log row, surfaced newest-first. */
export interface SystemErrorView {
  ts: string;
  scope: "request" | "job" | "llm" | "transcription";
  message: string;
  detail: string | null;
}

/** GET /api/system/errors — most recent error_log rows (cap ~50). */
export interface SystemErrorsResponse {
  errors: SystemErrorView[];
}

/** GET /api/system/jobs — recent job rows, newest first (cap ~50). */
export interface SystemJobsResponse {
  jobs: JobView[];
}

/** Cumulative LLM spend for one task. Counts include status='error' calls. */
export interface SystemSpendTask {
  task: string;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  callCount: number;
}

/**
 * Cumulative transcription spend over transcription_call. A second paid
 * provider, reported separately from LLM spend. Counts include status='error'.
 */
export interface SystemTranscriptionSpend {
  totalCostUsd: number;
  totalMinutes: number;
  callCount: number;
}

/** GET /api/system/spend — cumulative LLM spend plus a per-task breakdown. */
export interface SystemSpendResponse {
  totalCostUsd: number;
  totalTokensIn: number;
  totalTokensOut: number;
  callCount: number;
  byTask: SystemSpendTask[];
  /** Transcription spend, reported as its own line in the same SPEND section. */
  transcription: SystemTranscriptionSpend;
}

/** GET /api/system/status — DB file + backup status. */
export interface SystemStatusResponse {
  db: {
    path: string;
    fileSizeBytes: number;
    walMode: boolean;
  };
  backup: {
    /** Newest backup filename, or null when none exist yet. */
    latestFilename: string | null;
    /** ISO-8601 UTC mtime of the newest backup, or null. */
    latestTs: string | null;
    count: number;
  };
}

/** POST /api/system/backup — trigger a manual backup; returns the new filename. */
export interface SystemBackupResponse {
  filename: string;
}
