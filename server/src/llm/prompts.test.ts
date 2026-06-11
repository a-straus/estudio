import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadPrompt, promptsDir } from "./prompts.js";

function rawTemplate(task: string): string {
  return fs.readFileSync(path.join(promptsDir, `${task}.md`), "utf8");
}

describe("loadPrompt substitution", () => {
  it("fills a {{placeholder}} with the provided value", () => {
    const { text } = loadPrompt("pdf_extraction", {
      calibration_sample: "madrugar, soñar, alborada",
    });
    expect(text).toContain("madrugar, soñar, alborada");
    expect(text).not.toContain("{{calibration_sample}}");
  });

  it("leaves the placeholder untouched when no substitution is given", () => {
    const { text } = loadPrompt("pdf_extraction");
    expect(text).toBe(rawTemplate("pdf_extraction"));
    expect(text).toContain("{{calibration_sample}}");
  });

  it("renders an empty-string value cleanly (no leftover braces)", () => {
    const { text } = loadPrompt("pdf_extraction", { calibration_sample: "" });
    expect(text).not.toContain("{{calibration_sample}}");
  });

  it("ignores placeholders that have no matching key", () => {
    const { text } = loadPrompt("pdf_extraction", { unrelated_key: "x" });
    expect(text).toContain("{{calibration_sample}}");
  });

  it("version hashes the raw template, independent of the substituted text", () => {
    const expected = crypto
      .createHash("sha256")
      .update(rawTemplate("pdf_extraction"))
      .digest("hex")
      .slice(0, 12);
    const a = loadPrompt("pdf_extraction");
    const b = loadPrompt("pdf_extraction", { calibration_sample: "anything" });
    expect(a.version).toBe(expected);
    expect(b.version).toBe(expected);
  });
});
