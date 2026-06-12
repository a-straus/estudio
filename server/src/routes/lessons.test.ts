import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import type { LessonListItem, LessonRecordingView } from "@estudio/shared";
import { openDb, nowIso, type DB } from "../db/db.js";
import { runMigrations } from "../db/migrate.js";
import { createApp } from "../app.js";

let dataDir: string;
let db: DB;
let app: Express;

function insertLessonSource(title = "Lesson Jun 9"): number {
  const now = nowIso();
  const r = db
    .prepare(
      "INSERT INTO source (type, title, ref, stored_path, created_at, updated_at) VALUES ('lesson_audio', ?, ?, ?, ?, ?)",
    )
    .run(title, "lesson.m4a", "/uploads/lesson.m4a", now, now);
  return Number(r.lastInsertRowid);
}

function insertJob(sourceId: number, status = "done", phase = "done"): number {
  const now = nowIso();
  const r = db
    .prepare(
      "INSERT INTO job (type, payload, status, progress, attempts, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)",
    )
    .run(
      "lesson_audio_ingestion",
      JSON.stringify({ sourceId }),
      status,
      JSON.stringify({ phase }),
      now,
      now,
    );
  return Number(r.lastInsertRowid);
}

function insertInsight(
  sourceId: number,
  type: string,
  payload: object,
  wordId: number | null = null,
  topicId: number | null = null,
): number {
  const now = nowIso();
  const r = db
    .prepare(
      "INSERT INTO lesson_insight (source_id, type, payload, word_id, topic_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(sourceId, type, JSON.stringify(payload), wordId, topicId, now, now);
  return Number(r.lastInsertRowid);
}

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "estudio-lessons-"));
  db = openDb(dataDir);
  runMigrations(db, dataDir);
  app = createApp(db);
});

afterEach(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("GET /api/lessons", () => {
  it("returns empty array when no lessons exist", async () => {
    const res = await request(app).get("/api/lessons").expect(200);
    expect(res.body).toEqual([]);
  });

  it("returns a lesson row with zero counts when nothing is analyzed yet", async () => {
    const sourceId = insertLessonSource("My first lesson");
    insertJob(sourceId, "running", "transcribing");

    const res = await request(app).get("/api/lessons").expect(200);
    const body = res.body as LessonListItem[];
    expect(body).toHaveLength(1);
    const row = body[0]!;
    expect(row.sourceId).toBe(sourceId);
    expect(row.title).toBe("My first lesson");
    expect(row.jobStatus).toBe("running");
    expect(row.jobPhase).toBe("transcribing");
    expect(row.flaggedWordCount).toBe(0);
    expect(row.correctionCount).toBe(0);
    expect(row.struggleSentenceCount).toBe(0);
    expect(row.topicCount).toBe(0);
    expect(row.durationMinutes).toBeNull();
  });

  it("returns summary counts from lesson_insight rows", async () => {
    const sourceId = insertLessonSource();
    insertJob(sourceId);
    insertInsight(sourceId, "flagged_word", {
      term: "entender",
      lemma: null,
      partOfSpeech: null,
      definitionEs: null,
      definitionEn: null,
    });
    insertInsight(sourceId, "flagged_word", {
      term: "surgir",
      lemma: null,
      partOfSpeech: null,
      definitionEs: null,
      definitionEn: null,
    });
    insertInsight(sourceId, "correction", {
      said: "yo fui ayer",
      corrected: "yo fui ayer a...",
      note: null,
    });
    insertInsight(sourceId, "topic_covered", { name: "Subjuntivo" });
    insertInsight(sourceId, "topic_covered", { name: "Pretérito" });
    insertInsight(sourceId, "topic_covered", { name: "Ser vs Estar" });

    const res = await request(app).get("/api/lessons").expect(200);
    const row = (res.body as LessonListItem[])[0]!;
    expect(row.flaggedWordCount).toBe(2);
    expect(row.correctionCount).toBe(1);
    expect(row.struggleSentenceCount).toBe(0);
    expect(row.topicCount).toBe(3);
  });

  it("returns multiple lessons newest-first", async () => {
    const s1 = insertLessonSource("older");
    const s2 = insertLessonSource("newer");
    const res = await request(app).get("/api/lessons").expect(200);
    const body = res.body as LessonListItem[];
    expect(body[0]!.sourceId).toBe(s2);
    expect(body[1]!.sourceId).toBe(s1);
  });
});

describe("GET /api/lessons/:sourceId", () => {
  it("returns 404 for a non-existent source", async () => {
    await request(app).get("/api/lessons/999").expect(404);
  });

  it("returns 404 when the source exists but is not a lesson_audio", async () => {
    const now = nowIso();
    const r = db
      .prepare(
        "INSERT INTO source (type, title, created_at, updated_at) VALUES ('pdf', 'Book', ?, ?)",
      )
      .run(now, now);
    const id = Number(r.lastInsertRowid);
    await request(app).get(`/api/lessons/${id}`).expect(404);
  });

  it("returns the full LessonRecordingView with grouped insights", async () => {
    const sourceId = insertLessonSource("Detail lesson");
    insertJob(sourceId);
    insertInsight(sourceId, "flagged_word", {
      term: "surgir",
      lemma: "surgir",
      partOfSpeech: "verbo",
      definitionEs: "aparecer",
      definitionEn: "to arise",
    });
    insertInsight(sourceId, "correction", {
      said: "yo fui ayer en",
      corrected: "yo fui ayer a",
      note: null,
    });
    insertInsight(sourceId, "struggle_sentence", {
      sentence: "Quisiera que hubiera venido.",
      note: "long pause",
    });
    insertInsight(sourceId, "topic_covered", { name: "Subjuntivo" });

    const res = await request(app)
      .get(`/api/lessons/${sourceId}`)
      .expect(200);
    const body = res.body as LessonRecordingView;

    expect(body.source.id).toBe(sourceId);
    expect(body.source.type).toBe("lesson_audio");
    expect(body.insights.flaggedWords).toHaveLength(1);
    expect(body.insights.flaggedWords[0]!.payload).toMatchObject({
      term: "surgir",
    });
    expect(body.insights.corrections).toHaveLength(1);
    expect(body.insights.struggleSentences).toHaveLength(1);
    expect(body.insights.topicsCovered).toHaveLength(1);
    expect(body.insights.topicsCovered[0]!.payload).toMatchObject({
      name: "Subjuntivo",
    });
  });

  it("returns 400 for an invalid sourceId", async () => {
    await request(app).get("/api/lessons/abc").expect(400);
  });
});
