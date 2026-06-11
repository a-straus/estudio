import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { openDb, type DB } from "../db/db.js";
import { runMigrations } from "../db/migrate.js";
import { logger } from "../logger.js";
import { JobQueue } from "./queue.js";
import {
  backupStatus,
  backupsDir,
  enqueueBackupIfDue,
  JOB_TYPE_BACKUP,
  registerBackupHandler,
  runBackup,
} from "./backup.js";

let dataDir: string;
let db: DB;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "estudio-backup-"));
  db = openDb(dataDir);
  runMigrations(db, dataDir);
});

afterEach(() => {
  logger.detachDb();
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("runBackup", () => {
  it("writes a timestamped copy that opens as a valid DB", async () => {
    const { filename } = await runBackup(db, dataDir);

    expect(filename).toMatch(/^app-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.db$/);
    const full = path.join(backupsDir(dataDir), filename);
    expect(fs.existsSync(full)).toBe(true);

    // The copy is a real SQLite DB with the migrated schema.
    const reopened = new Database(full);
    const decks = reopened
      .prepare("SELECT COUNT(*) AS c FROM deck")
      .get() as { c: number };
    expect(decks.c).toBe(2); // the two seeded decks
    reopened.close();
  });

  it("prunes to the most recent 14 backups, keeping the newest", async () => {
    const dir = backupsDir(dataDir);
    fs.mkdirSync(dir, { recursive: true });
    // 20 pre-existing backups with ascending (older→newer) ISO timestamps.
    const existing: string[] = [];
    for (let i = 0; i < 20; i++) {
      const hh = String(i).padStart(2, "0");
      const name = `app-2026-06-01T${hh}-00-00Z.db`;
      fs.writeFileSync(path.join(dir, name), "stub");
      existing.push(name);
    }

    // A fresh backup (newest of all) triggers pruning.
    const { filename } = await runBackup(db, dataDir);

    const remaining = fs
      .readdirSync(dir)
      .filter((f) => /^app-.*\.db$/.test(f))
      .sort();
    expect(remaining).toHaveLength(14);
    // The newest real backup survives…
    expect(remaining).toContain(filename);
    // …as do the 13 newest stubs; the oldest stubs are gone.
    expect(remaining).toContain(existing[19]);
    expect(remaining).not.toContain(existing[0]);
    expect(remaining).not.toContain(existing[6]);
  });
});

describe("backupStatus", () => {
  it("reports the latest backup filename, timestamp, and count", async () => {
    // runMigrations already wrote one pre-migration backup into the same dir.
    const before = backupStatus(dataDir);
    expect(before.count).toBeGreaterThanOrEqual(1);

    const { filename } = await runBackup(db, dataDir);
    const status = backupStatus(dataDir);
    expect(status.latestFilename).toBe(filename);
    expect(status.count).toBeGreaterThanOrEqual(1);
    expect(status.latestTs).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("reports nothing for a directory with no backups", () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "estudio-empty-"));
    expect(backupStatus(empty)).toEqual({
      latestFilename: null,
      latestTs: null,
      count: 0,
    });
    fs.rmSync(empty, { recursive: true, force: true });
  });
});

describe("backup scheduling + handler", () => {
  it("registers a handler the queue can run end-to-end", async () => {
    const queue = new JobQueue(db, { backoffBaseMs: 0 });
    registerBackupHandler(queue, db, dataDir);

    const jobId = queue.enqueue(JOB_TYPE_BACKUP, {});
    expect(await queue.tick()).toBe(true);

    const row = db
      .prepare("SELECT status, progress FROM job WHERE id = ?")
      .get(jobId) as { status: string; progress: string | null };
    expect(row.status).toBe("done");
    expect(JSON.parse(row.progress!).filename).toMatch(/^app-.*\.db$/);
    expect(backupStatus(dataDir).count).toBeGreaterThanOrEqual(1);
  });

  it("enqueueBackupIfDue enqueues on a cold DB and skips within the window", () => {
    const queue = new JobQueue(db, { backoffBaseMs: 0 });

    const first = enqueueBackupIfDue(db, queue);
    expect(first).not.toBeNull();

    // A second call within the 24h window is a no-op.
    const second = enqueueBackupIfDue(db, queue);
    expect(second).toBeNull();

    // With a tiny window, a backup older than the window re-enqueues.
    const third = enqueueBackupIfDue(db, queue, 0);
    expect(third).not.toBeNull();
  });
});
