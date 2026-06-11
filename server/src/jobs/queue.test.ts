import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb, type DB } from "../db/db.js";
import { runMigrations } from "../db/migrate.js";
import { logger } from "../logger.js";
import { JobQueue } from "./queue.js";
import { registerDemoHandler } from "./handlers.js";

let dataDir: string;
let db: DB;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "estudio-queue-"));
  db = openDb(dataDir);
  runMigrations(db, dataDir);
});

afterEach(() => {
  logger.detachDb();
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function jobRow(id: number) {
  return db
    .prepare("SELECT status, attempts, error, progress FROM job WHERE id = ?")
    .get(id) as {
    status: string;
    attempts: number;
    error: string | null;
    progress: string | null;
  };
}

describe("JobQueue", () => {
  it("runs a queued job to done (demo handler)", async () => {
    const queue = new JobQueue(db, { backoffBaseMs: 0 });
    registerDemoHandler(queue);
    const id = queue.enqueue("demo", { hello: "world" });

    expect(jobRow(id).status).toBe("queued");
    expect(await queue.tick()).toBe(true);

    const row = jobRow(id);
    expect(row.status).toBe("done");
    expect(row.attempts).toBe(1);
    expect(JSON.parse(row.progress!)).toEqual({ echoed: { hello: "world" } });
    expect(await queue.tick()).toBe(false);
  });

  it("retries a failing job and succeeds on a later attempt", async () => {
    const queue = new JobQueue(db, { backoffBaseMs: 0 });
    let calls = 0;
    queue.register(
      "flaky",
      () => {
        calls += 1;
        if (calls === 1) throw new Error("transient failure");
        return "ok";
      },
      { maxAttempts: 3 },
    );
    const id = queue.enqueue("flaky", null);

    await queue.tick();
    let row = jobRow(id);
    expect(row.status).toBe("queued");
    expect(row.attempts).toBe(1);
    expect(row.error).toContain("transient failure");

    await queue.tick();
    row = jobRow(id);
    expect(row.status).toBe("done");
    expect(row.attempts).toBe(2);
  });

  it("respects exponential backoff between retries", async () => {
    const queue = new JobQueue(db, { backoffBaseMs: 60_000 });
    queue.register("alwaysfail", () => {
      throw new Error("boom");
    });
    const id = queue.enqueue("alwaysfail", null);

    await queue.tick();
    expect(jobRow(id).attempts).toBe(1);
    // Next retry is ~60s out, so an immediate tick claims nothing.
    expect(await queue.tick()).toBe(false);
    expect(jobRow(id).attempts).toBe(1);
  });

  it("persists error + stack and marks failed after the attempts limit", async () => {
    logger.attachDb(db); // failed jobs also land in error_log
    const queue = new JobQueue(db, { backoffBaseMs: 0 });
    queue.register(
      "doomed",
      () => {
        throw new Error("permanent failure");
      },
      { maxAttempts: 2 },
    );
    const id = queue.enqueue("doomed", { n: 1 });

    await queue.tick();
    await queue.tick();

    const row = jobRow(id);
    expect(row.status).toBe("failed");
    expect(row.attempts).toBe(2);
    expect(row.error).toContain("permanent failure");
    expect(row.error).toContain("at "); // stack trace persisted

    const errors = db.prepare("SELECT message, stack FROM error_log").all() as {
      message: string;
      stack: string | null;
    }[];
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!.stack).toContain("permanent failure");
  });

  it("fails a job whose type has no registered handler", async () => {
    const queue = new JobQueue(db, { backoffBaseMs: 0 });
    const id = queue.enqueue("mystery", null);
    await queue.tick();
    await queue.tick();
    await queue.tick();
    const row = jobRow(id);
    expect(row.status).toBe("failed");
    expect(row.error).toContain("No handler registered");
  });

  it("reverts running jobs to queued on boot", () => {
    const queue = new JobQueue(db);
    const id = queue.enqueue("demo", null);
    db.prepare("UPDATE job SET status = 'running' WHERE id = ?").run(id);

    const reverted = queue.recoverRunningJobs();
    expect(reverted).toBe(1);
    expect(jobRow(id).status).toBe("queued");
  });
});
