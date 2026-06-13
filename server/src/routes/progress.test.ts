import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import type { ProgressSummary } from "@estudio/shared";
import { openDb, nowIso, type DB } from "../db/db.js";
import { runMigrations } from "../db/migrate.js";
import { createApp } from "../app.js";

let dataDir: string;
let db: DB;
let app: Express;

const DECK_ID = 1;
let wordSeq = 0;

function insertWord(
  status: "new" | "learning" | "mature" | "known" | "suspended",
): number {
  wordSeq++;
  const term = `word${wordSeq}`;
  const result = db
    .prepare(
      `INSERT INTO word (term, term_normalized, lemma, lemma_normalized, language,
         part_of_speech, definition_es, definition_en, example, level, status, deck_id)
       VALUES (?, ?, ?, ?, 'es', 'sustantivo', 'def es', 'def en', 'ejemplo', 'B1', ?, ?)`,
    )
    .run(term, term, term, term, status, DECK_ID);
  return Number(result.lastInsertRowid);
}

function insertCard(wordId: number, dueAt: string): void {
  const now = nowIso();
  db.prepare(
    `INSERT INTO card_state (word_id, ease, interval_days, due_at, reps, created_at, updated_at)
     VALUES (?, 2.5, 7, ?, 3, ?, ?)`,
  ).run(wordId, dueAt, now, now);
}

function insertQuizAttempt(
  answers: { correct: boolean }[],
  createdAt: string,
): void {
  db.prepare(
    `INSERT INTO quiz_attempt (deck_id, style, answers, created_at, updated_at)
     VALUES (1, 'def_match', ?, ?, ?)`,
  ).run(JSON.stringify(answers), createdAt, createdAt);
}

function insertSource(title: string): number {
  const now = nowIso();
  const r = db
    .prepare(
      `INSERT INTO source (type, title, ref, stored_path, language, created_at, updated_at)
       VALUES ('text', ?, ?, 'path.txt', 'es', ?, ?)`,
    )
    .run(title, title, now, now);
  return Number(r.lastInsertRowid);
}

function insertExtractionItem(
  sourceId: number,
  decision: "pending" | "learn" | "skip",
  wordId: number | null = null,
): void {
  const now = nowIso();
  db.prepare(
    `INSERT INTO extraction_item
       (source_id, term, lemma, part_of_speech, definition_es, definition_en,
        example, level, likely_known, batch_no, decision, word_id, created_at, updated_at)
     VALUES (?, 'term', 'term', 'noun', 'def es', 'def en', 'ex', 'B1', 0.1, 1, ?, ?, ?, ?)`,
  ).run(sourceId, decision, wordId, now, now);
}

beforeEach(() => {
  wordSeq = 0;
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "estudio-progress-"));
  db = openDb(dataDir);
  runMigrations(db, dataDir);
  app = createApp(db);
});

afterEach(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("GET /api/progress", () => {
  it("returns zero counts and 14 empty forecast days on a fresh DB", async () => {
    const res = await request(app).get("/api/progress").expect(200);
    const body = res.body as ProgressSummary;

    expect(body.counts).toEqual({ new: 0, learning: 0, mature: 0 });
    expect(body.dueForecast).toHaveLength(14);
    expect(body.dueForecast.every((d) => d.count === 0)).toBe(true);
    expect(body.quizAccuracy).toEqual({ sessions: [], average: null });
    expect(body.coverage).toEqual([]);
  });

  it("counts words by status, ignoring known and suspended", async () => {
    insertWord("new");
    insertWord("new");
    insertWord("learning");
    insertWord("mature");
    insertWord("known"); // ignored
    insertWord("suspended"); // ignored

    const res = await request(app).get("/api/progress").expect(200);
    const body = res.body as ProgressSummary;

    expect(body.counts).toEqual({ new: 2, learning: 1, mature: 1 });
  });

  it("buckets today's due cards in the first forecast entry", async () => {
    const w = insertWord("learning");
    insertCard(w, nowIso()); // due today

    const res = await request(app).get("/api/progress").expect(200);
    const body = res.body as ProgressSummary;

    expect(body.dueForecast).toHaveLength(14);
    expect(body.dueForecast[0]!.count).toBe(1);
    expect(body.dueForecast.slice(1).every((d) => d.count === 0)).toBe(true);
  });

  it("computes per-session quiz accuracy and overall average", async () => {
    // Session 1 (older): 2 of 3 correct = 67%
    insertQuizAttempt(
      [{ correct: true }, { correct: false }, { correct: true }],
      "2026-06-01T10:00:00Z",
    );
    // Session 2 (newer): 3 of 3 correct = 100%
    insertQuizAttempt(
      [{ correct: true }, { correct: true }, { correct: true }],
      "2026-06-02T10:00:00Z",
    );

    const res = await request(app).get("/api/progress").expect(200);
    const body = res.body as ProgressSummary;

    // Oldest→newest, so 67 first
    expect(body.quizAccuracy.sessions).toEqual([67, 100]);
    // Average: (67+100)/2 = 83.5 → 84
    expect(body.quizAccuracy.average).toBe(84);
  });

  it("computes source coverage from triage data", async () => {
    const src = insertSource("My Book");
    // 5 items total: 2 learn (kept), 2 skip (triaged not kept), 1 pending
    const w1 = insertWord("new");
    const w2 = insertWord("new");
    insertExtractionItem(src, "learn", w1);
    insertExtractionItem(src, "learn", w2);
    insertExtractionItem(src, "skip");
    insertExtractionItem(src, "skip");
    insertExtractionItem(src, "pending");

    const res = await request(app).get("/api/progress").expect(200);
    const body = res.body as ProgressSummary;

    expect(body.coverage).toHaveLength(1);
    const row = body.coverage[0]!;
    expect(row.title).toBe("My Book");
    expect(row.triagedPct).toBe(80); // 4/5 = 80%
    expect(row.wordsKept).toBe(2);
  });

  it("returns sources newest-first in coverage", async () => {
    insertSource("First Book");
    insertSource("Second Book");

    const res = await request(app).get("/api/progress").expect(200);
    const body = res.body as ProgressSummary;

    expect(body.coverage[0]!.title).toBe("Second Book");
    expect(body.coverage[1]!.title).toBe("First Book");
  });
});
