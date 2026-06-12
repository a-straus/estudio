import { describe, expect, it } from "vitest";
import type { ExtractionItemView } from "@estudio/shared";
import { flowOrder, nextPendingId } from "./Triage";

// Minimal item factory — only the fields the advance logic reads (id, decision,
// likelyKnown for grouping) matter here.
function it_(
  id: number,
  decision: ExtractionItemView["decision"],
  likelyKnown = 0.1,
): ExtractionItemView {
  return {
    id,
    term: `w${id}`,
    sourceId: 1,
    lemma: null,
    partOfSpeech: null,
    definitionEs: null,
    definitionEn: null,
    example: null,
    level: null,
    likelyKnown,
    batchNo: 1,
    decision,
    decidedAt: decision === "pending" ? null : "2026-01-01T00:00:00Z",
    wordId: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("flowOrder", () => {
  it("puts probably-new words before may-know words, regardless of input order", () => {
    const items = [
      it_(10, "pending", 0.9), // may_know
      it_(20, "pending", 0.1), // probably_new
      it_(30, "pending", 0.6), // may_know
      it_(40, "pending", 0.2), // probably_new
    ];
    expect(flowOrder(items).map((i) => i.id)).toEqual([20, 40, 10, 30]);
  });
});

describe("nextPendingId", () => {
  it("seeds on the first pending word in flow order (decidedId = null)", () => {
    // Server order leads with a may_know word, but the cursor must start on the
    // first probably-new word the user actually sees at the top.
    const items = [it_(10, "pending", 0.9), it_(20, "pending", 0.1)];
    expect(nextPendingId(items, null)).toBe(20);
  });

  it("advances to the immediately-next pending word", () => {
    const items = [
      it_(1, "learn"),
      it_(2, "pending"),
      it_(3, "pending"),
    ];
    expect(nextPendingId(items, 1)).toBe(2);
  });

  it("does not skip a pending word that sits between the decided one and the next", () => {
    // The original bug: deciding word 1 jumped to word 3, skipping word 2.
    const items = [it_(1, "learn"), it_(2, "pending"), it_(3, "pending")];
    expect(nextPendingId(items, 1)).toBe(2);
    expect(nextPendingId(items, 1)).not.toBe(3);
  });

  it("steps over already-decided words to reach the next pending one", () => {
    const items = [
      it_(1, "learn"),
      it_(2, "know"),
      it_(3, "skip"),
      it_(4, "pending"),
    ];
    expect(nextPendingId(items, 1)).toBe(4);
  });

  it("wraps to the earliest remaining pending word when none follow", () => {
    // Cursor was moved to the last word and decided; earlier words remain.
    const items = [
      it_(1, "pending"),
      it_(2, "pending"),
      it_(3, "learn"),
    ];
    expect(nextPendingId(items, 3)).toBe(1);
  });

  it("crosses the group boundary in flow order, not server order", () => {
    // probably_new: 20 (decided), 40 (pending) — may_know: 10 (pending)
    const items = [
      it_(10, "pending", 0.9),
      it_(20, "learn", 0.1),
      it_(40, "pending", 0.1),
    ];
    // After deciding 20, the next pending in flow order is its group-mate 40,
    // before crossing into the may_know group.
    expect(nextPendingId(items, 20)).toBe(40);
    // After 40, cross into may_know for 10.
    const items2 = [
      it_(10, "pending", 0.9),
      it_(20, "learn", 0.1),
      it_(40, "learn", 0.1),
    ];
    expect(nextPendingId(items2, 40)).toBe(10);
  });

  it("returns null when nothing is left to decide", () => {
    const items = [it_(1, "learn"), it_(2, "skip")];
    expect(nextPendingId(items, 2)).toBeNull();
  });

  it("visits every pending word exactly once across a full sequential run", () => {
    // Simulate the real loop: decide the current word, then advance, until done.
    let items = [
      it_(10, "pending", 0.9), // may_know
      it_(20, "pending", 0.1), // probably_new
      it_(30, "pending", 0.1), // probably_new
    ];
    const visited: number[] = [];
    let current = nextPendingId(items, null);
    while (current !== null) {
      visited.push(current);
      // mark the current word decided, as the UI would after a PATCH
      items = items.map((i) =>
        i.id === current ? { ...i, decision: "learn" as const } : i,
      );
      current = nextPendingId(items, current);
    }
    expect(visited.sort((a, b) => a - b)).toEqual([10, 20, 30]);
    // exactly once each — no duplicates, no skips
    expect(visited).toHaveLength(3);
  });
});
