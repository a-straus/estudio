import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import express, { type Express } from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { errorHandler } from "../app.js";
import { openDb, nowIso, type DB } from "../db/db.js";
import { runMigrations } from "../db/migrate.js";
import { logger } from "../logger.js";
import { registerNotesRoutes } from "./notes.js";
import {
  insertNote,
  getNoteForQuestion,
  listNotes,
  getNotesForWord,
  getNotesForTopic,
} from "../db/notes-queries.js";

let dataDir: string;
let db: DB;
let app: Express;

function seedWord(db: DB): number {
  const r = db
    .prepare(
      `INSERT INTO word (term, term_normalized, language, status, deck_id, created_at, updated_at)
       VALUES ('barco', 'barco', 'es', 'learning', 1, ?, ?)`,
    )
    .run(nowIso(), nowIso());
  return Number(r.lastInsertRowid);
}

function seedTopic(db: DB): number {
  db.prepare(
    "INSERT OR IGNORE INTO grammar_category (id, name, sort_order) VALUES (1, 'Cat', 0)",
  ).run();
  const r = db
    .prepare(
      "INSERT INTO grammar_topic (category_id, name) VALUES (1, 'Subjuntivo')",
    )
    .run();
  return Number(r.lastInsertRowid);
}

function seedWordQuestion(db: DB, wordId: number): number {
  const r = db
    .prepare(
      `INSERT INTO quiz_question (word_id, style, payload, explanation, prompt_version)
       VALUES (?, 'def_match', '{"style":"def_match","direction":"w2d","cue":"barco","options":["boat"],"correct":"boat"}', 'because.', 'v1')`,
    )
    .run(wordId);
  return Number(r.lastInsertRowid);
}

function seedTopicQuestion(db: DB, topicId: number): number {
  const r = db
    .prepare(
      `INSERT INTO quiz_question (topic_id, style, payload, explanation, prompt_version)
       VALUES (?, 'fill_in', '{"style":"fill_in","prompt":"____","correct":"a"}', 'because.', 'v1')`,
    )
    .run(topicId);
  return Number(r.lastInsertRowid);
}

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "estudio-notes-"));
  db = openDb(dataDir);
  runMigrations(db, dataDir);

  app = express();
  app.use(express.json());
  registerNotesRoutes(app, db);
  app.use(errorHandler);
});

afterEach(() => {
  logger.detachDb();
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("notes-queries unit tests", () => {
  it("insertNote creates a note and returns it with the word label", () => {
    const wordId = seedWord(db);
    const qid = seedWordQuestion(db, wordId);
    const note = insertNote(db, { quiz_question_id: qid, body: "hard word" });
    expect(note.id).toBeGreaterThan(0);
    expect(note.quizQuestionId).toBe(qid);
    expect(note.body).toBe("hard word");
    expect(note.label).toBe("barco");
    expect(note.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(note.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("insertNote with a topic question uses the topic name as label", () => {
    const topicId = seedTopic(db);
    const qid = seedTopicQuestion(db, topicId);
    const note = insertNote(db, { quiz_question_id: qid, body: "tricky topic" });
    expect(note.label).toBe("Subjuntivo");
  });

  it("getNoteForQuestion returns the most recent note for a question", () => {
    const wordId = seedWord(db);
    const qid = seedWordQuestion(db, wordId);
    insertNote(db, { quiz_question_id: qid, body: "first" });
    insertNote(db, { quiz_question_id: qid, body: "second" });
    const note = getNoteForQuestion(db, qid);
    expect(note?.body).toBe("second");
  });

  it("getNoteForQuestion returns null when no note exists", () => {
    const wordId = seedWord(db);
    const qid = seedWordQuestion(db, wordId);
    expect(getNoteForQuestion(db, qid)).toBeNull();
  });

  it("listNotes with wordId filter returns only notes for that word's questions", () => {
    const wordId = seedWord(db);
    const qid = seedWordQuestion(db, wordId);
    const topicId = seedTopic(db);
    const tqid = seedTopicQuestion(db, topicId);
    insertNote(db, { quiz_question_id: qid, body: "word note" });
    insertNote(db, { quiz_question_id: tqid, body: "topic note" });
    const wordNotes = listNotes(db, { wordId });
    expect(wordNotes).toHaveLength(1);
    expect(wordNotes[0].body).toBe("word note");
  });

  it("listNotes with topicId filter returns only notes for that topic's questions", () => {
    const wordId = seedWord(db);
    const qid = seedWordQuestion(db, wordId);
    const topicId = seedTopic(db);
    const tqid = seedTopicQuestion(db, topicId);
    insertNote(db, { quiz_question_id: qid, body: "word note" });
    insertNote(db, { quiz_question_id: tqid, body: "topic note" });
    const topicNotes = listNotes(db, { topicId });
    expect(topicNotes).toHaveLength(1);
    expect(topicNotes[0].body).toBe("topic note");
  });

  it("listNotes with quizQuestionId returns notes for that exact question", () => {
    const wordId = seedWord(db);
    const qid = seedWordQuestion(db, wordId);
    insertNote(db, { quiz_question_id: qid, body: "note a" });
    const notes = listNotes(db, { quizQuestionId: qid });
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toBe("note a");
  });

  it("listNotes with no filter returns all notes newest-first", () => {
    const wordId = seedWord(db);
    const qid = seedWordQuestion(db, wordId);
    insertNote(db, { quiz_question_id: qid, body: "older" });
    insertNote(db, { quiz_question_id: qid, body: "newer" });
    const all = listNotes(db);
    expect(all[0].body).toBe("newer");
    expect(all[1].body).toBe("older");
  });

  it("getNotesForWord returns body strings for word questions newest-first", () => {
    const wordId = seedWord(db);
    const qid = seedWordQuestion(db, wordId);
    insertNote(db, { quiz_question_id: qid, body: "note 1" });
    insertNote(db, { quiz_question_id: qid, body: "note 2" });
    const bodies = getNotesForWord(db, wordId);
    expect(bodies).toEqual(["note 2", "note 1"]);
  });

  it("getNotesForTopic returns body strings for topic questions newest-first", () => {
    const topicId = seedTopic(db);
    const qid = seedTopicQuestion(db, topicId);
    insertNote(db, { quiz_question_id: qid, body: "topic note 1" });
    const bodies = getNotesForTopic(db, topicId);
    expect(bodies).toEqual(["topic note 1"]);
  });

  it("getNotesForWord returns empty array when no notes exist", () => {
    expect(getNotesForWord(db, 999)).toEqual([]);
  });
});

describe("GET /api/notes", () => {
  it("returns all notes when no filters", async () => {
    const wordId = seedWord(db);
    const qid = seedWordQuestion(db, wordId);
    insertNote(db, { quiz_question_id: qid, body: "my note" });
    const res = await request(app).get("/api/notes").expect(200);
    expect(res.body.notes).toHaveLength(1);
    expect(res.body.notes[0].body).toBe("my note");
    expect(res.body.notes[0].quizQuestionId).toBe(qid);
    expect(res.body.notes[0].label).toBe("barco");
  });

  it("filters by word_id", async () => {
    const wordId = seedWord(db);
    const qid = seedWordQuestion(db, wordId);
    insertNote(db, { quiz_question_id: qid, body: "word note" });
    const res = await request(app)
      .get(`/api/notes?word_id=${wordId}`)
      .expect(200);
    expect(res.body.notes).toHaveLength(1);
    const none = await request(app).get(`/api/notes?word_id=9999`).expect(200);
    expect(none.body.notes).toHaveLength(0);
  });

  it("filters by quiz_question_id", async () => {
    const wordId = seedWord(db);
    const qid = seedWordQuestion(db, wordId);
    insertNote(db, { quiz_question_id: qid, body: "specific" });
    const res = await request(app)
      .get(`/api/notes?quiz_question_id=${qid}`)
      .expect(200);
    expect(res.body.notes[0].body).toBe("specific");
  });
});

describe("POST /api/notes", () => {
  it("creates a note and 201s with note object", async () => {
    const wordId = seedWord(db);
    const qid = seedWordQuestion(db, wordId);
    const res = await request(app)
      .post("/api/notes")
      .send({ quizQuestionId: qid, body: "hard word" })
      .expect(201);
    expect(res.body.note.body).toBe("hard word");
    expect(res.body.note.quizQuestionId).toBe(qid);
    expect(res.body.note.label).toBe("barco");
  });

  it("400s when body is empty", async () => {
    const wordId = seedWord(db);
    const qid = seedWordQuestion(db, wordId);
    const res = await request(app)
      .post("/api/notes")
      .send({ quizQuestionId: qid, body: "   " })
      .expect(400);
    expect(res.body.error.code).toBe("bad_request");
  });

  it("400s when quizQuestionId is missing", async () => {
    const res = await request(app)
      .post("/api/notes")
      .send({ body: "some note" })
      .expect(400);
    expect(res.body.error.code).toBe("bad_request");
  });

  it("400s when quizQuestionId references a non-existent quiz_question", async () => {
    const res = await request(app)
      .post("/api/notes")
      .send({ quizQuestionId: 99999, body: "some note" })
      .expect(400);
    expect(res.body.error.code).toBe("bad_request");
    expect(res.body.error.message).toMatch(/not found/i);
  });

  it("trims whitespace from body before saving", async () => {
    const wordId = seedWord(db);
    const qid = seedWordQuestion(db, wordId);
    const res = await request(app)
      .post("/api/notes")
      .send({ quizQuestionId: qid, body: "  trimmed  " })
      .expect(201);
    expect(res.body.note.body).toBe("trimmed");
  });
});

describe("PATCH /api/notes/:id", () => {
  it("updates the body and bumps updated_at", async () => {
    const wordId = seedWord(db);
    const qid = seedWordQuestion(db, wordId);
    const created = await request(app)
      .post("/api/notes")
      .send({ quizQuestionId: qid, body: "original" });
    const id = created.body.note.id as number;

    const res = await request(app)
      .patch(`/api/notes/${id}`)
      .send({ body: "revised" })
      .expect(200);
    expect(res.body.note.body).toBe("revised");
    expect(res.body.note.id).toBe(id);
  });

  it("400s when body is empty", async () => {
    const wordId = seedWord(db);
    const qid = seedWordQuestion(db, wordId);
    const { body: { note } } = await request(app)
      .post("/api/notes")
      .send({ quizQuestionId: qid, body: "original" });
    await request(app)
      .patch(`/api/notes/${note.id}`)
      .send({ body: "" })
      .expect(400);
  });

  it("404s for an unknown note id", async () => {
    const res = await request(app)
      .patch("/api/notes/99999")
      .send({ body: "anything" })
      .expect(404);
    expect(res.body.error.code).toBe("not_found");
  });
});

describe("DELETE /api/notes/:id", () => {
  it("deletes a note and 204s", async () => {
    const wordId = seedWord(db);
    const qid = seedWordQuestion(db, wordId);
    const { body: { note } } = await request(app)
      .post("/api/notes")
      .send({ quizQuestionId: qid, body: "to delete" });

    await request(app).delete(`/api/notes/${note.id}`).expect(204);

    const after = await request(app).get("/api/notes").expect(200);
    expect(after.body.notes).toHaveLength(0);
  });

  it("404s for an unknown id", async () => {
    const res = await request(app).delete("/api/notes/99999").expect(404);
    expect(res.body.error.code).toBe("not_found");
  });
});
