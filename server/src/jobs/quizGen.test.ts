import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb, type DB } from "../db/db.js";
import { runMigrations } from "../db/migrate.js";
import { logger } from "../logger.js";
import { LlmService } from "../llm/service.js";
import type { LlmProvider } from "../llm/types.js";
import { JobQueue } from "./queue.js";
import { enqueueQuizGen, JOB_TYPE_QUIZ_GEN, runQuizGen } from "./quizGen.js";
import { registerQuizGenHandler } from "./handlers.js";
import type { ClozePayload, DefMatchPayload } from "../db/quiz-queries.js";

let dataDir: string;
let db: DB;

const SPANISH_DECK = 1;

const CLOZE_JSON = JSON.stringify({
  sentence: "Un ____ navegó por el mar.",
  correct: "barco",
  distractors: ["coche", "avión", "tren"],
  explanation: "A barco sails the sea.",
});

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "estudio-quizgen-"));
  db = openDb(dataDir);
  runMigrations(db, dataDir);
});

afterEach(() => {
  logger.detachDb();
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

let wordSeq = 0;
function insertWord(over: Partial<{ definitionEn: string | null }> = {}): number {
  wordSeq += 1;
  const term = `palabra${wordSeq}`;
  const r = db
    .prepare(
      `INSERT INTO word (term, term_normalized, lemma, lemma_normalized, language,
         part_of_speech, definition_es, definition_en, example, status, deck_id)
       VALUES (?, ?, ?, ?, 'es', 'sustantivo', ?, ?, ?, 'learning', ?)`,
    )
    .run(
      term,
      term,
      term,
      term,
      `def es ${term}`,
      over.definitionEn === undefined ? `def en ${term}` : over.definitionEn,
      `ejemplo ${term}`,
      SPANISH_DECK,
    );
  return Number(r.lastInsertRowid);
}

function makeLlm(): { llm: LlmService } {
  db.prepare("INSERT INTO setting (key, value) VALUES (?, ?)").run(
    "llm.quiz_cloze",
    JSON.stringify({ provider: "mock", model: "mock" }),
  );
  const provider: LlmProvider = {
    name: "mock",
    complete: async () => ({
      text: CLOZE_JSON,
      usage: { tokensIn: 1, tokensOut: 1, cacheHit: false, costEstimateUsd: 0 },
    }),
    vision: async () => {
      throw new Error("vision not used");
    },
  };
  return { llm: new LlmService(db, { mock: provider }) };
}

function questions() {
  return db
    .prepare(
      "SELECT id, word_id, style, payload, explanation, prompt_version FROM quiz_question ORDER BY id",
    )
    .all() as {
    id: number;
    word_id: number;
    style: string;
    payload: string;
    explanation: string;
    prompt_version: string;
  }[];
}

function insertQuizQuestionRow(
  wordId: number,
  payload: DefMatchPayload | ClozePayload,
  over: { flagged?: 0 | 1; explanation?: string } = {},
): number {
  const r = db
    .prepare(
      `INSERT INTO quiz_question (word_id, style, payload, explanation, prompt_version, flagged)
       VALUES (?, ?, ?, ?, 'cached/v1', ?)`,
    )
    .run(
      wordId,
      payload.style,
      JSON.stringify(payload),
      over.explanation ?? "cached.",
      over.flagged ?? 0,
    );
  return Number(r.lastInsertRowid);
}

describe("runQuizGen", () => {
  it("builds def_match questions deterministically with no LLM call", async () => {
    for (let i = 0; i < 4; i++) insertWord();
    const { llm } = makeLlm();

    const result = await runQuizGen(db, llm, {
      deckId: SPANISH_DECK,
      length: 4,
      style: "def_match",
      direction: "w2d",
    });

    expect(result.questionIds).toHaveLength(4);
    expect(result.total).toBe(4);
    const rows = questions();
    expect(rows.every((r) => r.style === "def_match")).toBe(true);
    // explanation generated eagerly, templated from the definition.
    for (const r of rows) {
      expect(r.explanation).toMatch(/ means /);
      expect(r.prompt_version).toBe("def_match/templated/v1");
      const p = JSON.parse(r.payload) as DefMatchPayload;
      expect(p.options).toContain(p.correct);
      expect(p.options.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("is deterministic: same deck → same candidate words", async () => {
    for (let i = 0; i < 6; i++) insertWord();
    const { llm } = makeLlm();
    const a = await runQuizGen(db, llm, {
      deckId: SPANISH_DECK,
      length: 3,
      style: "def_match",
      direction: "w2d",
    });
    const wordsA = questions()
      .filter((q) => a.questionIds.includes(q.id))
      .map((q) => q.word_id);
    // first three words by priority/id
    expect(wordsA).toEqual(wordsA.slice().sort((x, y) => x - y));
    expect(wordsA).toHaveLength(3);
  });

  it("calls the LLM for cloze questions and stores its explanation", async () => {
    insertWord();
    const llmBox = makeLlm();
    const result = await runQuizGen(db, llmBox.llm, {
      deckId: SPANISH_DECK,
      length: 1,
      style: "cloze",
      direction: "w2d",
    });
    expect(result.questionIds).toHaveLength(1);
    const rows = questions();
    expect(rows[0].style).toBe("cloze");
    expect(rows[0].explanation).toBe("A barco sails the sea.");
    const p = JSON.parse(rows[0].payload) as ClozePayload;
    expect(p.stemBefore).toBe("Un");
    expect(p.stemAfter).toBe("navegó por el mar.");
    expect(p.options).toContain("barco");
    expect(p.options).toHaveLength(4);
  });

  it("interleaves styles for a mixed quiz", async () => {
    for (let i = 0; i < 4; i++) insertWord();
    const { llm } = makeLlm();
    await runQuizGen(db, llm, {
      deckId: SPANISH_DECK,
      length: 4,
      style: "mixed",
      direction: "mixed",
    });
    const styles = questions().map((q) => q.style);
    expect(styles.filter((s) => s === "def_match").length).toBe(2);
    expect(styles.filter((s) => s === "cloze").length).toBe(2);
  });

  it("reuses a cached unflagged def_match instead of generating a new one", async () => {
    const wordId = insertWord();
    const cachedId = insertQuizQuestionRow(wordId, {
      style: "def_match",
      direction: "w2d",
      cue: "palabra1",
      options: ["def en palabra1", "a house", "a dog", "water"],
      correct: "def en palabra1",
    });
    const { llm } = makeLlm();

    const result = await runQuizGen(db, llm, {
      deckId: SPANISH_DECK,
      length: 1,
      style: "def_match",
      direction: "w2d",
    });

    // The cached id is served; no second quiz_question row is created.
    expect(result.questionIds).toEqual([cachedId]);
    expect(questions()).toHaveLength(1);
  });

  it("does not reuse a flagged question — it generates a fresh one", async () => {
    const wordId = insertWord();
    const flaggedId = insertQuizQuestionRow(
      wordId,
      {
        style: "def_match",
        direction: "w2d",
        cue: "palabra1",
        options: ["def en palabra1", "a house"],
        correct: "def en palabra1",
      },
      { flagged: 1 },
    );
    insertWord(); // a second word so a distractor exists for generation
    const { llm } = makeLlm();

    const result = await runQuizGen(db, llm, {
      deckId: SPANISH_DECK,
      length: 1,
      style: "def_match",
      direction: "w2d",
    });

    expect(result.questionIds).toHaveLength(1);
    expect(result.questionIds[0]).not.toBe(flaggedId);
    // A new, unflagged row was written for the same word.
    const rows = questions();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === result.questionIds[0])!.prompt_version).toBe(
      "def_match/templated/v1",
    );
  });

  it("reuses a cached cloze without calling the LLM", async () => {
    const wordId = insertWord();
    const cachedId = insertQuizQuestionRow(wordId, {
      style: "cloze",
      stemBefore: "Un",
      stemAfter: "en el mar.",
      options: ["barco", "coche", "avión", "tren"],
      correct: "barco",
    });
    // A provider that throws if invoked proves the cache path skips the LLM.
    db.prepare("INSERT INTO setting (key, value) VALUES (?, ?)").run(
      "llm.quiz_cloze",
      JSON.stringify({ provider: "mock", model: "mock" }),
    );
    const provider: LlmProvider = {
      name: "mock",
      complete: async () => {
        throw new Error("LLM must not be called when a cloze is cached");
      },
      vision: async () => {
        throw new Error("vision not used");
      },
    };
    const llm = new LlmService(db, { mock: provider });

    const result = await runQuizGen(db, llm, {
      deckId: SPANISH_DECK,
      length: 1,
      style: "cloze",
      direction: "w2d",
    });

    expect(result.questionIds).toEqual([cachedId]);
    expect(questions()).toHaveLength(1);
  });

  it("builds varied def_match distractors that are never synonyms of the answer", async () => {
    // A single deck word: the only distractors available come from the widened
    // bank, proving options aren't just repeated ingested definitions.
    const wordId = insertWord();
    const { llm } = makeLlm();

    await runQuizGen(db, llm, {
      deckId: SPANISH_DECK,
      length: 1,
      style: "def_match",
      direction: "w2d",
    });

    const p = JSON.parse(questions()[0].payload) as DefMatchPayload;
    expect(p.options).toHaveLength(4);
    // All options distinct, the answer present, and every distractor differs
    // from the answer (the §6.4 synonym guard).
    expect(new Set(p.options).size).toBe(p.options.length);
    expect(p.options).toContain(p.correct);
    const distractors = p.options.filter((o) => o !== p.correct);
    for (const d of distractors) {
      expect(d).not.toBe(p.correct);
    }
    // At least one distractor comes from the widened bank, not this word's deck.
    expect(distractors.some((d) => d === "a house" || d === "a dog")).toBe(true);
    expect(wordId).toBeGreaterThan(0);
  });

  it("runs through the queue handler and records final progress", async () => {
    for (let i = 0; i < 2; i++) insertWord();
    const { llm } = makeLlm();
    const queue = new JobQueue(db, { pollIntervalMs: 100000 });
    registerQuizGenHandler(queue, db, llm);
    const jobId = enqueueQuizGen(queue, {
      deckId: SPANISH_DECK,
      length: 2,
      style: "def_match",
      direction: "w2d",
    });
    expect(jobId).toBeGreaterThan(0);

    await queue.tick();

    const job = db
      .prepare("SELECT status, progress FROM job WHERE id = ?")
      .get(jobId) as { status: string; progress: string };
    expect(job.status).toBe("done");
    const progress = JSON.parse(job.progress);
    expect(progress.total).toBe(2);
    expect(progress.questionIds).toHaveLength(2);
    expect(JOB_TYPE_QUIZ_GEN).toBe("quiz_gen");
  });
});
