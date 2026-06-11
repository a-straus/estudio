// SQL for the SRS engine: due-queue building, card-state reads/writes, and the
// append-only review_log. snake_case → camelCase mapping happens here.
// Owned by the srs-api-wiring task; do not put non-SRS queries in this file.

import type { ReviewDirection } from "@estudio/shared";
import { nowIso, type DB } from "./db.js";
import type {
  CardState,
  ReviewLogFields,
  SrsWordStatus,
} from "../srs/types.js";

export const NEW_CARDS_PER_DAY_SETTING = "new_cards_per_day";

interface CardStateRowDb {
  word_id: number;
  ease: number;
  interval_days: number;
  due_at: string;
  reps: number;
}

interface WordReviewRowDb {
  id: number;
  term: string;
  lemma: string | null;
  part_of_speech: string | null;
  definition_es: string | null;
  definition_en: string | null;
  example: string | null;
}

export interface WordReviewData {
  wordId: number;
  term: string;
  lemma: string | null;
  partOfSpeech: string | null;
  definitionEs: string | null;
  definitionEn: string | null;
  example: string | null;
}

export function deckExists(db: DB, deckId: number): boolean {
  return (
    db.prepare("SELECT 1 FROM deck WHERE id = ?").get(deckId) !== undefined
  );
}

/** new-cards/day from `setting`, falling back to 20 when unset or unparseable. */
export function getNewCardsPerDay(db: DB): number {
  const row = db
    .prepare("SELECT value FROM setting WHERE key = ?")
    .get(NEW_CARDS_PER_DAY_SETTING) as { value: string } | undefined;
  if (!row) return 20;
  try {
    const parsed = JSON.parse(row.value);
    return typeof parsed === "number" ? parsed : 20;
  } catch {
    return 20;
  }
}

/**
 * Truncate an ISO timestamp to the project's second-precision convention
 * (nowIso in db.ts). SM-2 returns ms-precision strings; strip them here so
 * nothing ms-precision reaches the database.
 */
export function toSecondPrecision(iso: string): string {
  return iso.replace(/\.\d{1,3}Z$/, "Z");
}

/** card_state rows in the deck whose due_at is on or before `nowIsoString`. */
export function getDueCards(
  db: DB,
  deckId: number,
  nowIsoString: string,
): CardState[] {
  const rows = db
    .prepare(
      `SELECT cs.word_id, cs.ease, cs.interval_days, cs.due_at, cs.reps
       FROM card_state cs JOIN word w ON w.id = cs.word_id
       WHERE w.deck_id = ? AND cs.due_at <= ?`,
    )
    .all(deckId, nowIsoString) as CardStateRowDb[];
  return rows.map(toCardState);
}

/** Words with status 'new' in the deck, in promotion priority order (id asc). */
export function getNewWords(db: DB, deckId: number): { id: number }[] {
  return db
    .prepare(
      "SELECT id FROM word WHERE deck_id = ? AND status = 'new' ORDER BY id",
    )
    .all(deckId) as { id: number }[];
}

/**
 * Count of cards already promoted today in this deck — i.e. card_state rows
 * whose created_at falls on the same UTC date. Promotion is the only path that
 * creates card_state, so this is the day's running promotion total.
 */
export function countPromotedToday(
  db: DB,
  deckId: number,
  nowIsoString: string,
): number {
  const today = nowIsoString.slice(0, 10);
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM card_state cs JOIN word w ON w.id = cs.word_id
       WHERE w.deck_id = ? AND substr(cs.created_at, 1, 10) = ?`,
    )
    .get(deckId, today) as { c: number };
  return row.c;
}

export function getCardState(db: DB, wordId: number): CardState | null {
  const row = db
    .prepare(
      "SELECT word_id, ease, interval_days, due_at, reps FROM card_state WHERE word_id = ?",
    )
    .get(wordId) as CardStateRowDb | undefined;
  return row ? toCardState(row) : null;
}

export function wordExists(db: DB, wordId: number): boolean {
  return (
    db.prepare("SELECT 1 FROM word WHERE id = ?").get(wordId) !== undefined
  );
}

/**
 * Up to `limit` other words from the deck, randomly ordered — spare
 * multiple-choice distractors for sessions whose queue is too small to fill
 * an option set on its own.
 */
export function getDistractorCandidates(
  db: DB,
  deckId: number,
  excludeWordIds: number[],
  limit: number,
): { wordId: number; term: string; definitionEn: string | null }[] {
  const placeholders = excludeWordIds.map(() => "?").join(", ");
  const exclude = excludeWordIds.length
    ? `AND id NOT IN (${placeholders})`
    : "";
  const rows = db
    .prepare(
      `SELECT id, term, definition_en FROM word
       WHERE deck_id = ? ${exclude}
       ORDER BY RANDOM() LIMIT ?`,
    )
    .all(deckId, ...excludeWordIds, limit) as {
    id: number;
    term: string;
    definition_en: string | null;
  }[];
  return rows.map((r) => ({
    wordId: r.id,
    term: r.term,
    definitionEn: r.definition_en,
  }));
}

/** Review-card fields for the given word ids, keyed by word id. */
export function getWordReviewData(
  db: DB,
  wordIds: number[],
): Map<number, WordReviewData> {
  const map = new Map<number, WordReviewData>();
  if (wordIds.length === 0) return map;
  const placeholders = wordIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT id, term, lemma, part_of_speech, definition_es, definition_en, example
       FROM word WHERE id IN (${placeholders})`,
    )
    .all(...wordIds) as WordReviewRowDb[];
  for (const r of rows) {
    map.set(r.id, {
      wordId: r.id,
      term: r.term,
      lemma: r.lemma,
      partOfSpeech: r.part_of_speech,
      definitionEs: r.definition_es,
      definitionEn: r.definition_en,
      example: r.example,
    });
  }
  return map;
}

/**
 * Insert card_state rows for newly promoted words and flip those words to
 * 'learning', in a single transaction. created_at/updated_at are stamped with
 * `nowIsoString` so countPromotedToday sees them under today's date.
 */
export function persistPromotions(
  db: DB,
  promotions: CardState[],
  nowIsoString: string,
): void {
  if (promotions.length === 0) return;
  const insertCard = db.prepare(
    `INSERT INTO card_state (word_id, ease, interval_days, due_at, reps, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const setLearning = db.prepare(
    "UPDATE word SET status = 'learning', updated_at = ? WHERE id = ?",
  );
  const tx = db.transaction(() => {
    for (const p of promotions) {
      insertCard.run(
        p.word_id,
        p.ease,
        p.interval_days,
        toSecondPrecision(p.due_at),
        p.reps,
        nowIsoString,
        nowIsoString,
      );
      setLearning.run(nowIsoString, p.word_id);
    }
  });
  tx();
}

/**
 * Persist the result of a review or manual demotion: update card_state, set the
 * word status, and append one review_log row — all atomically. review_log is
 * append-only; this only ever INSERTs there.
 */
export function persistReviewOutcome(
  db: DB,
  params: {
    nextState: CardState;
    logEntry: ReviewLogFields;
    /** `cloze` is valid only for reviews/misses rendered from a quiz_question. */
    direction: ReviewDirection | "cloze";
    newWordStatus: SrsWordStatus;
    /**
     * Insert the card_state row instead of updating it — for demoting a word
     * that never entered review (e.g. triaged 'know', so it has no card yet).
     */
    createCardState?: boolean;
    /** Set when the row was rendered from a cloze quiz_question (#8 / quiz). */
    quizQuestionId?: number | null;
  },
): void {
  const now = nowIso();
  const insertCard = db.prepare(
    `INSERT INTO card_state (word_id, ease, interval_days, due_at, reps, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const updateCard = db.prepare(
    `UPDATE card_state
     SET ease = ?, interval_days = ?, due_at = ?, reps = ?, updated_at = ?
     WHERE word_id = ?`,
  );
  const updateWord = db.prepare(
    "UPDATE word SET status = ?, updated_at = ? WHERE id = ?",
  );
  const insertLog = db.prepare(
    `INSERT INTO review_log (word_id, ts, direction, grade, ease_after, interval_after, origin, quiz_question_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const { nextState, logEntry, direction, newWordStatus } = params;
  const tx = db.transaction(() => {
    if (params.createCardState) {
      insertCard.run(
        nextState.word_id,
        nextState.ease,
        nextState.interval_days,
        nextState.due_at,
        nextState.reps,
        now,
        now,
      );
    } else {
      updateCard.run(
        nextState.ease,
        nextState.interval_days,
        nextState.due_at,
        nextState.reps,
        now,
        nextState.word_id,
      );
    }
    updateWord.run(newWordStatus, now, nextState.word_id);
    insertLog.run(
      logEntry.word_id,
      logEntry.ts,
      direction,
      logEntry.grade,
      logEntry.ease_after,
      logEntry.interval_after,
      logEntry.origin,
      params.quizQuestionId ?? null,
    );
  });
  tx();
}

export interface ClozeReviewRow {
  wordId: number;
  questionId: number;
  stemBefore: string;
  stemAfter: string;
  options: string[];
  correct: string;
  explanation: string;
}

/**
 * For the given due words, the newest unflagged cloze quiz_question per word
 * (review-02 #8). Returns nothing for words with no cached cloze question, so
 * the caller leaves the existing MC/flip rendering untouched (additive).
 */
export function getClozeReviewsForWords(
  db: DB,
  wordIds: number[],
): ClozeReviewRow[] {
  if (wordIds.length === 0) return [];
  const placeholders = wordIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT word_id, id, payload, explanation
       FROM quiz_question
       WHERE style = 'cloze' AND flagged = 0 AND word_id IN (${placeholders})
       ORDER BY id DESC`,
    )
    .all(...wordIds) as {
    word_id: number;
    id: number;
    payload: string;
    explanation: string;
  }[];

  const seen = new Set<number>();
  const out: ClozeReviewRow[] = [];
  for (const r of rows) {
    if (seen.has(r.word_id)) continue; // keep only the newest per word
    let parsed: {
      stemBefore?: string;
      stemAfter?: string;
      options?: string[];
      correct?: string;
    };
    try {
      parsed = JSON.parse(r.payload);
    } catch {
      continue; // a malformed payload is simply not mixed in
    }
    if (
      typeof parsed.correct !== "string" ||
      !Array.isArray(parsed.options) ||
      parsed.options.length === 0
    ) {
      continue;
    }
    seen.add(r.word_id);
    out.push({
      wordId: r.word_id,
      questionId: r.id,
      stemBefore: parsed.stemBefore ?? "",
      stemAfter: parsed.stemAfter ?? "",
      options: parsed.options,
      correct: parsed.correct,
      explanation: r.explanation,
    });
  }
  return out;
}

function toCardState(r: CardStateRowDb): CardState {
  return {
    word_id: r.word_id,
    ease: r.ease,
    interval_days: r.interval_days,
    due_at: r.due_at,
    reps: r.reps,
  };
}
