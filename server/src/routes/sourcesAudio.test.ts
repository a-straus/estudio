import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express, { type Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb, type DB } from "../db/db.js";
import { runMigrations } from "../db/migrate.js";
import { logger } from "../logger.js";
import { JobQueue } from "../jobs/queue.js";
import { registerSourceRoutes } from "./sources.js";

let dataDir: string;
let db: DB;
let queue: JobQueue;
let app: Express;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "estudio-audio-route-"));
  db = openDb(dataDir);
  runMigrations(db, dataDir);
  queue = new JobQueue(db, { backoffBaseMs: 0 });
  app = express();
  app.use(express.json());
  // Stub the duration seam: 30 minutes regardless of bytes — no real audio.
  registerSourceRoutes(app, db, queue, dataDir, {
    readAudioDuration: async () => 30,
  });
});

afterEach(() => {
  logger.detachDb();
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("POST /api/sources/audio", () => {
  it("stores the recording, creates a lesson_audio source, and returns a cost estimate", async () => {
    const res = await request(app)
      .post("/api/sources/audio")
      .field("title", "Tuesday lesson")
      .attach("file", Buffer.from("fake-audio-bytes"), "lesson.m4a");

    expect(res.status).toBe(201);
    expect(res.body.source).toMatchObject({
      type: "lesson_audio",
      title: "Tuesday lesson",
      ref: "lesson.m4a",
    });
    expect(res.body.jobId).toBeGreaterThan(0);
    // 30 min * $0.006/min = $0.18.
    expect(res.body.costEstimateUsd).toBeCloseTo(0.18, 6);

    // Original bytes persisted under DATA_DIR/uploads.
    const storedPath = res.body.source.storedPath as string;
    expect(storedPath.startsWith(path.join(dataDir, "uploads"))).toBe(true);
    expect(fs.readFileSync(storedPath).toString()).toBe("fake-audio-bytes");

    const job = db
      .prepare("SELECT type, status, payload FROM job WHERE id = ?")
      .get(res.body.jobId) as { type: string; status: string; payload: string };
    expect(job.type).toBe("lesson_audio_ingestion");
    expect(job.status).toBe("queued");
    expect(JSON.parse(job.payload)).toEqual({
      sourceId: res.body.source.id,
      jobId: res.body.jobId,
    });
  });

  it("defaults the title from the filename", async () => {
    const res = await request(app)
      .post("/api/sources/audio")
      .attach("file", Buffer.from("x"), "Clase del martes.mp3");
    expect(res.status).toBe(201);
    expect(res.body.source.title).toBe("Clase del martes");
  });

  it("accepts every allowed audio extension", async () => {
    for (const ext of [
      "m4a",
      "mp3",
      "mp4",
      "ogg",
      "oga",
      "webm",
      "aac",
      "flac",
      "opus",
      "wav",
    ]) {
      const res = await request(app)
        .post("/api/sources/audio")
        .attach("file", Buffer.from("x"), `rec.${ext}`);
      expect(res.status).toBe(201);
    }
  });

  it("rejects a non-audio extension without creating rows", async () => {
    const res = await request(app)
      .post("/api/sources/audio")
      .attach("file", Buffer.from("not audio"), "notes.txt");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_audio");
    expect(db.prepare("SELECT COUNT(*) AS c FROM source").get()).toEqual({
      c: 0,
    });
  });

  it("rejects a request without a file", async () => {
    const res = await request(app).post("/api/sources/audio");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("missing_file");
  });

  it("rejects an unreadable audio file (no duration metadata) without creating rows", async () => {
    const localApp = express();
    localApp.use(express.json());
    registerSourceRoutes(localApp, db, queue, dataDir, {
      readAudioDuration: async () => {
        throw new Error("could not read a valid audio duration");
      },
    });
    const res = await request(localApp)
      .post("/api/sources/audio")
      .attach("file", Buffer.from("garbage"), "broken.m4a");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_audio");
    expect(db.prepare("SELECT COUNT(*) AS c FROM source").get()).toEqual({
      c: 0,
    });
  });
});
