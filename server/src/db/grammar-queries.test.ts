import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb, type DB } from "./db.js";
import { runMigrations } from "./migrate.js";
import { logger } from "../logger.js";
import {
  countGrammarCategories,
  getGrammarHome,
  getLatestLesson,
  getLessonById,
  getLessonQuestions,
  insertCurriculum,
  insertLesson,
  insertLessonAttempt,
  insertLessonQuestion,
  listGrammarTopicsForMatching,
  updateTopicMastery,
} from "./grammar-queries.js";

let dataDir: string;
let db: DB;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "estudio-gq-"));
  db = openDb(dataDir);
  runMigrations(db, dataDir);
});

afterEach(() => {
  logger.detachDb();
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const CURRICULUM = [
  {
    name: "Subjuntivo",
    topics: [
      { name: "Emoción", description: "Me alegra que…" },
      { name: "Cláusulas si", description: null },
    ],
  },
  {
    name: "Por y para",
    topics: [{ name: "Contraste", description: "Causa vs fin." }],
  },
];

function topicId(name: string): number {
  return (
    db.prepare("SELECT id FROM grammar_topic WHERE name = ?").get(name) as {
      id: number;
    }
  ).id;
}

describe("grammar queries", () => {
  it("counts categories and inserts a curriculum with sort_order + mastery defaults", () => {
    expect(countGrammarCategories(db)).toBe(0);

    const counts = insertCurriculum(db, CURRICULUM);
    expect(counts).toEqual({ categories: 2, topics: 3 });
    expect(countGrammarCategories(db)).toBe(2);

    const rows = db
      .prepare(
        "SELECT name, sort_order FROM grammar_category ORDER BY sort_order",
      )
      .all() as { name: string; sort_order: number }[];
    expect(rows).toEqual([
      { name: "Subjuntivo", sort_order: 0 },
      { name: "Por y para", sort_order: 1 },
    ]);

    const topics = db
      .prepare(
        "SELECT name, description, mastery FROM grammar_topic ORDER BY id",
      )
      .all() as { name: string; description: string | null; mastery: number }[];
    expect(topics[0]).toEqual({
      name: "Emoción",
      description: "Me alegra que…",
      mastery: 0,
    });
    expect(topics[1]!.description).toBeNull();
  });

  it("nests topics under categories and derives quiz/lesson counts", () => {
    insertCurriculum(db, CURRICULUM);
    const emocion = topicId("Emoción");

    // A grammar source page linked to the topic + a 'topic_covered' insight.
    const now = "2026-01-01T00:00:00Z";
    const sourceId = Number(
      db
        .prepare(
          "INSERT INTO source (type, title, created_at, updated_at) VALUES ('pdf', 'wb', ?, ?)",
        )
        .run(now, now).lastInsertRowid,
    );
    db.prepare(
      "INSERT INTO source_page (source_id, page_no, kind, status, grammar_topic_id, created_at, updated_at) VALUES (?, 1, 'grammar', 'done', ?, ?, ?)",
    ).run(sourceId, emocion, now, now);
    db.prepare(
      "INSERT INTO lesson_insight (source_id, type, payload, topic_id, created_at, updated_at) VALUES (?, 'topic_covered', '{}', ?, ?, ?)",
    ).run(sourceId, emocion, now, now);
    db.prepare(
      "INSERT INTO quiz_attempt (topic_id, style, answers, created_at, updated_at) VALUES (?, 'cloze', '[]', ?, ?)",
    ).run(emocion, now, now);

    const home = getGrammarHome(db);
    expect(home.seeded).toBe(true);
    expect(home.categories).toHaveLength(2);
    expect(home.categories[0]!.topics.map((t) => t.name)).toEqual([
      "Emoción",
      "Cláusulas si",
    ]);

    const emo = home.categories[0]!.topics.find((t) => t.name === "Emoción")!;
    expect(emo.quizCount).toBe(1);
    expect(emo.seenInLessons).toBe(2); // one page link + one topic_covered insight
  });

  it("derives the practice queue: lowest mastery first, capped at 3", () => {
    insertCurriculum(db, [
      {
        name: "Cat",
        topics: [
          { name: "T1", description: null },
          { name: "T2", description: null },
          { name: "T3", description: null },
          { name: "T4", description: null },
        ],
      },
    ]);
    db.prepare(
      "UPDATE grammar_topic SET mastery = 0.8 WHERE name = 'T1'",
    ).run();
    db.prepare(
      "UPDATE grammar_topic SET mastery = 0.1 WHERE name = 'T2'",
    ).run();

    const { practiceQueue } = getGrammarHome(db);
    expect(practiceQueue).toHaveLength(3);
    // T1 (0.8) is the most-mastered and must be excluded from the top 3.
    expect(practiceQueue.map((t) => t.name)).not.toContain("T1");
    // T2 (0.1) makes the cut over T1; the two zero-mastery topics lead.
    expect(practiceQueue.map((t) => t.name).sort()).toEqual(["T2", "T3", "T4"]);
    const masteries = practiceQueue.map((t) => t.mastery);
    expect(masteries).toEqual([...masteries].sort((a, b) => a - b));
  });

  it("lists topics for matching", () => {
    insertCurriculum(db, CURRICULUM);
    const list = listGrammarTopicsForMatching(db);
    expect(list.map((t) => t.name)).toEqual([
      "Emoción",
      "Cláusulas si",
      "Contraste",
    ]);
  });

  describe("lessons", () => {
    function makeTopic(): number {
      insertCurriculum(db, CURRICULUM);
      return topicId("Emoción");
    }

    it("stores and serves a lesson + its quiz set; getLatest returns the newest", () => {
      const id = makeTopic();
      const first = insertLesson(db, {
        topicId: id,
        content: { explanation: "old", examples: [] },
        promptVersion: "abc",
      });
      const second = insertLesson(db, {
        topicId: id,
        content: {
          explanation: "new",
          examples: [{ es: "Hola", en: "Hi" }],
        },
        promptVersion: "abc",
      });
      expect(getLatestLesson(db, id)!.id).toBe(second);
      expect(getLatestLesson(db, id)!.content.explanation).toBe("new");

      insertLessonQuestion(db, {
        topicId: id,
        lessonId: second,
        style: "fill_in",
        payload: { style: "fill_in", prompt: "____", correct: "x" },
        explanation: "why",
        promptVersion: "abc",
      });
      const withName = getLessonById(db, second)!;
      expect(withName.topicName).toBe("Emoción");
      const qs = getLessonQuestions(db, second);
      expect(qs).toHaveLength(1);
      expect(qs[0]!.payload.correct).toBe("x");
      // questions on the old lesson are not returned for the new one.
      expect(getLessonQuestions(db, first)).toHaveLength(0);
    });

    it("excludes flagged lesson questions from the served set", () => {
      const id = makeTopic();
      const lessonId = insertLesson(db, {
        topicId: id,
        content: { explanation: "x", examples: [] },
        promptVersion: "abc",
      });
      const qid = insertLessonQuestion(db, {
        topicId: id,
        lessonId,
        style: "free_text",
        payload: { style: "free_text", prompt: "?" },
        explanation: "why",
        promptVersion: "abc",
      });
      db.prepare("UPDATE quiz_question SET flagged = 1 WHERE id = ?").run(qid);
      expect(getLessonQuestions(db, lessonId)).toHaveLength(0);
    });

    // mastery = 0.7 * mastery + 0.3 * score
    it("updates mastery via the EMA and returns before/after", () => {
      const id = makeTopic();
      // From 0: 0.7*0 + 0.3*1 = 0.3
      let res = updateTopicMastery(db, id, 1);
      expect(res.masteryBefore).toBe(0);
      expect(res.mastery).toBeCloseTo(0.3, 10);

      // From 0.3 with a perfect score: 0.7*0.3 + 0.3*1 = 0.51
      res = updateTopicMastery(db, id, 1);
      expect(res.masteryBefore).toBeCloseTo(0.3, 10);
      expect(res.mastery).toBeCloseTo(0.51, 10);

      // A zero score pulls it down: 0.7*0.51 + 0.3*0 = 0.357
      res = updateTopicMastery(db, id, 0);
      expect(res.mastery).toBeCloseTo(0.357, 10);

      // The column reflects the latest value.
      const row = db
        .prepare("SELECT mastery FROM grammar_topic WHERE id = ?")
        .get(id) as { mastery: number };
      expect(row.mastery).toBeCloseTo(0.357, 10);
    });

    it("records a lesson attempt against the topic with style 'mixed'", () => {
      const id = makeTopic();
      const attemptId = insertLessonAttempt(db, {
        topicId: id,
        answers: [{ questionId: 1, given: "x", correct: true }],
      });
      const row = db
        .prepare("SELECT topic_id, style, deck_id FROM quiz_attempt WHERE id = ?")
        .get(attemptId) as {
        topic_id: number;
        style: string;
        deck_id: number | null;
      };
      expect(row.topic_id).toBe(id);
      expect(row.style).toBe("mixed");
      expect(row.deck_id).toBeNull();
    });
  });
});
