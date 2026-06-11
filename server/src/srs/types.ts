/**
 * Plain-object types for the SRS engine. These mirror the `card_state` and
 * `review_log` rows in ARCHITECTURE.md; the engine itself never touches the
 * database.
 */

export type Grade = "fail" | "good" | "easy";

export type ReviewDirection = "w2d" | "d2w";

export type ReviewOrigin = "review" | "quiz" | "manual_demotion";

/** Word status as far as the SM-2 engine decides it. */
export type SrsWordStatus = "learning" | "mature";

/** Mirrors the `card_state` table (minus id/created_at/updated_at). */
export interface CardState {
  word_id: number;
  ease: number;
  interval_days: number;
  /** ISO-8601 UTC TEXT, e.g. "2026-06-11T00:00:00.000Z" */
  due_at: string;
  reps: number;
}

/** The `review_log` fields the engine determines (direction is the caller's). */
export interface ReviewLogFields {
  word_id: number;
  /** ISO-8601 UTC TEXT */
  ts: string;
  grade: Grade;
  ease_after: number;
  interval_after: number;
  origin: ReviewOrigin;
}

export interface ReviewResult {
  nextState: CardState;
  logEntry: ReviewLogFields;
  newWordStatus: SrsWordStatus;
}
