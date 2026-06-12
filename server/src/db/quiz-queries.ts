// SQL for the quiz engine: candidate-word selection, quiz_question
// insert/fetch (flagged rows excluded from serving), quiz_attempt insert, and
// the quiz-miss → SRS write. snake_case → camelCase mapping happens here.
// Owned by the quiz-engine-ui task.

import type {
  QuizQuestionStyle,
  QuizRenderDirection,
  QuizStyleOption,
} from "@estudio/shared";
import { nowIso, type DB } from "./db.js";
import {
  getCardState,
  persistReviewOutcome,
  toSecondPrecision,
} from "./srs-queries.js";
import { applyReview } from "../srs/sm2.js";
import { INITIAL_EASE } from "../srs/queue.js";
import type { CardState } from "../srs/types.js";

/** The JSON stored in quiz_question.payload, by style. */
export interface DefMatchPayload {
  style: "def_match";
  direction: "w2d" | "d2w";
  /** The cue shown above the options (a term for w2d, a definition for d2w). */
  cue: string;
  options: string[];
  correct: string;
}

export interface ClozePayload {
  style: "cloze";
  stemBefore: string;
  stemAfter: string;
  options: string[];
  correct: string;
}

export type QuizPayload = DefMatchPayload | ClozePayload;

export interface QuizCandidateWord {
  wordId: number;
  term: string;
  lemma: string | null;
  partOfSpeech: string | null;
  definitionEs: string | null;
  definitionEn: string | null;
  example: string | null;
  status: string;
}

export interface QuizQuestionRow {
  id: number;
  wordId: number;
  style: QuizQuestionStyle;
  payload: QuizPayload;
  explanation: string;
  term: string;
  lemma: string | null;
  partOfSpeech: string | null;
  definitionEs: string | null;
  definitionEn: string | null;
  example: string | null;
}

/** A deck word is quiz-eligible once it has an English gloss to build options from. */
const ELIGIBLE = "definition_en IS NOT NULL AND TRIM(definition_en) <> ''";

export function countEligibleQuizWords(db: DB, deckId: number): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM word WHERE deck_id = ? AND ${ELIGIBLE}`,
    )
    .get(deckId) as { c: number };
  return row.c;
}

/**
 * Up to `limit` eligible deck words in quiz priority order: due cards first,
 * then learning, then everything else, each group by id. Deterministic given
 * the deck (no RANDOM), so re-running the generator picks the same set.
 */
export function getQuizCandidateWords(
  db: DB,
  deckId: number,
  nowIsoString: string,
  limit: number,
): QuizCandidateWord[] {
  const rows = db
    .prepare(
      `SELECT w.id, w.term, w.lemma, w.part_of_speech, w.definition_es,
              w.definition_en, w.example, w.status, cs.due_at AS due_at
       FROM word w
       LEFT JOIN card_state cs ON cs.word_id = w.id
       WHERE w.deck_id = ? AND ${ELIGIBLE}
       ORDER BY
         CASE
           WHEN cs.due_at IS NOT NULL AND cs.due_at <= ? THEN 0
           WHEN w.status = 'learning' THEN 1
           ELSE 2
         END,
         w.id
       LIMIT ?`,
    )
    .all(deckId, nowIsoString, limit) as {
    id: number;
    term: string;
    lemma: string | null;
    part_of_speech: string | null;
    definition_es: string | null;
    definition_en: string | null;
    example: string | null;
    status: string;
  }[];
  return rows.map((r) => ({
    wordId: r.id,
    term: r.term,
    lemma: r.lemma,
    partOfSpeech: r.part_of_speech,
    definitionEs: r.definition_es,
    definitionEn: r.definition_en,
    example: r.example,
    status: r.status,
  }));
}

export function insertQuizQuestion(
  db: DB,
  q: {
    wordId: number;
    style: QuizQuestionStyle;
    payload: QuizPayload;
    explanation: string;
    promptVersion: string;
  },
): number {
  const now = nowIso();
  const result = db
    .prepare(
      `INSERT INTO quiz_question
         (word_id, style, payload, explanation, prompt_version, flagged, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
    )
    .run(
      q.wordId,
      q.style,
      JSON.stringify(q.payload),
      q.explanation,
      q.promptVersion,
      now,
      now,
    );
  return Number(result.lastInsertRowid);
}

function toQuestionRow(r: {
  id: number;
  word_id: number;
  style: QuizQuestionStyle;
  payload: string;
  explanation: string;
  term: string;
  lemma: string | null;
  part_of_speech: string | null;
  definition_es: string | null;
  definition_en: string | null;
  example: string | null;
}): QuizQuestionRow {
  return {
    id: r.id,
    wordId: r.word_id,
    style: r.style,
    payload: JSON.parse(r.payload) as QuizPayload,
    explanation: r.explanation,
    term: r.term,
    lemma: r.lemma,
    partOfSpeech: r.part_of_speech,
    definitionEs: r.definition_es,
    definitionEn: r.definition_en,
    example: r.example,
  };
}

const QUESTION_SELECT = `SELECT q.id, q.word_id, q.style, q.payload, q.explanation,
         w.term, w.lemma, w.part_of_speech, w.definition_es, w.definition_en, w.example
       FROM quiz_question q JOIN word w ON w.id = q.word_id`;

/** Generated questions by id, in id order, excluding flagged ones. */
export function getQuizQuestionsByIds(
  db: DB,
  ids: number[],
): QuizQuestionRow[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `${QUESTION_SELECT} WHERE q.flagged = 0 AND q.id IN (${placeholders}) ORDER BY q.id`,
    )
    .all(...ids) as Parameters<typeof toQuestionRow>[0][];
  return rows.map(toQuestionRow);
}

/** A single question for grading. Returns flagged rows too (already served). */
export function getQuizQuestion(db: DB, id: number): QuizQuestionRow | null {
  const row = db.prepare(`${QUESTION_SELECT} WHERE q.id = ?`).get(id) as
    | Parameters<typeof toQuestionRow>[0]
    | undefined;
  return row ? toQuestionRow(row) : null;
}

/** Flag a question so it is excluded from future serving (never deleted). */
export function flagQuizQuestion(db: DB, id: number): boolean {
  const result = db
    .prepare(
      "UPDATE quiz_question SET flagged = 1, updated_at = ? WHERE id = ?",
    )
    .run(nowIso(), id);
  return result.changes > 0;
}

export function insertQuizAttempt(
  db: DB,
  attempt: {
    deckId: number;
    style: QuizStyleOption;
    direction: "w2d" | "d2w" | null;
    answers: unknown;
  },
): number {
  const now = nowIso();
  const result = db
    .prepare(
      `INSERT INTO quiz_attempt
         (deck_id, topic_id, style, direction, answers, created_at, updated_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?)`,
    )
    .run(
      attempt.deckId,
      attempt.style,
      attempt.direction,
      JSON.stringify(attempt.answers),
      now,
      now,
    );
  return Number(result.lastInsertRowid);
}

export interface QuizJobRow {
  id: number;
  status: "queued" | "running" | "done" | "failed";
  progress: unknown | null;
  error: string | null;
}

export function getQuizJob(db: DB, id: number): QuizJobRow | null {
  const row = db
    .prepare("SELECT id, status, progress, error FROM job WHERE id = ?")
    .get(id) as
    | { id: number; status: string; progress: string | null; error: string | null }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    status: row.status as QuizJobRow["status"],
    progress: row.progress === null ? null : JSON.parse(row.progress),
    error: row.error,
  };
}

/**
 * Record a quiz miss: append a review_log row (origin 'quiz', grade 'fail',
 * carrying quiz_question_id when rendered from a cloze question) and pull the
 * word's card due to now. A word that never entered review gets a card created
 * at the demoted ease, due now. Correct answers never call this (no SRS change).
 */
export function recordQuizMiss(
  db: DB,
  miss: {
    wordId: number;
    direction: QuizRenderDirection;
    quizQuestionId: number | null;
  },
): void {
  const now = new Date();
  const nowString = toSecondPrecision(now.toISOString());
  const existing = getCardState(db, miss.wordId);
  const base: CardState = existing ?? {
    word_id: miss.wordId,
    ease: INITIAL_EASE,
    interval_days: 0,
    due_at: nowString,
    reps: 0,
  };

  const result = applyReview(base, "fail", now);
  // A miss pulls the card due now (overriding the fail's +1 day) so it surfaces
  // in the next review, and stamps the log row as a quiz failure.
  const nextState: CardState = {
    ...result.nextState,
    due_at: nowString,
  };
  persistReviewOutcome(db, {
    nextState,
    logEntry: {
      ...result.logEntry,
      ts: nowString,
      origin: "quiz",
    },
    direction: miss.direction,
    newWordStatus: result.newWordStatus,
    createCardState: existing === null,
    quizQuestionId: miss.quizQuestionId,
  });
}
