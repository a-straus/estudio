import { describe, expect, it } from "vitest";
import { buildReviewSession, DEFAULT_NEW_CARDS_PER_DAY, INITIAL_EASE } from "./queue.js";
import type { CardState } from "./types.js";

const NOW = new Date("2026-06-11T10:00:00.000Z");

function dueCard(word_id: number, due_at: string): CardState {
  return { word_id, ease: 2.5, interval_days: 6, due_at, reps: 2 };
}

/** rng that replays a fixed sequence — deterministic by construction. */
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

const words = (...ids: number[]) => ids.map((id) => ({ id }));

describe("buildReviewSession — promotions", () => {
  it("promotes up to newCardsPerDay minus alreadyPromotedToday", () => {
    const { promotions } = buildReviewSession({
      dueCards: [],
      newWords: words(1, 2, 3, 4, 5),
      newCardsPerDay: 5,
      alreadyPromotedToday: 2,
      now: NOW,
      rng: seqRng([0]),
    });
    expect(promotions.map((p) => p.word_id)).toEqual([1, 2, 3]);
  });

  it("creates card_state rows due now with SM-2 starting values", () => {
    const { promotions } = buildReviewSession({
      dueCards: [],
      newWords: words(42),
      newCardsPerDay: 20,
      alreadyPromotedToday: 0,
      now: NOW,
      rng: seqRng([0]),
    });
    expect(promotions).toEqual([
      { word_id: 42, ease: INITIAL_EASE, interval_days: 0, due_at: NOW.toISOString(), reps: 0 },
    ]);
  });

  it("promotes nothing once the daily budget is used up", () => {
    const { promotions, queue } = buildReviewSession({
      dueCards: [],
      newWords: words(1, 2),
      newCardsPerDay: 20,
      alreadyPromotedToday: 20,
      now: NOW,
      rng: seqRng([0]),
    });
    expect(promotions).toEqual([]);
    expect(queue).toEqual([]);
  });

  it("promotes nothing when alreadyPromotedToday exceeds the cap", () => {
    const { promotions } = buildReviewSession({
      dueCards: [],
      newWords: words(1),
      newCardsPerDay: 5,
      alreadyPromotedToday: 9,
      now: NOW,
      rng: seqRng([0]),
    });
    expect(promotions).toEqual([]);
  });

  it("promotes all new words when there are fewer than the budget", () => {
    const { promotions } = buildReviewSession({
      dueCards: [],
      newWords: words(1, 2),
      newCardsPerDay: 20,
      alreadyPromotedToday: 0,
      now: NOW,
      rng: seqRng([0]),
    });
    expect(promotions).toHaveLength(2);
  });

  it("defaults newCardsPerDay to 20", () => {
    expect(DEFAULT_NEW_CARDS_PER_DAY).toBe(20);
    const { promotions } = buildReviewSession({
      dueCards: [],
      newWords: words(...Array.from({ length: 25 }, (_, i) => i + 1)),
      alreadyPromotedToday: 0,
      now: NOW,
      rng: seqRng([0]),
    });
    expect(promotions).toHaveLength(20);
  });
});

describe("buildReviewSession — study order", () => {
  it("queues due cards oldest-due first, then promoted cards in input order", () => {
    const { queue } = buildReviewSession({
      dueCards: [
        dueCard(3, "2026-06-11T09:00:00.000Z"),
        dueCard(1, "2026-06-09T08:00:00.000Z"),
        dueCard(2, "2026-06-10T08:00:00.000Z"),
      ],
      newWords: words(10, 11),
      newCardsPerDay: 20,
      alreadyPromotedToday: 0,
      now: NOW,
      rng: seqRng([0]),
    });
    expect(queue.map((c) => c.word_id)).toEqual([1, 2, 3, 10, 11]);
  });

  it("breaks due_at ties by word_id", () => {
    const ts = "2026-06-10T08:00:00.000Z";
    const { queue } = buildReviewSession({
      dueCards: [dueCard(9, ts), dueCard(4, ts)],
      newWords: [],
      newCardsPerDay: 20,
      alreadyPromotedToday: 0,
      now: NOW,
      rng: seqRng([0]),
    });
    expect(queue.map((c) => c.word_id)).toEqual([4, 9]);
  });
});

describe("buildReviewSession — per-card direction", () => {
  it("assigns w2d when rng() < 0.5 and d2w otherwise, in queue order", () => {
    const { perCardDirection } = buildReviewSession({
      dueCards: [dueCard(1, "2026-06-09T08:00:00.000Z"), dueCard(2, "2026-06-10T08:00:00.000Z")],
      newWords: words(3, 4),
      newCardsPerDay: 20,
      alreadyPromotedToday: 0,
      now: NOW,
      rng: seqRng([0.1, 0.9, 0.49, 0.5]),
    });
    expect(perCardDirection).toEqual({ 1: "w2d", 2: "d2w", 3: "w2d", 4: "d2w" });
  });

  it("covers every card in the queue", () => {
    const { queue, perCardDirection } = buildReviewSession({
      dueCards: [dueCard(1, "2026-06-09T08:00:00.000Z")],
      newWords: words(2, 3),
      newCardsPerDay: 20,
      alreadyPromotedToday: 0,
      now: NOW,
      rng: seqRng([0.7]),
    });
    for (const card of queue) {
      expect(perCardDirection[card.word_id]).toMatch(/^(w2d|d2w)$/);
    }
    expect(Object.keys(perCardDirection)).toHaveLength(queue.length);
  });
});

describe("buildReviewSession — determinism, purity, empty inputs", () => {
  it("returns identical sessions for identical inputs and rng sequences", () => {
    const input = () => ({
      dueCards: [dueCard(5, "2026-06-10T08:00:00.000Z"), dueCard(2, "2026-06-09T08:00:00.000Z")],
      newWords: words(8, 9, 10),
      newCardsPerDay: 2,
      alreadyPromotedToday: 0,
      now: NOW,
      rng: seqRng([0.3, 0.8, 0.6, 0.2]),
    });
    expect(buildReviewSession(input())).toEqual(buildReviewSession(input()));
  });

  it("does not mutate its inputs", () => {
    const dueCards = [dueCard(5, "2026-06-10T08:00:00.000Z"), dueCard(2, "2026-06-09T08:00:00.000Z")];
    const newWords = words(8, 9);
    buildReviewSession({
      dueCards,
      newWords,
      newCardsPerDay: 20,
      alreadyPromotedToday: 0,
      now: NOW,
      rng: seqRng([0.5]),
    });
    expect(dueCards.map((c) => c.word_id)).toEqual([5, 2]); // original order intact
    expect(newWords).toEqual(words(8, 9));
  });

  it("handles empty inputs", () => {
    const session = buildReviewSession({
      dueCards: [],
      newWords: [],
      newCardsPerDay: 20,
      alreadyPromotedToday: 0,
      now: NOW,
      rng: seqRng([0.5]),
    });
    expect(session).toEqual({ promotions: [], queue: [], perCardDirection: {} });
  });

  it("emits ISO-8601 UTC TEXT due_at on promotions", () => {
    const { promotions } = buildReviewSession({
      dueCards: [],
      newWords: words(1),
      newCardsPerDay: 20,
      alreadyPromotedToday: 0,
      now: NOW,
      rng: seqRng([0.5]),
    });
    const dueAt = promotions[0].due_at;
    expect(dueAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(new Date(dueAt).toISOString()).toBe(dueAt);
  });
});
