import { describe, expect, it } from "vitest";
import {
  estimateLevel,
  nextStep,
  type Band,
  type BandResult,
} from "./adaptive.js";

function band(b: Band, known: number, total: number): BandResult {
  return { band: b, known, total };
}

describe("nextStep — initial call", () => {
  it("starts at C1 when no bands completed", () => {
    const r = nextStep([]);
    expect(r).toEqual({ done: false, nextBand: "C1" });
  });
});

describe("nextStep — climb (≥2/3 known)", () => {
  it("climbs from C1 to C2 when 4/6 known", () => {
    const r = nextStep([band("C1", 4, 6)]);
    expect(r).toEqual({ done: false, nextBand: "C2" });
  });

  it("climbs from B2 to C1 when 6/6 known", () => {
    const r = nextStep([band("B2", 6, 6)]);
    expect(r).toEqual({ done: false, nextBand: "C1" });
  });

  it("climbs from C2 to rare-archaic when 5/6 known", () => {
    const r = nextStep([band("C2", 5, 6)]);
    expect(r).toEqual({ done: false, nextBand: "rare-archaic" });
  });

  it("stops (done) when already at top band and ≥2/3", () => {
    const r = nextStep([band("rare-archaic", 4, 6)]);
    expect(r).toEqual({ done: true, level: "rare-archaic" });
  });
});

describe("nextStep — descend (≤1/3 known)", () => {
  it("descends from C1 to B2 when 2/6 known", () => {
    const r = nextStep([band("C1", 2, 6)]);
    expect(r).toEqual({ done: false, nextBand: "B2" });
  });

  it("stops when already at bottom band and ≤1/3", () => {
    const r = nextStep([band("B2", 1, 6)]);
    expect(r).toEqual({ done: true, level: "B2" });
  });

  it("stops when descent band was already visited", () => {
    // B2 served first (4/6 = 67% → climb), then C1 (1/6 = 16% → descend).
    // B2 already done → stop. Level = B2 (highest band with >50% known).
    const r = nextStep([band("B2", 4, 6), band("C1", 1, 6)]);
    expect(r).toEqual({ done: true, level: "B2" });
  });
});

describe("nextStep — climb guard (already-visited band)", () => {
  it("stops (done) when climb would re-serve an already-visited band", () => {
    // C1 served first (1/6 = 16% → descend to B2); B2 passes (4/6 = 67% → climb).
    // C1 already done → stop instead of re-serving identical cached words.
    const r = nextStep([band("C1", 1, 6), band("B2", 4, 6)]);
    expect(r).toEqual({ done: true, level: "B2" });
  });
});

describe("nextStep — boundary (1/3 < ratio < 2/3)", () => {
  it("stops when exactly at boundary (3/6)", () => {
    const r = nextStep([band("C1", 3, 6)]);
    expect(r).toEqual({ done: true, level: "B2" });
  });

  it("stops at boundary regardless of prior bands", () => {
    const r = nextStep([band("C1", 4, 6), band("C2", 3, 6)]);
    expect(r).toEqual({ done: true, level: "C1" });
  });
});

describe("nextStep — hard cap (4 bands)", () => {
  it("stops at cap even if still climbing", () => {
    const r = nextStep([
      band("C1", 6, 6),
      band("C2", 6, 6),
      band("rare-archaic", 6, 6),
      band("B2", 6, 6),
    ]);
    expect(r.done).toBe(true);
  });
});

describe("estimateLevel", () => {
  it("returns highest band with >50% known", () => {
    const level = estimateLevel([
      band("C1", 4, 6), // 67% → above 50%
      band("C2", 2, 6), // 33% → below 50%
    ]);
    expect(level).toBe("C1");
  });

  it("returns B2 when none cleared majority", () => {
    const level = estimateLevel([band("C1", 2, 6), band("C2", 1, 6)]);
    expect(level).toBe("B2");
  });

  it("picks the highest qualifying band", () => {
    const level = estimateLevel([
      band("B2", 5, 6),
      band("C1", 4, 6),
      band("C2", 2, 6),
    ]);
    expect(level).toBe("C1");
  });

  it("handles rare-archaic as highest", () => {
    const level = estimateLevel([
      band("C1", 4, 6),
      band("C2", 4, 6),
      band("rare-archaic", 4, 6),
    ]);
    expect(level).toBe("rare-archaic");
  });

  it("returns B2 for empty results", () => {
    expect(estimateLevel([])).toBe("B2");
  });
});
