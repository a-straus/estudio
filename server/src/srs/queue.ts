/**
 * Pure review-queue builder. Promotes up to `newCardsPerDay −
 * alreadyPromotedToday` new words at session start (deterministic, no cron),
 * creating card_state rows with due = now; the study queue is the due cards
 * (oldest due first, word_id as tiebreak) followed by the promoted cards in
 * input order. Each card's review direction is drawn from the injected `rng`
 * in queue order (rng() < 0.5 → w2d, else d2w), so the whole session is
 * deterministic given its inputs.
 */

import type { CardState, ReviewDirection } from "./types.js";

export const DEFAULT_NEW_CARDS_PER_DAY = 20;
export const INITIAL_EASE = 2.5;

export interface ReviewSessionInput {
  /** card_state rows already due (caller queries due_at <= now). */
  dueCards: CardState[];
  /** Words with status `new`, in promotion priority order. */
  newWords: { id: number }[];
  newCardsPerDay?: number;
  alreadyPromotedToday: number;
  now: Date;
  /** Returns a number in [0, 1); injectable for deterministic tests. */
  rng: () => number;
}

export interface ReviewSession {
  /** card_state rows to create (due = now) for the promoted new words. */
  promotions: CardState[];
  /** Due cards + promoted cards, in study order. */
  queue: CardState[];
  /** word_id → direction for each card in the queue. */
  perCardDirection: Record<number, ReviewDirection>;
}

export function buildReviewSession({
  dueCards,
  newWords,
  newCardsPerDay = DEFAULT_NEW_CARDS_PER_DAY,
  alreadyPromotedToday,
  now,
  rng,
}: ReviewSessionInput): ReviewSession {
  const budget = Math.max(0, newCardsPerDay - alreadyPromotedToday);
  const nowIso = now.toISOString();

  const promotions: CardState[] = newWords.slice(0, budget).map((word) => ({
    word_id: word.id,
    ease: INITIAL_EASE,
    interval_days: 0,
    due_at: nowIso,
    reps: 0,
  }));

  const sortedDue = [...dueCards].sort(
    (a, b) => a.due_at.localeCompare(b.due_at) || a.word_id - b.word_id,
  );
  const queue = [...sortedDue, ...promotions];

  const perCardDirection: Record<number, ReviewDirection> = {};
  for (const card of queue) {
    perCardDirection[card.word_id] = rng() < 0.5 ? "w2d" : "d2w";
  }

  return { promotions, queue, perCardDirection };
}
