/**
 * Classic SM-2 spaced repetition, in-house (no SRS library). Pure functions:
 * no DB access, no clock — callers pass `now` in.
 *
 * Constants and formula as implemented:
 *
 * - Grade → SM-2 quality: fail = 2, good = 4, easy = 5.
 * - Ease (E-Factor) update, applied on EVERY review including failures:
 *     ease' = ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
 *   which works out to: fail −0.32, good ±0, easy +0.10.
 *   Floor: ease never drops below 1.3. Ease is rounded to 2 decimals to keep
 *   stored values stable across long review histories.
 * - Intervals on a passing grade (good/easy):
 *     repetition 1 → 1 day, repetition 2 → 6 days,
 *     repetition n>2 → round(previous interval × updated ease).
 * - Fail resets per SM-2: reps → 0, interval → 1 day (repetitions restart at
 *   I(1) on the next pass), and a mature card demotes back to `learning`.
 * - Maturity: a word is `mature` iff interval_days ≥ 21, else `learning`.
 * - Manual "I forgot this" demotion: due immediately (due_at = now),
 *   interval → 0, reps → 0, ease − 0.15 (floor 1.3), origin
 *   `manual_demotion`, logged with grade `fail`.
 * - due_at = now + interval_days × 24h, always ISO-8601 UTC TEXT.
 */

import type { CardState, Grade, ReviewResult, SrsWordStatus } from "./types.js";

export const MIN_EASE = 1.3;
export const MATURE_INTERVAL_DAYS = 21;
export const MANUAL_DEMOTION_EASE_STEP = 0.15;
export const FIRST_INTERVAL_DAYS = 1;
export const SECOND_INTERVAL_DAYS = 6;

const GRADE_QUALITY: Record<Grade, number> = { fail: 2, good: 4, easy: 5 };

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function roundEase(ease: number): number {
  return Math.round(ease * 100) / 100;
}

function statusFor(intervalDays: number): SrsWordStatus {
  return intervalDays >= MATURE_INTERVAL_DAYS ? "mature" : "learning";
}

function dueAt(now: Date, intervalDays: number): string {
  return new Date(now.getTime() + intervalDays * MS_PER_DAY).toISOString();
}

export function applyReview(state: CardState, grade: Grade, now: Date): ReviewResult {
  const q = GRADE_QUALITY[grade];
  const ease = Math.max(
    MIN_EASE,
    roundEase(state.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))),
  );

  let reps: number;
  let intervalDays: number;
  if (grade === "fail") {
    reps = 0;
    intervalDays = FIRST_INTERVAL_DAYS;
  } else {
    reps = state.reps + 1;
    if (reps === 1) intervalDays = FIRST_INTERVAL_DAYS;
    else if (reps === 2) intervalDays = SECOND_INTERVAL_DAYS;
    else intervalDays = Math.round(state.interval_days * ease);
  }

  const nextState: CardState = {
    word_id: state.word_id,
    ease,
    interval_days: intervalDays,
    due_at: dueAt(now, intervalDays),
    reps,
  };
  return {
    nextState,
    logEntry: {
      word_id: state.word_id,
      ts: now.toISOString(),
      grade,
      ease_after: ease,
      interval_after: intervalDays,
      origin: "review",
    },
    newWordStatus: statusFor(intervalDays),
  };
}

export function applyManualDemotion(state: CardState, now: Date): ReviewResult {
  const ease = Math.max(MIN_EASE, roundEase(state.ease - MANUAL_DEMOTION_EASE_STEP));
  const nextState: CardState = {
    word_id: state.word_id,
    ease,
    interval_days: 0,
    due_at: now.toISOString(),
    reps: 0,
  };
  return {
    nextState,
    logEntry: {
      word_id: state.word_id,
      ts: now.toISOString(),
      grade: "fail",
      ease_after: ease,
      interval_after: 0,
      origin: "manual_demotion",
    },
    newWordStatus: "learning",
  };
}
