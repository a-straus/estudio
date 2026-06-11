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
import {
  registerGrammarSeedHandler,
  registerLessonGenHandler,
} from "../jobs/handlers.js";
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

const LESSON = {
  explanation: "The subjunctive follows emotion.\n\nUse it after que.",
  examples: [{ es: "Me alegra que vengas.", en: "I'm glad you're coming." }],
  questions: [
    {
      style: "def_match",
      prompt: "Which is correct?",
      options: ["Espero que tengas razón.", "Espero que tienes razón.", "x", "y"],
      correct: "Espero que tengas razón.",
      explanation: "Hope triggers the subjunctive.",
    },
    {
      style: "fill_in",
      prompt: "Quiero que tú ____ (venir).",
      correct: "vengas",
      explanation: "Querer que takes the subjunctive.",
    },
    {
      style: "free_text",
      prompt: "Write a sentence with ojalá.",
      correct: "Ojalá llueva.",
      explanation: "Ojalá always takes the subjunctive.",
    },
  ],
};

const GRADING = { verdict: "correct", feedback: "Nicely done." };

/** Seed the curriculum and return the first topic's id. */
async function seedAndGetTopic(): Promise<number> {
  await request(app).post("/api/grammar/seed").expect(202);
  await queue.tick();
  return (
    db.prepare("SELECT id FROM grammar_topic ORDER BY id LIMIT 1").get() as {
      id: number;
    }
  ).id;
}

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "estudio-grammar-r-"));
  db = openDb(dataDir);
  runMigrations(db, dataDir);

  for (const [task, model] of [
    ["llm.grammar_curriculum", "mock-grammar"],
    ["llm.grammar_lesson", "mock-lesson"],
    ["llm.quiz_grading", "mock-grading"],
  ] as const) {
    db.prepare("INSERT INTO setting (key, value) VALUES (?, ?)").run(
      task,
      JSON.stringify({ provider: "mock", model }),
    );
  }
  const provider: LlmProvider = {
    name: "mock",
    // Branch on the per-task model so one provider can serve every task.
    complete: ({ model }) => {
      let text = JSON.stringify(CURRICULUM);
      if (model === "mock-lesson") text = JSON.stringify(LESSON);
      else if (model === "mock-grading") text = JSON.stringify(GRADING);
      return Promise.resolve({
        text,
        usage: {
          tokensIn: 1,
          tokensOut: 1,
          cacheHit: false,
          costEstimateUsd: 0,
        },
      });
    },
    vision: () => Promise.reject(new Error("vision not used")),
  };
  const llm = new LlmService(db, { mock: provider }, { backoffBaseMs: 0 });

  queue = new JobQueue(db, { backoffBaseMs: 0 });
  registerGrammarSeedHandler(queue, db, llm);
  registerLessonGenHandler(queue, db, llm);

  app = express();
  app.use(express.json());
  registerGrammarRoutes(app, db, queue, llm);
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

describe("lesson routes", () => {
  it("generates a lesson, serves it cached, and never leaks the answer", async () => {
    const topicId = await seedAndGetTopic();

    // No lesson yet.
    const before = await request(app)
      .get(`/api/grammar/topics/${topicId}/lesson`)
      .expect(200);
    expect(before.body.lesson).toBeNull();

    // Enqueue generation and run it.
    const gen = await request(app)
      .post(`/api/grammar/topics/${topicId}/lesson`)
      .expect(202);
    const jobId = gen.body.jobId as number;
    await queue.tick();

    // Poll endpoint returns the finished lesson.
    const job = await request(app)
      .get(`/api/grammar/lessons/${jobId}`)
      .expect(200);
    expect(job.body.status).toBe("done");
    expect(job.body.lesson.explanation).toContain("subjunctive");
    expect(job.body.lesson.examples).toHaveLength(1);
    expect(job.body.lesson.questions).toHaveLength(3);
    // The served question carries no answer/explanation.
    const q0 = job.body.lesson.questions[0];
    expect(q0.options).toHaveLength(4);
    expect(q0.correct).toBeUndefined();
    expect(q0.explanation).toBeUndefined();

    // GET now serves the cached lesson.
    const cached = await request(app)
      .get(`/api/grammar/topics/${topicId}/lesson`)
      .expect(200);
    expect(cached.body.lesson.id).toBe(job.body.lesson.id);
  });

  it("404s generating a lesson for an unknown topic", async () => {
    await seedAndGetTopic();
    await request(app).post("/api/grammar/topics/9999/lesson").expect(404);
    await request(app).get("/api/grammar/topics/9999/lesson").expect(404);
  });

  it("grades def_match locally and reveals the stored explanation", async () => {
    const topicId = await seedAndGetTopic();
    await request(app).post(`/api/grammar/topics/${topicId}/lesson`).expect(202);
    await queue.tick();
    const lessonId = (
      db.prepare("SELECT id FROM lesson LIMIT 1").get() as { id: number }
    ).id;
    const def = db
      .prepare(
        "SELECT id FROM quiz_question WHERE lesson_id = ? AND style = 'def_match'",
      )
      .get(lessonId) as { id: number };

    const right = await request(app)
      .post("/api/grammar/answer")
      .send({ questionId: def.id, given: "Espero que tengas razón." })
      .expect(200);
    expect(right.body.correct).toBe(true);
    expect(right.body.correctAnswer).toBe("Espero que tengas razón.");
    expect(right.body.explanation).toContain("subjunctive");
    expect(right.body.feedback).toBeNull(); // local grade, no LLM feedback

    const wrong = await request(app)
      .post("/api/grammar/answer")
      .send({ questionId: def.id, given: "x" })
      .expect(200);
    expect(wrong.body.correct).toBe(false);
  });

  it("grades fill_in exactly, and falls back to the LLM for a near-miss", async () => {
    const topicId = await seedAndGetTopic();
    await request(app).post(`/api/grammar/topics/${topicId}/lesson`).expect(202);
    await queue.tick();
    const fill = db
      .prepare("SELECT id FROM quiz_question WHERE style = 'fill_in'")
      .get() as { id: number };

    // Exact (accent/case-insensitive) match → local correct, no feedback.
    const exact = await request(app)
      .post("/api/grammar/answer")
      .send({ questionId: fill.id, given: "Vengas" })
      .expect(200);
    expect(exact.body.correct).toBe(true);
    expect(exact.body.feedback).toBeNull();

    // A different answer routes to the LLM grader (mock says correct + feedback).
    const near = await request(app)
      .post("/api/grammar/answer")
      .send({ questionId: fill.id, given: "venga" })
      .expect(200);
    expect(near.body.correct).toBe(true);
    expect(near.body.feedback).toBe("Nicely done.");
  });

  it("always LLM-grades free_text and records the attempt, updating mastery", async () => {
    const topicId = await seedAndGetTopic();
    await request(app).post(`/api/grammar/topics/${topicId}/lesson`).expect(202);
    await queue.tick();
    const free = db
      .prepare("SELECT id FROM quiz_question WHERE style = 'free_text'")
      .get() as { id: number };

    const ans = await request(app)
      .post("/api/grammar/answer")
      .send({ questionId: free.id, given: "Ojalá venga." })
      .expect(200);
    expect(ans.body.correct).toBe(true);
    expect(ans.body.feedback).toBe("Nicely done.");

    // Record an attempt: 2 of 4 correct → score 0.5; from 0 mastery → 0.15.
    const attempt = await request(app)
      .post("/api/grammar/attempt")
      .send({
        topicId,
        answers: [
          { questionId: free.id, given: "a", correct: true },
          { questionId: free.id, given: "b", correct: true },
          { questionId: free.id, given: "c", correct: false },
          { questionId: free.id, given: "d", correct: false },
        ],
      })
      .expect(201);
    expect(attempt.body.masteryBefore).toBe(0);
    expect(attempt.body.mastery).toBeCloseTo(0.15, 10);

    // The topic column reflects the new mastery; an attempt row exists.
    const topic = db
      .prepare("SELECT mastery FROM grammar_topic WHERE id = ?")
      .get(topicId) as { mastery: number };
    expect(topic.mastery).toBeCloseTo(0.15, 10);
    const { c } = db
      .prepare("SELECT COUNT(*) AS c FROM quiz_attempt WHERE topic_id = ?")
      .get(topicId) as { c: number };
    expect(c).toBe(1);
  });

  it("404s grading a missing question and rejects a bad attempt", async () => {
    const topicId = await seedAndGetTopic();
    await request(app)
      .post("/api/grammar/answer")
      .send({ questionId: 99999, given: "x" })
      .expect(404);
    await request(app)
      .post("/api/grammar/attempt")
      .send({ topicId, answers: [] })
      .expect(400);
  });
});
