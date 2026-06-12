import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import { openDb, nowIso, type DB } from "../db/db.js";
import { runMigrations } from "../db/migrate.js";
import { createApp } from "../app.js";
import { JobQueue } from "../jobs/queue.js";
import { registerQuizGenHandler } from "../jobs/handlers.js";
import { LlmService } from "../llm/service.js";
import type { LlmProvider } from "../llm/types.js";
import {
  getQuizQuestionsByIds,
  type ClozePayload,
  type DefMatchPayload,
} from "../db/quiz-queries.js";

let dataDir: string;
let db: DB;
let app: Express;

const SPANISH_DECK = 1;
const FUTURE = "2999-01-01T00:00:00Z";

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "estudio-quiz-"));
  db = openDb(dataDir);
  runMigrations(db, dataDir);
  app = createApp(db);
});

afterEach(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

let wordSeq = 0;
function insertWord(
  over: Partial<{
    term: string;
    definitionEn: string;
    status: string;
    deckId: number;
  }> = {},
): number {
  wordSeq += 1;
  const term = over.term ?? `palabra${wordSeq}`;
  const r = db
    .prepare(
      `INSERT INTO word (term, term_normalized, lemma, lemma_normalized, language,
         part_of_speech, definition_es, definition_en, example, status, deck_id)
       VALUES (?, ?, ?, ?, 'es', 'sustantivo', ?, ?, ?, ?, ?)`,
    )
    .run(
      term,
      term,
      term,
      term,
      `def es ${term}`,
      over.definitionEn ?? `def en ${term}`,
      `ejemplo ${term}`,
      over.status ?? "learning",
      over.deckId ?? SPANISH_DECK,
    );
  return Number(r.lastInsertRowid);
}

function insertCard(wordId: number, dueAt: string): void {
  db.prepare(
    `INSERT INTO card_state (word_id, ease, interval_days, due_at, reps)
     VALUES (?, 2.5, 10, ?, 3)`,
  ).run(wordId, dueAt);
}

function insertQuestion(
  wordId: number,
  payload: DefMatchPayload | ClozePayload,
  over: { explanation?: string; flagged?: 0 | 1 } = {},
): number {
  const r = db
    .prepare(
      `INSERT INTO quiz_question (word_id, style, payload, explanation, prompt_version, flagged)
       VALUES (?, ?, ?, ?, 'v1', ?)`,
    )
    .run(
      wordId,
      payload.style,
      JSON.stringify(payload),
      over.explanation ?? "because.",
      over.flagged ?? 0,
    );
  return Number(r.lastInsertRowid);
}

function defMatch(over: Partial<DefMatchPayload> = {}): DefMatchPayload {
  return {
    style: "def_match",
    direction: "w2d",
    cue: "barco",
    options: ["boat", "car", "plane", "train"],
    correct: "boat",
    ...over,
  };
}

function cloze(over: Partial<ClozePayload> = {}): ClozePayload {
  return {
    style: "cloze",
    stemBefore: "El",
    stemAfter: "navegó.",
    options: ["barco", "coche", "avión", "tren"],
    correct: "barco",
    ...over,
  };
}

function reviewLogRows() {
  return db
    .prepare(
      "SELECT word_id, direction, grade, origin, quiz_question_id FROM review_log ORDER BY id",
    )
    .all() as {
    word_id: number;
    direction: string;
    grade: string;
    origin: string;
    quiz_question_id: number | null;
  }[];
}

describe("POST /api/quiz/answer — deterministic grading", () => {
  it("grades a correct def_match option as correct and writes no SRS row", async () => {
    const wordId = insertWord();
    insertCard(wordId, FUTURE);
    const qid = insertQuestion(wordId, defMatch());

    const res = await request(app)
      .post("/api/quiz/answer")
      .send({ questionId: qid, given: "boat", direction: "w2d" });

    expect(res.status).toBe(200);
    expect(res.body.correct).toBe(true);
    expect(res.body.correctAnswer).toBe("boat");
    expect(res.body.explanation).toBe("because.");
    expect(reviewLogRows()).toHaveLength(0); // correct never advances SRS
  });

  it("grades a wrong def_match option as incorrect", async () => {
    const wordId = insertWord();
    insertCard(wordId, FUTURE);
    const qid = insertQuestion(wordId, defMatch());

    const res = await request(app)
      .post("/api/quiz/answer")
      .send({ questionId: qid, given: "car", direction: "w2d" });

    expect(res.body.correct).toBe(false);
    expect(res.body.correctAnswer).toBe("boat");
  });

  it("matches cloze fills case/accent-insensitively", async () => {
    const wordId = insertWord();
    insertCard(wordId, FUTURE);
    const qid = insertQuestion(wordId, cloze({ correct: "Bárco" }));

    const res = await request(app)
      .post("/api/quiz/answer")
      .send({ questionId: qid, given: "barco", direction: "cloze" });

    expect(res.body.correct).toBe(true);
  });

  it('"Don\'t know" (given: null) counts as wrong', async () => {
    const wordId = insertWord();
    insertCard(wordId, FUTURE);
    const qid = insertQuestion(wordId, defMatch());

    const res = await request(app)
      .post("/api/quiz/answer")
      .send({ questionId: qid, given: null, direction: "w2d" });

    expect(res.body.correct).toBe(false);
  });
});

describe("POST /api/quiz/answer — miss writes SRS failure and pulls due now", () => {
  it("writes a quiz fail log (cloze: direction cloze + quiz_question_id) and pulls due now", async () => {
    const wordId = insertWord();
    insertCard(wordId, FUTURE);
    const qid = insertQuestion(wordId, cloze());

    const before = nowIso();
    await request(app)
      .post("/api/quiz/answer")
      .send({ questionId: qid, given: "coche", direction: "cloze" });

    const logs = reviewLogRows();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      word_id: wordId,
      direction: "cloze",
      grade: "fail",
      origin: "quiz",
      quiz_question_id: qid,
    });

    const card = db
      .prepare("SELECT due_at FROM card_state WHERE word_id = ?")
      .get(wordId) as { due_at: string };
    expect(card.due_at <= nowIso()).toBe(true);
    expect(card.due_at >= before).toBe(true);
  });

  it("a def_match miss logs the quiz direction and carries its quiz_question_id", async () => {
    const wordId = insertWord();
    insertCard(wordId, FUTURE);
    const qid = insertQuestion(wordId, defMatch({ direction: "d2w" }));

    await request(app)
      .post("/api/quiz/answer")
      .send({ questionId: qid, given: "car", direction: "d2w" });

    const logs = reviewLogRows();
    // def_match misses are now traceable to the exact question served.
    expect(logs[0]).toMatchObject({
      word_id: wordId,
      direction: "d2w",
      origin: "quiz",
      quiz_question_id: qid,
    });
  });

  it("creates a card_state for a missed word that never entered review", async () => {
    const wordId = insertWord({ status: "new" }); // no card_state
    const qid = insertQuestion(wordId, cloze());

    await request(app)
      .post("/api/quiz/answer")
      .send({ questionId: qid, given: "tren", direction: "cloze" });

    const card = db
      .prepare("SELECT due_at FROM card_state WHERE word_id = ?")
      .get(wordId) as { due_at: string } | undefined;
    expect(card).toBeTruthy();
    expect(card!.due_at <= nowIso()).toBe(true);
    const word = db
      .prepare("SELECT status FROM word WHERE id = ?")
      .get(wordId) as { status: string };
    expect(word.status).toBe("learning");
  });
});

describe("flagging excludes a question from serving", () => {
  it("getQuizQuestionsByIds omits flagged questions", () => {
    const wordId = insertWord();
    const served = insertQuestion(wordId, defMatch());
    const flagged = insertQuestion(wordId, cloze(), { flagged: 1 });

    const rows = getQuizQuestionsByIds(db, [served, flagged]);
    expect(rows.map((r) => r.id)).toEqual([served]);
  });

  it("POST flag sets flagged=1 and 404s an unknown id", async () => {
    const wordId = insertWord();
    const qid = insertQuestion(wordId, defMatch());

    const ok = await request(app).post(`/api/quiz/questions/${qid}/flag`);
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ id: qid, flagged: true });
    const row = db
      .prepare("SELECT flagged FROM quiz_question WHERE id = ?")
      .get(qid) as { flagged: number };
    expect(row.flagged).toBe(1);

    const missing = await request(app).post(`/api/quiz/questions/99999/flag`);
    expect(missing.status).toBe(404);
  });
});

describe("POST /api/quiz/attempt", () => {
  it("persists an attempt and returns its id", async () => {
    const wordId = insertWord();
    const qid = insertQuestion(wordId, defMatch());
    const res = await request(app)
      .post("/api/quiz/attempt")
      .send({
        deckId: SPANISH_DECK,
        style: "mixed",
        direction: "mixed",
        answers: [{ questionId: qid, given: "boat", correct: true }],
      });
    expect(res.status).toBe(201);
    expect(Number.isInteger(res.body.id)).toBe(true);

    const row = db
      .prepare("SELECT deck_id, style, direction, answers FROM quiz_attempt WHERE id = ?")
      .get(res.body.id) as {
      deck_id: number;
      style: string;
      direction: string | null;
      answers: string;
    };
    // A mixed quiz persists style 'mixed' and a null direction.
    expect(row.deck_id).toBe(SPANISH_DECK);
    expect(row.style).toBe("mixed");
    expect(row.direction).toBeNull();
    expect(JSON.parse(row.answers)).toHaveLength(1);

    // A single-style quiz still persists its concrete style and direction.
    const single = await request(app)
      .post("/api/quiz/attempt")
      .send({
        deckId: SPANISH_DECK,
        style: "def_match",
        direction: "w2d",
        answers: [{ questionId: qid, given: "boat", correct: true }],
      });
    expect(single.status).toBe(201);
    const singleRow = db
      .prepare("SELECT style, direction FROM quiz_attempt WHERE id = ?")
      .get(single.body.id) as { style: string; direction: string | null };
    expect(singleRow).toEqual({ style: "def_match", direction: "w2d" });
  });
});

describe("review-02 #8 — cloze questions mixed into the review queue", () => {
  it("serves a due word's unflagged cloze question on /due and excludes flagged ones", async () => {
    const wordId = insertWord();
    insertCard(wordId, "2000-01-01T00:00:00Z"); // due in the past
    insertQuestion(wordId, cloze(), { explanation: "boats float." });

    const res = await request(app).get(`/api/decks/${SPANISH_DECK}/due`);
    expect(res.status).toBe(200);
    expect(res.body.clozeReviews).toHaveLength(1);
    expect(res.body.clozeReviews[0]).toMatchObject({
      wordId,
      stemBefore: "El",
      correct: "barco",
      explanation: "boats float.",
    });

    // Flag it → no longer offered.
    db.prepare("UPDATE quiz_question SET flagged = 1 WHERE word_id = ?").run(
      wordId,
    );
    const after = await request(app).get(`/api/decks/${SPANISH_DECK}/due`);
    expect(after.body.clozeReviews).toBeUndefined();
  });

  it("a cloze-rendered review logs direction 'cloze' + quiz_question_id via /api/reviews", async () => {
    const wordId = insertWord();
    insertCard(wordId, "2000-01-01T00:00:00Z");
    const qid = insertQuestion(wordId, cloze());

    const res = await request(app).post("/api/reviews").send({
      wordId,
      direction: "cloze",
      grade: "fail",
      quizQuestionId: qid,
    });
    expect(res.status).toBe(200);

    const logs = reviewLogRows();
    expect(logs[0]).toMatchObject({
      word_id: wordId,
      direction: "cloze",
      grade: "fail",
      origin: "review",
      quiz_question_id: qid,
    });
  });
});

describe("POST /api/quiz/generate validation", () => {
  it("503s when no queue is configured", async () => {
    const res = await request(app)
      .post("/api/quiz/generate")
      .send({ deckId: SPANISH_DECK, length: 10, style: "mixed", direction: "mixed" });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("queue_unavailable");
  });

  it("422s a deck with no eligible words", async () => {
    const queue = new JobQueue(db, { pollIntervalMs: 100000 });
    const appWithQueue = createApp(db, { queue });
    const res = await request(appWithQueue)
      .post("/api/quiz/generate")
      .send({ deckId: SPANISH_DECK, length: 10, style: "mixed", direction: "mixed" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("no_eligible_words");
  });

  it("202s and runs the job end-to-end, then serves the questions", async () => {
    // Seed a deck with eligible words.
    for (let i = 0; i < 4; i++) insertWord();

    const clozeJson = JSON.stringify({
      sentence: "Un ____ en el mar.",
      correct: "barco",
      distractors: ["coche", "avión", "tren"],
      explanation: "A barco floats.",
    });
    db.prepare("INSERT INTO setting (key, value) VALUES (?, ?)").run(
      "llm.quiz_cloze",
      JSON.stringify({ provider: "mock", model: "mock" }),
    );
    const provider: LlmProvider = {
      name: "mock",
      complete: async () => ({
        text: clozeJson,
        usage: { tokensIn: 1, tokensOut: 1, cacheHit: false, costEstimateUsd: 0 },
      }),
      vision: async () => {
        throw new Error("vision not used");
      },
    };
    const llm = new LlmService(db, { mock: provider });
    const queue = new JobQueue(db, { pollIntervalMs: 100000 });
    registerQuizGenHandler(queue, db, llm);
    const appWithQueue = createApp(db, { queue });

    const gen = await request(appWithQueue)
      .post("/api/quiz/generate")
      .send({ deckId: SPANISH_DECK, length: 4, style: "mixed", direction: "mixed" });
    expect(gen.status).toBe(202);
    const jobId = gen.body.jobId;

    await queue.tick(); // run the quiz_gen job

    const got = await request(appWithQueue).get(`/api/quiz/${jobId}/questions`);
    expect(got.status).toBe(200);
    expect(got.body.status).toBe("done");
    expect(got.body.questions.length).toBe(4);
    // mixed: even indices def_match, odd cloze.
    const styles = got.body.questions.map((q: { style: string }) => q.style);
    expect(styles).toContain("def_match");
    expect(styles).toContain("cloze");
    // served questions carry their answer for instant client-side grading;
    // the answer is one of the shuffled options.
    for (const q of got.body.questions) {
      expect(Array.isArray(q.options)).toBe(true);
      expect(typeof q.answer).toBe("string");
      expect(q.options).toContain(q.answer);
    }
  });
});
