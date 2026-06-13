import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import express, { type Express } from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  SystemBackupResponse,
  SystemErrorsResponse,
  SystemJobsResponse,
  SystemSpendResponse,
  SystemStatusResponse,
} from "@estudio/shared";
import { errorHandler } from "../app.js";
import { openDb, nowIso, type DB } from "../db/db.js";
import { runMigrations } from "../db/migrate.js";
import { logger } from "../logger.js";
import { backupsDir } from "../jobs/backup.js";
import { registerSystemRoutes } from "./system.js";

let dataDir: string;
let db: DB;
let app: Express;

function seed(db: DB): void {
  // Two LLM calls for one task (one ok, one error) + one for another task.
  const insertLlm = db.prepare(
    `INSERT INTO llm_call
       (task, provider, model, tokens_in, tokens_out, latency_ms, cost_estimate_usd, status, error, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const now = nowIso();
  insertLlm.run("word_definition", "anthropic", "m", 100, 50, 10, 0.01, "ok", null, now, now);
  insertLlm.run("word_definition", "anthropic", "m", 200, 0, 10, 0.02, "error", "boom", now, now);
  insertLlm.run("pdf_extraction", "anthropic", "m", 500, 300, 10, 0.1, "ok", null, now, now);

  // Two transcription calls (one ok, one error) — error still counts.
  const insertTr = db.prepare(
    `INSERT INTO transcription_call
       (task, provider, model, minutes, latency_ms, cost_estimate_usd, status, error, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  insertTr.run("lesson_audio", "openai", "whisper-1", 60, 100, 0.36, "ok", null, now, now);
  insertTr.run("lesson_audio", "openai", "whisper-1", null, 100, null, "error", "boom", now, now);

  // A couple of jobs.
  db.prepare(
    "INSERT INTO job (type, payload, status, attempts, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run("db_backup", "{}", "done", 1, now, now);
  db.prepare(
    "INSERT INTO job (type, payload, status, attempts, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run("text_ingestion", "{}", "failed", 3, now, now);

  // An error_log row.
  db.prepare(
    "INSERT INTO error_log (ts, scope, message, detail) VALUES (?, ?, ?, ?)",
  ).run(now, "job", "job failed permanently", JSON.stringify({ jobId: 2 }));
}

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "estudio-system-r-"));
  db = openDb(dataDir);
  runMigrations(db, dataDir);
  seed(db);

  app = express();
  app.use(express.json());
  registerSystemRoutes(app, db, dataDir);
  app.use(errorHandler);
});

afterEach(() => {
  logger.detachDb();
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("system routes", () => {
  it("GET /api/system/errors returns recent error_log rows", async () => {
    const res = await request(app).get("/api/system/errors").expect(200);
    const body = res.body as SystemErrorsResponse;
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0]).toMatchObject({
      scope: "job",
      message: "job failed permanently",
    });
    expect(typeof body.errors[0]!.detail).toBe("string");
  });

  it("GET /api/system/jobs returns recent jobs newest-first with camelCase keys", async () => {
    const res = await request(app).get("/api/system/jobs").expect(200);
    const body = res.body as SystemJobsResponse;
    expect(body.jobs).toHaveLength(2);
    // Newest (highest id) first.
    expect(body.jobs[0]!.type).toBe("text_ingestion");
    expect(body.jobs[0]).toHaveProperty("createdAt");
    expect(body.jobs[0]).not.toHaveProperty("created_at");
  });

  it("GET /api/system/spend aggregates totals + per-task, counting error calls", async () => {
    const res = await request(app).get("/api/system/spend").expect(200);
    const body = res.body as SystemSpendResponse;
    expect(body.callCount).toBe(3);
    expect(body.totalCostUsd).toBeCloseTo(0.13, 5);
    expect(body.totalTokensIn).toBe(800);
    expect(body.totalTokensOut).toBe(350);

    const wd = body.byTask.find((t) => t.task === "word_definition")!;
    // Both the ok and error call count toward word_definition.
    expect(wd.callCount).toBe(2);
    expect(wd.costUsd).toBeCloseTo(0.03, 5);

    // Transcription spend is reported separately; the error call still counts.
    expect(body.transcription.callCount).toBe(2);
    expect(body.transcription.totalCostUsd).toBeCloseTo(0.36, 5);
    expect(body.transcription.totalMinutes).toBe(60);
  });

  it("GET /api/system/status reports DB + backup status", async () => {
    const res = await request(app).get("/api/system/status").expect(200);
    const body = res.body as SystemStatusResponse;
    expect(body.db.path).toMatch(/app\.db$/);
    expect(body.db.fileSizeBytes).toBeGreaterThan(0);
    expect(body.db.walMode).toBe(true);
    // runMigrations wrote a pre-migration backup into the same backups dir.
    expect(body.backup.count).toBeGreaterThanOrEqual(1);
    expect(body.backup.latestFilename).toMatch(/^app-.*\.db$/);
    expect(body.backup.latestTs).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("POST /api/system/backup creates a backup and 201s with the filename", async () => {
    const res = await request(app).post("/api/system/backup").expect(201);
    const body = res.body as SystemBackupResponse;
    expect(body.filename).toMatch(/^app-.*\.db$/);
    expect(
      fs.existsSync(path.join(backupsDir(dataDir), body.filename)),
    ).toBe(true);

    // Status now reflects it as the newest backup.
    const status = (await request(app).get("/api/system/status").expect(200))
      .body as SystemStatusResponse;
    expect(status.backup.count).toBeGreaterThanOrEqual(1);
    expect(status.backup.latestFilename).toBe(body.filename);
  });

  it("GET /api/system/export returns a JSON attachment with all tables and seeded data", async () => {
    const res = await request(app).get("/api/system/export").expect(200);
    expect(res.headers["content-disposition"]).toMatch(/^attachment/);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    const dump = res.body as {
      version: number;
      exportedAt: string;
      tables: Record<string, unknown[]>;
    };
    expect(dump.version).toBe(1);
    expect(dump.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(typeof dump.tables).toBe("object");
    // seeded rows appear: seed() inserts llm_call and job rows
    expect(Array.isArray(dump.tables["llm_call"])).toBe(true);
    expect(dump.tables["llm_call"]!.length).toBeGreaterThan(0);
    expect(Array.isArray(dump.tables["job"])).toBe(true);
    expect(dump.tables["job"]!.length).toBeGreaterThan(0);
  });

  it("GET /api/system/backup/download returns 404 when no backups exist", async () => {
    fs.rmSync(backupsDir(dataDir), { recursive: true, force: true });
    const res = await request(app)
      .get("/api/system/backup/download")
      .expect(404);
    expect(res.body).toMatchObject({ error: { code: "no_backup" } });
  });

  it("GET /api/system/backup/download streams the latest backup as an attachment", async () => {
    // Ensure a backup exists (migration may have already created one, but be explicit).
    await request(app).post("/api/system/backup").expect(201);
    const res = await request(app)
      .get("/api/system/backup/download")
      .expect(200);
    expect(res.headers["content-disposition"]).toMatch(/^attachment/);
    expect(res.headers["content-disposition"]).toMatch(/\.db/);
  });
});
