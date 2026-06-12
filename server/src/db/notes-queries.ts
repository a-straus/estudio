// SQL for note CRUD and context fetches. snake_case → camelCase mapping is here.
// Notes link only to quiz_question_id; word/topic are reached by JOIN.

import { nowIso, type DB } from "./db.js";
import type { Note } from "@estudio/shared";

interface NoteRow {
  id: number;
  quiz_question_id: number;
  body: string;
  label: string;
  created_at: string;
  updated_at: string;
}

function toNote(r: NoteRow): Note {
  return {
    id: r.id,
    quizQuestionId: r.quiz_question_id,
    body: r.body,
    label: r.label,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// Base SELECT with JOIN to resolve the human-readable label.
const NOTE_SELECT = `
  SELECT n.id, n.quiz_question_id, n.body, n.created_at, n.updated_at,
         COALESCE(w.term, gt.name, '?') AS label
  FROM note n
  JOIN quiz_question qq ON qq.id = n.quiz_question_id
  LEFT JOIN word w ON w.id = qq.word_id
  LEFT JOIN grammar_topic gt ON gt.id = qq.topic_id
`;

export function insertNote(
  db: DB,
  fields: { quiz_question_id: number; body: string },
): Note {
  const now = nowIso();
  const result = db
    .prepare(
      `INSERT INTO note (quiz_question_id, body, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(fields.quiz_question_id, fields.body, now, now);
  const row = db
    .prepare(`${NOTE_SELECT} WHERE n.id = ?`)
    .get(Number(result.lastInsertRowid)) as NoteRow;
  return toNote(row);
}

export function updateNote(db: DB, id: number, body: string): Note | null {
  const now = nowIso();
  const result = db
    .prepare(`UPDATE note SET body = ?, updated_at = ? WHERE id = ?`)
    .run(body, now, id);
  if (result.changes === 0) return null;
  const row = db
    .prepare(`${NOTE_SELECT} WHERE n.id = ?`)
    .get(id) as NoteRow | undefined;
  return row ? toNote(row) : null;
}

export function deleteNote(db: DB, id: number): boolean {
  return db.prepare(`DELETE FROM note WHERE id = ?`).run(id).changes > 0;
}

export function getNoteForQuestion(db: DB, quizQuestionId: number): Note | null {
  const row = db
    .prepare(`${NOTE_SELECT} WHERE n.quiz_question_id = ? ORDER BY n.id DESC LIMIT 1`)
    .get(quizQuestionId) as NoteRow | undefined;
  return row ? toNote(row) : null;
}

export function listNotes(
  db: DB,
  filter: { wordId?: number; topicId?: number; quizQuestionId?: number } = {},
): Note[] {
  const clauses: string[] = [];
  const params: number[] = [];

  if (filter.quizQuestionId !== undefined) {
    clauses.push("n.quiz_question_id = ?");
    params.push(filter.quizQuestionId);
  } else if (filter.wordId !== undefined) {
    clauses.push("qq.word_id = ?");
    params.push(filter.wordId);
  } else if (filter.topicId !== undefined) {
    clauses.push("qq.topic_id = ?");
    params.push(filter.topicId);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db
    .prepare(`${NOTE_SELECT} ${where} ORDER BY n.id DESC`)
    .all(...params) as NoteRow[];
  return rows.map(toNote);
}

export function quizQuestionExists(db: DB, id: number): boolean {
  return db.prepare("SELECT 1 FROM quiz_question WHERE id = ?").get(id) !== undefined;
}

/** Body text of the most recent notes for a word's quiz questions. */
export function getNotesForWord(db: DB, wordId: number, limit = 5): string[] {
  const rows = db
    .prepare(
      `SELECT n.body FROM note n
       JOIN quiz_question qq ON qq.id = n.quiz_question_id
       WHERE qq.word_id = ?
       ORDER BY n.id DESC LIMIT ?`,
    )
    .all(wordId, limit) as { body: string }[];
  return rows.map((r) => r.body);
}

/** Body text of the most recent notes for a topic's quiz questions. */
export function getNotesForTopic(db: DB, topicId: number, limit = 5): string[] {
  const rows = db
    .prepare(
      `SELECT n.body FROM note n
       JOIN quiz_question qq ON qq.id = n.quiz_question_id
       WHERE qq.topic_id = ?
       ORDER BY n.id DESC LIMIT ?`,
    )
    .all(topicId, limit) as { body: string }[];
  return rows.map((r) => r.body);
}
