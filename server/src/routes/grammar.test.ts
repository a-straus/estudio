import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import express, { type Express } from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GrammarHomeResponse, GrammarSeedResponse } from "@estudio/shared";
import { errorHandler } from "../app.js";
import { openDb, type DB } from "../db/db.js";
import { runMigrations } from "../db/migrate.js";
import { logger } from "../logger.js";
import { LlmService } from "../llm/service.js";
import type { LlmProvider } from "../llm/types.js";
import { JobQueue } from "../jobs/queue.js";
import { registerGrammarSeedHandler } from "../jobs/handlers.js";
import { registerGrammarRoutes } from "./grammar.js";

let dataDir: string;
let db: DB;
let app: Express;
let queue: JobQueue;

const CURRICULUM = {
  categories: [
    {
      name: "Subjuntivo",
      topics: [
        { name: "Disparadores de emoción", description: "Me alegra que…" },
        { name: "Cláusulas si", description: "Si tuviera…" },
      ],
    },
    {
      name: "Por y para",
      topics: [{ name: "Contraste por/para", description: "Causa vs fin." }],
    },
  ],
};

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "estudio-grammar-r-"));
  db = openDb(dataDir);
  runMigrations(db, dataDir);

  db.prepare("INSERT INTO setting (key, value) VALUES (?, ?)").run(
    "llm.grammar_curriculum",
    JSON.stringify({ provider: "mock", model: "mock-grammar" }),
  );
  const provider: LlmProvider = {
    name: "mock",
    complete: () =>
      Promise.resolve({
        text: JSON.stringify(CURRICULUM),
        usage: {
          tokensIn: 1,
          tokensOut: 1,
          cacheHit: false,
          costEstimateUsd: 0,
        },
      }),
    vision: () => Promise.reject(new Error("vision not used")),
  };
  const llm = new LlmService(db, { mock: provider }, { backoffBaseMs: 0 });

  queue = new JobQueue(db, { backoffBaseMs: 0 });
  registerGrammarSeedHandler(queue, db, llm);

  app = express();
  app.use(express.json());
  registerGrammarRoutes(app, db, queue);
  app.use(errorHandler);
});

afterEach(() => {
  logger.detachDb();
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("grammar routes", () => {
  it("GET /api/grammar reports the empty state before seeding", async () => {
    const res = await request(app).get("/api/grammar").expect(200);
    const body = res.body as GrammarHomeResponse;
    expect(body.seeded).toBe(false);
    expect(body.categories).toEqual([]);
    expect(body.practiceQueue).toEqual([]);
  });

  it("seeds end-to-end, then GET returns categories, topics, and a practice queue", async () => {
    // POST enqueues the job…
    const seedRes = await request(app).post("/api/grammar/seed").expect(202);
    const { jobId } = seedRes.body as GrammarSeedResponse;
    expect(typeof jobId).toBe("number");

    // …the queue runs it against the mocked provider…
    expect(await queue.tick()).toBe(true);

    // …and GET now serves the persisted curriculum.
    const res = await request(app).get("/api/grammar").expect(200);
    const body = res.body as GrammarHomeResponse;
    expect(body.seeded).toBe(true);
    expect(body.categories.map((c) => c.name)).toEqual([
      "Subjuntivo",
      "Por y para",
    ]);
    expect(body.categories[0]!.topics).toHaveLength(2);
    const topic = body.categories[0]!.topics[0]!;
    expect(topic).toMatchObject({
      name: "Disparadores de emoción",
      mastery: 0,
      quizCount: 0,
      seenInLessons: 0,
    });

    // Practice queue: up to 3 lowest-mastery topics (all 0 here).
    expect(body.practiceQueue).toHaveLength(3);
  });

  it("POST /api/grammar/seed is idempotent: 409 once seeded, no duplicate job", async () => {
    await request(app).post("/api/grammar/seed").expect(202);
    await queue.tick();

    const res = await request(app).post("/api/grammar/seed").expect(409);
    expect(res.body.error.code).toBe("already_seeded");

    // No second seed job was enqueued.
    const { c } = db
      .prepare("SELECT COUNT(*) AS c FROM job WHERE type = 'grammar_seed'")
      .get() as { c: number };
    expect(c).toBe(1);
    // Curriculum not duplicated.
    const { cats } = db
      .prepare("SELECT COUNT(*) AS cats FROM grammar_category")
      .get() as { cats: number };
    expect(cats).toBe(2);
  });

  it("orders the practice queue by lowest mastery first", async () => {
    await request(app).post("/api/grammar/seed").expect(202);
    await queue.tick();

    // Bump one topic's mastery high; it should drop out of the top-3 queue
    // when more than 3 topics exist. Here 3 topics exist, so check ordering.
    db.prepare(
      "UPDATE grammar_topic SET mastery = 0.9 WHERE name = 'Disparadores de emoción'",
    ).run();

    const res = await request(app).get("/api/grammar").expect(200);
    const body = res.body as GrammarHomeResponse;
    const masteries = body.practiceQueue.map((t) => t.mastery);
    expect(masteries).toEqual([...masteries].sort((a, b) => a - b));
    expect(body.practiceQueue[body.practiceQueue.length - 1]!.name).toBe(
      "Disparadores de emoción",
    );
  });
});
