import fs from "node:fs";
import path from "node:path";
import type { SystemStatusResponse } from "@estudio/shared";
import { nowIso, type DB } from "../db/db.js";
import { logger } from "../logger.js";
import type { JobQueue } from "./queue.js";

export const JOB_TYPE_BACKUP = "db_backup";

/** The backup job carries no input. */
export type BackupPayload = Record<string, never>;

export interface BackupResult {
  filename: string;
}

/** Keep the most recent 14 backups; older ones are pruned after each run. */
const KEEP_BACKUPS = 14;
/** Re-enqueue cadence + the "has one run recently?" window. */
export const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** <dataDir>/backups — where timestamped DB copies live. */
export function backupsDir(dataDir: string): string {
  return path.join(dataDir, "backups");
}

/** Backup filenames are app-<iso>.db with `:` swapped for `-` so they sort chronologically. */
function backupFilename(ts: string): string {
  return `app-${ts.replace(/:/g, "-")}.db`;
}

/** Existing backup files, newest first (ISO timestamps sort lexically). */
function listBackupFiles(dataDir: string): string[] {
  const dir = backupsDir(dataDir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^app-.*\.db$/.test(f))
    .sort()
    .reverse();
}

/**
 * Copy the SQLite DB to <dataDir>/backups/app-<ts>.db using better-sqlite3's
 * online backup (safe while the DB is in use), then prune to the most recent
 * 14. The same code path serves both the scheduled job and the manual button.
 */
export async function runBackup(db: DB, dataDir: string): Promise<BackupResult> {
  const dir = backupsDir(dataDir);
  fs.mkdirSync(dir, { recursive: true });

  const filename = backupFilename(nowIso());
  await db.backup(path.join(dir, filename));

  const stale = listBackupFiles(dataDir).slice(KEEP_BACKUPS);
  for (const old of stale) {
    fs.rmSync(path.join(dir, old), { force: true });
  }

  logger.info("db backup created", {
    filename,
    pruned: stale.length,
    kept: Math.min(KEEP_BACKUPS, listBackupFiles(dataDir).length),
  });
  return { filename };
}

/** Backup status for GET /api/system/status: newest filename + mtime + count. */
export function backupStatus(dataDir: string): SystemStatusResponse["backup"] {
  const files = listBackupFiles(dataDir);
  if (files.length === 0) {
    return { latestFilename: null, latestTs: null, count: 0 };
  }
  const latest = files[0]!;
  const stat = fs.statSync(path.join(backupsDir(dataDir), latest));
  return {
    latestFilename: latest,
    latestTs: stat.mtime.toISOString().replace(/\.\d{3}Z$/, "Z"),
    count: files.length,
  };
}

/** Register the db_backup job handler. */
export function registerBackupHandler(
  queue: JobQueue,
  db: DB,
  dataDir: string,
): void {
  queue.register(JOB_TYPE_BACKUP, () => runBackup(db, dataDir));
}

/** ISO-8601 timestamp the most recent backup job was created, or null. */
export function lastBackupJobAt(db: DB): string | null {
  const row = db
    .prepare("SELECT MAX(created_at) AS ts FROM job WHERE type = ?")
    .get(JOB_TYPE_BACKUP) as { ts: string | null };
  return row.ts;
}

/**
 * Enqueue a backup on boot only if none has been queued in the last 24h, so a
 * restart loop never floods the queue. Returns the job id, or null if skipped.
 */
export function enqueueBackupIfDue(
  db: DB,
  queue: JobQueue,
  intervalMs = BACKUP_INTERVAL_MS,
): number | null {
  const last = lastBackupJobAt(db);
  if (last && Date.now() - Date.parse(last) < intervalMs) return null;
  return queue.enqueue(JOB_TYPE_BACKUP, {});
}
