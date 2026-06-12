import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { MulterError } from "multer";
import { openDb, type DB } from "./db/db.js";
import { runMigrations } from "./db/migrate.js";
import { JobQueue } from "./jobs/queue.js";
import { createApp, errorHandler } from "./app.js";

let dataDir: string;
let db: DB;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "estudio-app-"));
  db = openDb(dataDir);
  runMigrations(db, dataDir);
});

afterEach(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("GET /api/health", () => {
  it("returns ok against the migrated db", async () => {
    const res = await request(createApp(db)).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("GET /api/jobs", () => {
  it("lists jobs with camelCase keys", async () => {
    const queue = new JobQueue(db);
    queue.enqueue("text_ingestion", { hello: "world" });

    const res = await request(createApp(db)).get("/api/jobs");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      type: "text_ingestion",
      status: "queued",
      payload: { hello: "world" },
      attempts: 0,
    });
    expect(res.body[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(res.body[0]).not.toHaveProperty("created_at");
  });
});

describe("errorHandler", () => {
  // multer aborts an over-limit upload by passing a MulterError to next(),
  // which lands in the app-level error handler — drive that path directly
  // instead of streaming a real 50MB body.
  function appWith(err: unknown) {
    const app = express();
    app.post("/upload", (_req: Request, _res: Response, next: NextFunction) =>
      next(err),
    );
    app.use(errorHandler);
    return app;
  }

  it("maps multer's LIMIT_FILE_SIZE to 413 file_too_large", async () => {
    const res = await request(appWith(new MulterError("LIMIT_FILE_SIZE"))).post(
      "/upload",
    );
    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      error: {
        message: "the uploaded file is too large",
        code: "file_too_large",
      },
    });
  });

  it("still returns 500 internal_error for everything else", async () => {
    const res = await request(appWith(new Error("boom"))).post("/upload");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { message: "Internal server error", code: "internal_error" },
    });
  });
});

describe("unknown /api routes", () => {
  it("returns 404 with the { error: { message, code } } shape", async () => {
    const res = await request(createApp(db)).get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { message: "Not found", code: "not_found" },
    });
  });
});
