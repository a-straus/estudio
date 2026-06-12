import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import type { OverviewSummary } from "@estudio/shared";
import { openDb, nowIso, type DB } from "../db/db.js";
import { runMigrations } from "../db/migrate.js";
import { createApp } from "../app.js";

let dataDir: string;
let db: DB;
let app: Express;

// Spanish deck id 1 is seeded by the initial migration.
const SPANISH_DECK = 1;
const PAST = "2000-01-01T00:00:00Z";
const FUTURE = "2999-01-01T00:00:00Z";

let wordSeq = 0;

function insertWord(
  status: string,
  overrides: Partial<{ term: string; deckId: number }> = {},
): number {
  wordSeq += 1;
  const term = overrides.term ?? `palabra${wordSeq}`;
  const result = db
    .prepare(
      `INSERT INTO word (term, term_normalized, lemma, lemma_normalized, language,
         part_of_speech, definition_es, definition_en, example, level, status, deck_id)
       VALUES (?, ?, ?, ?, 'es', 'sustantivo', ?, ?, ?, 'B1', ?, ?)`,
    )
    .run(
      term,
      term,
      term,
      term,
      `def es ${term}`,
      `def en ${term}`,
      `ejemplo ${term}`,
      status,
      overrides.deckId ?? SPANISH_DECK,
    );
  return Number(result.lastInsertRowid);
}

function insertCard(
  wordId: number,
  card: { intervalDays: number; dueAt: string; createdAt?: string },
): void {
  const now = card.createdAt ?? nowIso();
  db.prepare(
    `INSERT INTO card_state (word_id, ease, interval_days, due_at, reps, created_at, updated_at)
     VALUES (?, 2.5, ?, ?, 3, ?, ?)`,
  ).run(wordId, card.intervalDays, card.dueAt, now, now);
}

beforeEach(() => {
  wordSeq = 0;
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "estudio-overview-"));
  db = openDb(dataDir);
  runMigrations(db, dataDir);
  app = createApp(db);
});

afterEach(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("GET /api/overview", () => {
  it("returns a sensible zero/empty payload on a fresh library", async () => {
    const res = await request(app).get("/api/overview").expect(200);
    const body = res.body as OverviewSummary;

    expect(body.featured).toBeNull();
    expect(body.review).toEqual({ due: 0, newToday: 0 });
    expect(body.library).toEqual({ total: 0, mature: 0 });
    expect(body.grammar).toEqual({ topics: 0, belowFifty: 0, seeded: false });
    expect(body.suggestions.pool).toBe(0);
    expect(body.recentWords).toEqual([]);
    expect(body.latestJob).toBeNull();
    expect(body.lastBackupAt).toBeNull();
  });

  it("features the next-due word and reports correct counts when seeded", async () => {
    // A due card (overdue) — should become the featured word, reason "due".
    const dueWord = insertWord("learning", { term: "vergüenza" });
    insertCard(dueWord, { intervalDays: 3, dueAt: PAST });
    // A mature word not yet due.
    const matureWord = insertWord("mature", { term: "madrugar" });
    insertCard(matureWord, { intervalDays: 40, dueAt: FUTURE });
    // A new word added today (recent activity).
    insertWord("new", { term: "reciente" });

    // A grammar curriculum: 2 topics, one below 50% mastery.
    const cat = Number(
      db
        .prepare(
          "INSERT INTO grammar_category (name, sort_order, created_at, updated_at) VALUES ('Verbs', 0, ?, ?)",
        )
        .run(nowIso(), nowIso()).lastInsertRowid,
    );
    db.prepare(
      "INSERT INTO grammar_topic (category_id, name, mastery, created_at, updated_at) VALUES (?, 'Subjuntivo', 0.2, ?, ?)",
    ).run(cat, nowIso(), nowIso());
    db.prepare(
      "INSERT INTO grammar_topic (category_id, name, mastery, created_at, updated_at) VALUES (?, 'Pretérito', 0.8, ?, ?)",
    ).run(cat, nowIso(), nowIso());

    // An ingestion job (latest activity) and a backup job.
    db.prepare(
      "INSERT INTO job (type, payload, status, attempts, created_at, updated_at) VALUES ('text_ingestion', '{}', 'running', 1, ?, ?)",
    ).run(nowIso(), nowIso());
    db.prepare(
      "INSERT INTO job (type, payload, status, attempts, created_at, updated_at) VALUES ('db_backup', '{}', 'done', 1, ?, ?)",
    ).run(nowIso(), nowIso());

    const res = await request(app).get("/api/overview").expect(200);
    const body = res.body as OverviewSummary;

    expect(body.featured?.reason).toBe("due");
    expect(body.featured?.word.headword).toBe("vergüenza");
    expect(body.featured?.word.glossEn).toBe("def en vergüenza");

    expect(body.review.due).toBe(1);
    expect(body.review.newToday).toBe(2); // both card_state rows created today
    expect(body.library.total).toBe(3);
    expect(body.library.mature).toBe(1);

    expect(body.grammar).toEqual({ topics: 2, belowFifty: 1, seeded: true });

    // Newest-first recent words, the latest activity job, and the backup ts.
    expect(body.recentWords[0]?.headword).toBe("reciente");
    expect(body.recentWords).toHaveLength(3);
    expect(body.latestJob).toEqual({ type: "text_ingestion", status: "running" });
    expect(typeof body.lastBackupAt).toBe("string");
  });

  it("falls back to a mature revisit when nothing is due", async () => {
    const matureWord = insertWord("mature", { term: "madrugar" });
    insertCard(matureWord, { intervalDays: 40, dueAt: FUTURE });

    const res = await request(app).get("/api/overview").expect(200);
    const body = res.body as OverviewSummary;

    expect(body.review.due).toBe(0);
    expect(body.featured?.reason).toBe("mature");
    expect(body.featured?.word.headword).toBe("madrugar");
  });
});
