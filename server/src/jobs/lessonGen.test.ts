import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb, nowIso, type DB } from "../db/db.js";
import { runMigrations } from "../db/migrate.js";
import { logger } from "../logger.js";
import { LlmService } from "../llm/service.js";
import type { LlmProvider } from "../llm/types.js";
import { JobQueue } from "./queue.js";
import { enqueueLessonGen, JOB_TYPE_LESSON_GEN, runLessonGen } from "./lessonGen.js";
import { registerLessonGenHandler } from "./handlers.js";
import {
  getLatestLesson,
  getLessonQuestions,
} from "../db/grammar-queries.js";

let dataDir: string;
let db: DB;

const LESSON_JSON = JSON.stringify({
  explanation:
    "The subjunctive follows verbs of emotion.\n\nUse it after 'que' in the subordinate clause.",
  examples: [
    { es: "Me alegra que vengas.", en: "I'm glad you're coming." },
    { es: "Temo que llueva.", en: "I'm afraid it will rain." },
  ],
  questions: [
    {
      style: "def_match",
      prompt: "Which is correct?",
      options: ["Espero que tengas razón.", "Espero que tienes razón.", "x", "y"],
      correct: "Espero que tengas razón.",
      explanation: "Verbs of hope trigger the subjunctive.",
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
});

function seedTopic(): number {
  db.prepare(
    "INSERT INTO grammar_category (name, sort_order) VALUES ('Subjuntivo', 0)",
  ).run();
  const r = db
    .prepare(
      "INSERT INTO grammar_topic (category_id, name, description) VALUES (1, 'Emoción', 'Me alegra que…')",
    )
    .run();
  return Number(r.lastInsertRowid);
}

function makeLlm(text = LESSON_JSON): LlmService {
  db.prepare("INSERT OR REPLACE INTO setting (key, value) VALUES (?, ?)").run(
    "llm.grammar_lesson",
    JSON.stringify({ provider: "mock", model: "mock" }),
  );
  const provider: LlmProvider = {
    name: "mock",
    complete: async () => ({
      text,
      usage: { tokensIn: 1, tokensOut: 1, cacheHit: false, costEstimateUsd: 0 },
    }),
    vision: async () => {
      throw new Error("vision not used");
    },
  };
  return new LlmService(db, { mock: provider }, { backoffBaseMs: 0 });
}

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "estudio-lessongen-"));
  db = openDb(dataDir);
  runMigrations(db, dataDir);
});

afterEach(() => {
  logger.detachDb();
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("runLessonGen", () => {
  it("stores a lesson row with explanation + examples ONLY, and a quiz set", async () => {
    const topicId = seedTopic();
    const result = await runLessonGen(db, makeLlm(), { topicId });

    const lesson = getLatestLesson(db, topicId);
    expect(lesson).not.toBeNull();
    expect(lesson!.content.explanation).toContain("subjunctive");
    expect(lesson!.content.examples).toHaveLength(2);
    // content holds no questions — those are quiz_question rows.
    expect((lesson!.content as unknown as Record<string, unknown>).questions).toBeUndefined();

    expect(result.questionIds).toHaveLength(3);
    const questions = getLessonQuestions(db, lesson!.id);
    expect(questions.map((q) => q.style)).toEqual([
      "def_match",
      "fill_in",
      "free_text",
    ]);
    // Every question carries its eagerly-generated explanation.
    expect(questions.every((q) => q.explanation.trim().length > 0)).toBe(true);
    // free_text keeps its model answer as a grading reference.
    expect(questions[2].payload.sample).toBe("Ojalá llueva.");
    // The lesson questions point at the topic, not a word.
    const row = db
      .prepare("SELECT word_id, topic_id, lesson_id FROM quiz_question WHERE id = ?")
      .get(questions[0].id) as {
      word_id: number | null;
      topic_id: number | null;
      lesson_id: number | null;
    };
    expect(row.word_id).toBeNull();
    expect(row.topic_id).toBe(topicId);
    expect(row.lesson_id).toBe(lesson!.id);
  });

  it("persists the prompt template hash as prompt_version", async () => {
    const topicId = seedTopic();
    await runLessonGen(db, makeLlm(), { topicId });
    const row = db
      .prepare("SELECT prompt_version FROM lesson WHERE topic_id = ?")
      .get(topicId) as { prompt_version: string };
    expect(row.prompt_version).toMatch(/^[0-9a-f]{12}$/);
  });

  it("regenerates into a NEW lesson row, keeping the old one", async () => {
    const topicId = seedTopic();
    await runLessonGen(db, makeLlm(), { topicId });
    await runLessonGen(db, makeLlm(), { topicId });
    const { c } = db
      .prepare("SELECT COUNT(*) AS c FROM lesson WHERE topic_id = ?")
      .get(topicId) as { c: number };
    expect(c).toBe(2);
  });

  it("rejects a def_match question whose correct is not an option", async () => {
    const topicId = seedTopic();
    const bad = JSON.stringify({
      explanation: "x",
      examples: [],
      questions: [
        {
          style: "def_match",
          prompt: "?",
          options: ["a", "b", "c", "d"],
          correct: "z",
          explanation: "e",
        },
      ],
    });
    await expect(runLessonGen(db, makeLlm(bad), { topicId })).rejects.toThrow(
      /not an option/,
    );
  });

  it("throws for an unknown topic", async () => {
    await expect(runLessonGen(db, makeLlm(), { topicId: 999 })).rejects.toThrow(
      /not found/,
    );
  });

  describe("notes context injection", () => {
    it("includes learner notes in the grammar_lesson LLM prompt when notes exist for the topic", async () => {
      const topicId = seedTopic();
      // Insert a topic quiz_question and attach a note to it.
      const qid = db
        .prepare(
          `INSERT INTO quiz_question (topic_id, style, payload, explanation, prompt_version)
           VALUES (?, 'fill_in', '{"style":"fill_in","prompt":"____","correct":"a"}', 'e', 'v1')`,
        )
        .run(topicId);
      db.prepare(
        `INSERT INTO note (quiz_question_id, body, created_at, updated_at)
         VALUES (?, 'subjunctive trips me up every time', ?, ?)`,
      ).run(Number(qid.lastInsertRowid), nowIso(), nowIso());

      let capturedPrompt = "";
      db.prepare("INSERT OR REPLACE INTO setting (key, value) VALUES (?, ?)").run(
        "llm.grammar_lesson",
        JSON.stringify({ provider: "capture", model: "mock" }),
      );
      const provider: LlmProvider = {
        name: "capture",
        complete: async ({ prompt }) => {
          capturedPrompt = prompt;
          return {
            text: LESSON_JSON,
            usage: { tokensIn: 1, tokensOut: 1, cacheHit: false, costEstimateUsd: 0 },
          };
        },
        vision: async () => { throw new Error("vision not used"); },
      };
      const llm = new LlmService(db, { capture: provider }, { backoffBaseMs: 0 });

      await runLessonGen(db, llm, { topicId });

      expect(capturedPrompt).toContain("subjunctive trips me up every time");
      expect(capturedPrompt).toContain("Learner's own notes");
    });

    it("does not add a notes section when the topic has no notes", async () => {
      const topicId = seedTopic();

      let capturedPrompt = "";
      db.prepare("INSERT OR REPLACE INTO setting (key, value) VALUES (?, ?)").run(
        "llm.grammar_lesson",
        JSON.stringify({ provider: "capture", model: "mock" }),
      );
      const provider: LlmProvider = {
        name: "capture",
        complete: async ({ prompt }) => {
          capturedPrompt = prompt;
          return {
            text: LESSON_JSON,
            usage: { tokensIn: 1, tokensOut: 1, cacheHit: false, costEstimateUsd: 0 },
          };
        },
        vision: async () => { throw new Error("vision not used"); },
      };
      const llm = new LlmService(db, { capture: provider }, { backoffBaseMs: 0 });

      await runLessonGen(db, llm, { topicId });

      expect(capturedPrompt).not.toContain("Learner's own notes");
    });
  });

  it("runs through the queue handler and records the result", async () => {
    const topicId = seedTopic();
    const queue = new JobQueue(db, { pollIntervalMs: 100000, backoffBaseMs: 0 });
    registerLessonGenHandler(queue, db, makeLlm());
    const jobId = enqueueLessonGen(queue, topicId);
    expect(jobId).toBeGreaterThan(0);

    await queue.tick();

    const job = db
      .prepare("SELECT type, status, progress FROM job WHERE id = ?")
      .get(jobId) as { type: string; status: string; progress: string };
    expect(job.type).toBe(JOB_TYPE_LESSON_GEN);
    expect(job.status).toBe("done");
    const progress = JSON.parse(job.progress);
    expect(progress.lessonId).toBeGreaterThan(0);
    expect(progress.questionIds).toHaveLength(3);
  });
});
