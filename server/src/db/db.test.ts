import { describe, expect, it } from "vitest";
import { nowIso } from "./db.js";

describe("nowIso", () => {
  it("returns second-precision ISO-8601 UTC, same format as the SQL DEFAULTs", () => {
    const ts = nowIso();
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    // Still a valid instant.
    expect(Number.isNaN(new Date(ts).getTime())).toBe(false);
  });
});
