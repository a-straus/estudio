import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import { openDb, type DB } from "../db/db.js";
import { runMigrations } from "../db/migrate.js";
import { createApp } from "../app.js";

let dataDir: string;
let db: DB;
let app: Express;

// Spanish deck id 1 is seeded by the initial migration.
const SPANISH_DECK = 1;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "estudio-srs-"));
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
  status: string,
  overrides: Partial<{
    term: string;
    lemma: string;
    partOfSpeech: string;
    definitionEs: string;
    definitionEn: string;
    example: string;
    deckId: number;
  }> = {},
): number {
  wordSeq += 1;
  const term = overrides.term ?? `palabra${wordSeq}`;
  const result = db
    .prepare(
      `INSERT INTO word (term, term_normalized, lemma, lemma_normalized, language,
         part_of_speech, definition_es, definition_en, example, status, deck_id)
       VALUES (?, ?, ?, ?, 'es', ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      term,
      term,
      overrides.lemma ?? term,
      overrides.lemma ?? term,
      overrides.partOfSpeech ?? "sustantivo",
      overrides.definitionEs ?? `def es ${term}`,
      overrides.definitionEn ?? `def en ${term}`,
      overrides.example ?? `ejemplo ${term}`,
      status,
      overrides.deckId ?? SPANISH_DECK,
    );
  return Number(result.lastInsertRowid);
}

function insertCard(
  wordId: number,
  card: { ease: number; intervalDays: number; dueAt: string; reps: number },
): void {
  db.prepare(
    `INSERT INTO card_state (word_id, ease, interval_days, due_at, reps)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(wordId, card.ease, card.intervalDays, card.dueAt, card.reps);
}

function setNewCardsPerDay(n: number): void {
  db.prepare(
    "INSERT INTO setting (key, value) VALUES ('new_cards_per_day', ?)",
  ).run(JSON.stringify(n));
}

const PAST = "2000-01-01T00:00:00.000Z";
const FUTURE = "2999-01-01T00:00:00.000Z";

function nowPlusASecond(): string {
  return new Date(Date.now() + 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

describe("GET /api/decks/:id/due", () => {
  it("returns due cards plus promoted new cards with a direction each", async () => {
    const dueWord = insertWord("learning");
    insertCard(dueWord, { ease: 2.5, intervalDays: 3, dueAt: PAST, reps: 3 });
    const newWord = insertWord("new");
    insertWord("new"); // a second new word, also expected to promote

    const res = await request(app).get(`/api/decks/${SPANISH_DECK}/due`);
    expect(res.status).toBe(200);
    expect(res.body.deckId).toBe(SPANISH_DECK);
    expect(res.body.items).toHaveLength(3);
    const wordIds = res.body.items.map((i: { wordId: number }) => i.wordId);
    expect(wordIds[0]).toBe(dueWord); // due card sorts before promotions
    expect(wordIds).toContain(newWord);
    for (const item of res.body.items) {
      expect(["w2d", "d2w"]).toContain(item.direction);
      expect(item.term).toBeTruthy();
      expect(item.definitionEs).toBeTruthy();
      expect(item.definitionEn).toBeTruthy();
    }

    // Promotion created card_state and flipped both new words to learning.
    const learning = db
      .prepare("SELECT COUNT(*) AS c FROM word WHERE status = 'learning'")
      .get() as { c: number };
    expect(learning.c).toBe(3);
    const cards = db.prepare("SELECT COUNT(*) AS c FROM card_state").get() as {
      c: number;
    };
    expect(cards.c).toBe(3);
  });

  it("excludes cards that are not yet due", async () => {
    const w = insertWord("learning");
    insertCard(w, { ease: 2.5, intervalDays: 10, dueAt: FUTURE, reps: 4 });

    const res = await request(app).get(`/api/decks/${SPANISH_DECK}/due`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
  });

  it("promotes at most new_cards_per_day, honouring the setting override", async () => {
    setNewCardsPerDay(2);
    for (let i = 0; i < 5; i++) insertWord("new");

    const res = await request(app).get(`/api/decks/${SPANISH_DECK}/due`);
    expect(res.body.items).toHaveLength(2);

    // Already promoted 2 today → a second build promotes none more.
    const res2 = await request(app).get(`/api/decks/${SPANISH_DECK}/due`);
    expect(res2.body.items).toHaveLength(2);
    const cards = db.prepare("SELECT COUNT(*) AS c FROM card_state").get() as {
      c: number;
    };
    expect(cards.c).toBe(2);
  });

  it("defaults to 20 new cards per day when the setting is unset", async () => {
    for (let i = 0; i < 25; i++) insertWord("new");
    const res = await request(app).get(`/api/decks/${SPANISH_DECK}/due`);
    expect(res.body.items).toHaveLength(20);
  });

  it("falls back to 20 new cards per day when the setting is unparseable", async () => {
    db.prepare(
      "INSERT INTO setting (key, value) VALUES ('new_cards_per_day', 'not-json{')",
    ).run();
    for (let i = 0; i < 25; i++) insertWord("new");
    const res = await request(app).get(`/api/decks/${SPANISH_DECK}/due`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(20);
  });

  it("ships deck distractors when the queue is too small for an option set", async () => {
    const dueWord = insertWord("learning");
    insertCard(dueWord, { ease: 2.5, intervalDays: 3, dueAt: PAST, reps: 3 });
    // Five other deck words, none due — these are the distractor pool.
    const others: number[] = [];
    for (let i = 0; i < 5; i++) {
      const w = insertWord("learning");
      insertCard(w, { ease: 2.5, intervalDays: 30, dueAt: FUTURE, reps: 5 });
      others.push(w);
    }

    const res = await request(app).get(`/api/decks/${SPANISH_DECK}/due`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.distractors).toHaveLength(5);
    for (const d of res.body.distractors) {
      expect(others).toContain(d.wordId);
      expect(d.wordId).not.toBe(dueWord);
      expect(d.term).toBeTruthy();
      expect(d.definitionEn).toBeTruthy();
    }
  });

  it("omits distractors when the queue can fill an option set itself", async () => {
    for (let i = 0; i < 5; i++) {
      const w = insertWord("learning");
      insertCard(w, { ease: 2.5, intervalDays: 1, dueAt: PAST, reps: 1 });
    }
    const res = await request(app).get(`/api/decks/${SPANISH_DECK}/due`);
    expect(res.body.items).toHaveLength(5);
    expect(res.body.distractors).toBeUndefined();
  });

  it("stamps promoted card_state due_at at second precision", async () => {
    insertWord("new");
    await request(app).get(`/api/decks/${SPANISH_DECK}/due`);
    const card = db
      .prepare("SELECT due_at, created_at FROM card_state")
      .get() as { due_at: string; created_at: string };
    expect(card.due_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(card.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  it("404s for an unknown deck", async () => {
    const res = await request(app).get("/api/decks/9999/due");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });
});

describe("POST /api/reviews", () => {
  it("applies a good grade, updates card_state, and appends review_log", async () => {
    const w = insertWord("learning");
    insertCard(w, { ease: 2.5, intervalDays: 1, dueAt: PAST, reps: 1 });

    const res = await request(app)
      .post("/api/reviews")
      .send({ wordId: w, direction: "w2d", grade: "good" });
    expect(res.status).toBe(200);
    // reps 1 → 2, so interval becomes the SECOND_INTERVAL of 6 days.
    expect(res.body.card).toMatchObject({
      wordId: w,
      reps: 2,
      intervalDays: 6,
      status: "learning",
    });

    const card = db
      .prepare(
        "SELECT ease, interval_days, reps FROM card_state WHERE word_id = ?",
      )
      .get(w) as { ease: number; interval_days: number; reps: number };
    expect(card).toEqual({ ease: 2.5, interval_days: 6, reps: 2 });

    const logs = db
      .prepare(
        "SELECT word_id, direction, grade, origin, interval_after FROM review_log WHERE word_id = ?",
      )
      .all(w);
    expect(logs).toEqual([
      {
        word_id: w,
        direction: "w2d",
        grade: "good",
        origin: "review",
        interval_after: 6,
      },
    ]);
  });

  it("promotes to mature when the interval reaches 21 days", async () => {
    const w = insertWord("learning");
    insertCard(w, { ease: 2.5, intervalDays: 10, dueAt: PAST, reps: 3 });

    const res = await request(app)
      .post("/api/reviews")
      .send({ wordId: w, direction: "d2w", grade: "good" });
    // round(10 * 2.5) = 25 ≥ 21 → mature.
    expect(res.body.card.intervalDays).toBe(25);
    expect(res.body.card.status).toBe("mature");
    const word = db.prepare("SELECT status FROM word WHERE id = ?").get(w) as {
      status: string;
    };
    expect(word.status).toBe("mature");
  });

  it("demotes a mature card back to learning on failure", async () => {
    const w = insertWord("mature");
    insertCard(w, { ease: 2.5, intervalDays: 40, dueAt: PAST, reps: 6 });

    const res = await request(app)
      .post("/api/reviews")
      .send({ wordId: w, direction: "w2d", grade: "fail" });
    expect(res.body.card).toMatchObject({
      reps: 0,
      intervalDays: 1,
      status: "learning",
    });
    const word = db.prepare("SELECT status FROM word WHERE id = ?").get(w) as {
      status: string;
    };
    expect(word.status).toBe("learning");
  });

  it("404s for a word with no card_state", async () => {
    const w = insertWord("new");
    const res = await request(app)
      .post("/api/reviews")
      .send({ wordId: w, direction: "w2d", grade: "good" });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("no_card_state");
  });

  it("400s on an invalid grade", async () => {
    const w = insertWord("learning");
    insertCard(w, { ease: 2.5, intervalDays: 1, dueAt: PAST, reps: 1 });
    const res = await request(app)
      .post("/api/reviews")
      .send({ wordId: w, direction: "w2d", grade: "perfect" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_grade");
  });

  it("400s on an invalid direction", async () => {
    const w = insertWord("learning");
    insertCard(w, { ease: 2.5, intervalDays: 1, dueAt: PAST, reps: 1 });
    const res = await request(app)
      .post("/api/reviews")
      .send({ wordId: w, direction: "sideways", grade: "good" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_direction");
  });

  it("persists due_at and review_log.ts at second precision", async () => {
    const w = insertWord("learning");
    insertCard(w, { ease: 2.5, intervalDays: 1, dueAt: PAST, reps: 1 });

    const res = await request(app)
      .post("/api/reviews")
      .send({ wordId: w, direction: "w2d", grade: "good" });
    expect(res.body.card.dueAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/,
    );

    const card = db
      .prepare("SELECT due_at FROM card_state WHERE word_id = ?")
      .get(w) as { due_at: string };
    expect(card.due_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    const log = db
      .prepare("SELECT ts FROM review_log WHERE word_id = ?")
      .get(w) as { ts: string };
    expect(log.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });
});

describe("POST /api/words/:id/demote", () => {
  it("resets the card, steps ease down, and logs a manual_demotion", async () => {
    const w = insertWord("mature");
    insertCard(w, { ease: 2.5, intervalDays: 40, dueAt: FUTURE, reps: 6 });

    const res = await request(app).post(`/api/words/${w}/demote`);
    expect(res.status).toBe(200);
    expect(res.body.card).toMatchObject({
      wordId: w,
      ease: 2.35, // 2.5 − 0.15
      intervalDays: 0,
      reps: 0,
      status: "learning",
    });

    const card = db
      .prepare(
        "SELECT interval_days, reps, ease FROM card_state WHERE word_id = ?",
      )
      .get(w) as { interval_days: number; reps: number; ease: number };
    expect(card).toEqual({ interval_days: 0, reps: 0, ease: 2.35 });

    const log = db
      .prepare(
        "SELECT grade, origin FROM review_log WHERE word_id = ? ORDER BY id DESC LIMIT 1",
      )
      .get(w) as { grade: string; origin: string };
    expect(log).toEqual({ grade: "fail", origin: "manual_demotion" });

    const word = db.prepare("SELECT status FROM word WHERE id = ?").get(w) as {
      status: string;
    };
    expect(word.status).toBe("learning");
  });

  it("creates a card for a word that never entered review (e.g. triaged 'know')", async () => {
    const w = insertWord("known");
    const res = await request(app).post(`/api/words/${w}/demote`);
    expect(res.status).toBe(200);
    expect(res.body.card).toMatchObject({
      wordId: w,
      ease: 2.35, // initial 2.5 − 0.15
      intervalDays: 0,
      reps: 0,
      status: "learning",
    });

    // card_state was created, due now (second precision), in the same
    // transaction as the status flip and the manual_demotion log row.
    const card = db
      .prepare(
        "SELECT ease, interval_days, due_at, reps FROM card_state WHERE word_id = ?",
      )
      .get(w) as {
      ease: number;
      interval_days: number;
      due_at: string;
      reps: number;
    };
    expect(card.ease).toBe(2.35);
    expect(card.interval_days).toBe(0);
    expect(card.reps).toBe(0);
    expect(card.due_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(card.due_at <= nowPlusASecond()).toBe(true);

    const word = db.prepare("SELECT status FROM word WHERE id = ?").get(w) as {
      status: string;
    };
    expect(word.status).toBe("learning");

    const log = db
      .prepare("SELECT grade, origin FROM review_log WHERE word_id = ?")
      .get(w) as { grade: string; origin: string };
    expect(log).toEqual({ grade: "fail", origin: "manual_demotion" });

    // The new card is immediately reviewable.
    const due = await request(app).get(`/api/decks/${SPANISH_DECK}/due`);
    expect(due.body.items.map((i: { wordId: number }) => i.wordId)).toContain(
      w,
    );
  });

  it("404s for an unknown word", async () => {
    const res = await request(app).post("/api/words/9999/demote");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });
});
