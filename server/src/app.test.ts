import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb, type DB } from "./db/db.js";
import { runMigrations } from "./db/migrate.js";
import { JobQueue } from "./jobs/queue.js";
import { createApp } from "./app.js";

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
    queue.enqueue("demo", { hello: "world" });

    const res = await request(createApp(db)).get("/api/jobs");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      type: "demo",
      status: "queued",
      payload: { hello: "world" },
      attempts: 0,
    });
    expect(res.body[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(res.body[0]).not.toHaveProperty("created_at");
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
