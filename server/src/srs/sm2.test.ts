import { describe, expect, it } from "vitest";
import {
  applyManualDemotion,
  applyReview,
  FIRST_INTERVAL_DAYS,
  MATURE_INTERVAL_DAYS,
  MIN_EASE,
  SECOND_INTERVAL_DAYS,
} from "./sm2.js";
import type { CardState, Grade } from "./types.js";

const NOW = new Date("2026-06-11T10:00:00.000Z");
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function card(overrides: Partial<CardState> = {}): CardState {
  // A freshly promoted card: ease 2.5, never reviewed, due now.
  return {
    word_id: 7,
    ease: 2.5,
    interval_days: 0,
    due_at: NOW.toISOString(),
    reps: 0,
    ...overrides,
  };
}

function daysFromNow(days: number): string {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

describe("applyReview — first review (reps 0)", () => {
  it("good → repetition 1, interval 1 day, ease unchanged, learning", () => {
    const { nextState, logEntry, newWordStatus } = applyReview(card(), "good", NOW);
    expect(nextState).toEqual({
      word_id: 7,
      ease: 2.5,
      interval_days: 1,
      due_at: daysFromNow(1),
      reps: 1,
    });
    expect(logEntry).toEqual({
      word_id: 7,
      ts: NOW.toISOString(),
      grade: "good",
      ease_after: 2.5,
      interval_after: 1,
      origin: "review",
    });
    expect(newWordStatus).toBe("learning");
  });

  it("easy → interval 1 day but ease rises by 0.1", () => {
    const { nextState } = applyReview(card(), "easy", NOW);
    expect(nextState.reps).toBe(1);
    expect(nextState.interval_days).toBe(1);
    expect(nextState.ease).toBe(2.6);
  });

  it("fail → reps stay 0, interval 1 day, ease drops by 0.32", () => {
    const { nextState, newWordStatus } = applyReview(card(), "fail", NOW);
    expect(nextState.reps).toBe(0);
    expect(nextState.interval_days).toBe(FIRST_INTERVAL_DAYS);
    expect(nextState.ease).toBe(2.18);
    expect(newWordStatus).toBe("learning");
  });
});

describe("applyReview — second review (reps 1)", () => {
  const second = card({ reps: 1, interval_days: 1 });

  it("good → repetition 2, interval 6 days", () => {
    const { nextState } = applyReview(second, "good", NOW);
    expect(nextState.reps).toBe(2);
    expect(nextState.interval_days).toBe(SECOND_INTERVAL_DAYS);
    expect(nextState.due_at).toBe(daysFromNow(6));
  });

  it("easy → still 6 days (fixed second interval), ease 2.6", () => {
    const { nextState } = applyReview(second, "easy", NOW);
    expect(nextState.interval_days).toBe(6);
    expect(nextState.ease).toBe(2.6);
  });

  it("fail → back to reps 0, interval 1", () => {
    const { nextState } = applyReview(second, "fail", NOW);
    expect(nextState.reps).toBe(0);
    expect(nextState.interval_days).toBe(1);
  });
});

describe("applyReview — nth review (reps ≥ 2): interval = round(prev × ease)", () => {
  it("good at reps 2, interval 6, ease 2.5 → round(6 × 2.5) = 15", () => {
    const { nextState } = applyReview(card({ reps: 2, interval_days: 6 }), "good", NOW);
    expect(nextState.interval_days).toBe(15);
    expect(nextState.reps).toBe(3);
    expect(nextState.due_at).toBe(daysFromNow(15));
  });

  it("easy lengthens more than good from the same state", () => {
    const state = card({ reps: 2, interval_days: 6 });
    const good = applyReview(state, "good", NOW);
    const easy = applyReview(state, "easy", NOW);
    // easy: ease 2.5 → 2.6, interval round(6 × 2.6) = 16 > good's 15
    expect(easy.nextState.interval_days).toBe(16);
    expect(easy.nextState.interval_days).toBeGreaterThan(good.nextState.interval_days);
  });

  it("a run of goods follows the SM-2 chain 1, 6, 15, 38, 95", () => {
    let state = card();
    const intervals: number[] = [];
    for (let i = 0; i < 5; i++) {
      state = applyReview(state, "good", NOW).nextState;
      intervals.push(state.interval_days);
    }
    expect(intervals).toEqual([1, 6, 15, 38, 95]);
    expect(state.reps).toBe(5);
    expect(state.ease).toBe(2.5); // good never moves ease
  });

  it("uses the updated ease for the new interval (easy run grows faster)", () => {
    // reps 2, interval 6, ease 2.5; easy → ease 2.6 first, then round(6 × 2.6) = 16
    const { nextState } = applyReview(card({ reps: 2, interval_days: 6 }), "easy", NOW);
    expect(nextState.ease).toBe(2.6);
    expect(nextState.interval_days).toBe(16);
  });
});

describe("applyReview — ease floor", () => {
  it("fail at the floor keeps ease pinned at 1.3", () => {
    const { nextState } = applyReview(card({ ease: 1.3, reps: 3, interval_days: 15 }), "fail", NOW);
    expect(nextState.ease).toBe(MIN_EASE);
  });

  it("fail just above the floor clamps to 1.3 rather than going under", () => {
    const { nextState } = applyReview(card({ ease: 1.5, reps: 2, interval_days: 6 }), "fail", NOW);
    expect(nextState.ease).toBe(1.3); // 1.5 − 0.32 = 1.18 → floored
  });

  it("a card at the floor still grows on good (interval × 1.3)", () => {
    const { nextState } = applyReview(card({ ease: 1.3, reps: 2, interval_days: 6 }), "good", NOW);
    expect(nextState.ease).toBe(1.3);
    expect(nextState.interval_days).toBe(8); // round(6 × 1.3) = 7.8 → 8
  });
});

describe("applyReview — failure resets and demotes", () => {
  it("fail on a mature card resets interval/reps and demotes to learning", () => {
    const mature = card({ reps: 6, interval_days: 95, ease: 2.5 });
    const { nextState, newWordStatus, logEntry } = applyReview(mature, "fail", NOW);
    expect(nextState.reps).toBe(0);
    expect(nextState.interval_days).toBe(1);
    expect(nextState.due_at).toBe(daysFromNow(1));
    expect(newWordStatus).toBe("learning");
    expect(logEntry.interval_after).toBe(1);
  });

  it("after a fail, repetitions restart from I(1)=1 then I(2)=6", () => {
    const failed = applyReview(card({ reps: 6, interval_days: 95 }), "fail", NOW).nextState;
    const first = applyReview(failed, "good", NOW);
    expect(first.nextState.interval_days).toBe(1);
    const second = applyReview(first.nextState, "good", NOW);
    expect(second.nextState.interval_days).toBe(6);
  });
});

describe("applyReview — maturity boundary at 21 days", () => {
  it("an interval landing exactly on 21 is mature", () => {
    // round(10 × 2.1) = 21; good leaves ease 2.1 untouched
    const { nextState, newWordStatus } = applyReview(
      card({ reps: 2, interval_days: 10, ease: 2.1 }),
      "good",
      NOW,
    );
    expect(nextState.interval_days).toBe(MATURE_INTERVAL_DAYS);
    expect(newWordStatus).toBe("mature");
  });

  it("an interval of 20 is still learning", () => {
    // round(8 × 2.5) = 20
    const { nextState, newWordStatus } = applyReview(
      card({ reps: 2, interval_days: 8, ease: 2.5 }),
      "good",
      NOW,
    );
    expect(nextState.interval_days).toBe(20);
    expect(newWordStatus).toBe("learning");
  });

  it("anything past 21 is mature too", () => {
    const { newWordStatus } = applyReview(card({ reps: 3, interval_days: 15 }), "good", NOW);
    expect(newWordStatus).toBe("mature"); // round(15 × 2.5) = 38
  });
});

describe("applyManualDemotion", () => {
  it("makes the card due now, resets interval/reps, drops ease by 0.15", () => {
    const mature = card({ reps: 6, interval_days: 95, ease: 2.5, due_at: daysFromNow(40) });
    const { nextState, logEntry, newWordStatus } = applyManualDemotion(mature, NOW);
    expect(nextState).toEqual({
      word_id: 7,
      ease: 2.35,
      interval_days: 0,
      due_at: NOW.toISOString(),
      reps: 0,
    });
    expect(logEntry).toEqual({
      word_id: 7,
      ts: NOW.toISOString(),
      grade: "fail",
      ease_after: 2.35,
      interval_after: 0,
      origin: "manual_demotion",
    });
    expect(newWordStatus).toBe("learning");
  });

  it("repeated demotions pin ease at the 1.3 floor", () => {
    let state = card({ ease: 1.5, reps: 4, interval_days: 30 });
    state = applyManualDemotion(state, NOW).nextState;
    expect(state.ease).toBe(1.35);
    state = applyManualDemotion(state, NOW).nextState;
    expect(state.ease).toBe(1.3); // 1.35 − 0.15 = 1.2 → floored
    state = applyManualDemotion(state, NOW).nextState;
    expect(state.ease).toBe(1.3); // stays pinned
  });

  it("a demoted card re-enters the normal SM-2 ladder on its next pass", () => {
    const demoted = applyManualDemotion(card({ reps: 5, interval_days: 38 }), NOW).nextState;
    const { nextState } = applyReview(demoted, "good", NOW);
    expect(nextState.reps).toBe(1);
    expect(nextState.interval_days).toBe(1);
  });
});

describe("purity and timestamp format", () => {
  it.each<Grade>(["fail", "good", "easy"])("applyReview(%s) does not mutate its input", (grade) => {
    const state = card({ reps: 2, interval_days: 6 });
    const frozen = { ...state };
    applyReview(state, grade, NOW);
    expect(state).toEqual(frozen);
  });

  it("applyManualDemotion does not mutate its input", () => {
    const state = card({ reps: 2, interval_days: 6 });
    const frozen = { ...state };
    applyManualDemotion(state, NOW);
    expect(state).toEqual(frozen);
  });

  it("all emitted timestamps are ISO-8601 UTC TEXT", () => {
    const review = applyReview(card({ reps: 2, interval_days: 6 }), "good", NOW);
    const demotion = applyManualDemotion(card(), NOW);
    for (const ts of [
      review.nextState.due_at,
      review.logEntry.ts,
      demotion.nextState.due_at,
      demotion.logEntry.ts,
    ]) {
      expect(ts).toMatch(ISO_UTC);
      expect(new Date(ts).toISOString()).toBe(ts);
    }
  });

  it("logEntry always mirrors nextState (ease_after, interval_after)", () => {
    for (const grade of ["fail", "good", "easy"] as const) {
      const { nextState, logEntry } = applyReview(card({ reps: 3, interval_days: 15 }), grade, NOW);
      expect(logEntry.ease_after).toBe(nextState.ease);
      expect(logEntry.interval_after).toBe(nextState.interval_days);
      expect(logEntry.word_id).toBe(nextState.word_id);
    }
  });
});
