import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb, type DB } from "../db/db.js";
import { runMigrations } from "../db/migrate.js";
import { logger } from "../logger.js";
import { LlmService } from "../llm/service.js";
import type { LlmProvider, VisionParams } from "../llm/types.js";
import { deckIdForLanguage } from "../db/triage-queries.js";
import { runGutenbergValidation } from "./validate-gutenberg.js";

// This proves the harness WIRING end to end with BOTH seams injected — no real
// network fetch, no real LLM call. The live script runs the same
// runGutenbergValidation() against the real fetch + AnthropicProvider.

let dataDir: string;
let db: DB;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "estudio-validate-gutenberg-"));
  db = openDb(dataDir);
  runMigrations(db, dataDir);
});

afterEach(() => {
  logger.detachDb();
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

/**
 * A mocked gutenberg_extraction provider: keeps every word in `keepers` that
 * appears in the candidate list it is sent, drops everything else. No network,
 * no real model.
 */
function makeLlm(keepers: string[]) {
  const calls: VisionParams[] = [];
  db.prepare("INSERT OR IGNORE INTO setting (key, value) VALUES (?, ?)").run(
    "llm.gutenberg_extraction",
    JSON.stringify({ provider: "mock", model: "mock-gutenberg" }),
  );
  const provider: LlmProvider = {
    name: "mock",
    complete: () => Promise.reject(new Error("complete not used")),
    vision: async (params) => {
      calls.push(params);
      const kept = keepers.filter((w) => params.prompt.includes(w));
      const words = kept.map((term) => ({
        term,
        lemma: term,
        part_of_speech: "noun",
        definition_es: null,
        definition_en: `an English definition of ${term}`,
        example: `A sentence using ${term}.`,
        level: "C2",
        likely_known: 0.1,
      }));
      return {
        text: JSON.stringify({ words }),
        usage: {
          tokensIn: 120,
          tokensOut: 30,
          cacheHit: false,
          costEstimateUsd: 0.003,
        },
      };
    },
  };
  return {
    llm: new LlmService(db, { mock: provider }, { backoffBaseMs: 0 }),
    calls,
  };
}

/** Wrap a body in the real Gutenberg license markers so the strip has work to do. */
function gutenbergText(body: string): string {
  return [
    "The Project Gutenberg eBook of A Test Book",
    "Title: A Test Book",
    "",
    "*** START OF THE PROJECT GUTENBERG EBOOK A TEST BOOK ***",
    "",
    body,
    "",
    "*** END OF THE PROJECT GUTENBERG EBOOK A TEST BOOK ***",
    "Some trailing license boilerplate that must be stripped.",
  ].join("\n");
}

describe("runGutenbergValidation", () => {
  it("persists a gutenberg/en source, lands the kept word in the English deck, and reports coverage", async () => {
    // concupiscence = archaic KEEPER, thou = archaic NOISE (pre-pass drops it),
    // house = common word the rubric drops. Repeated so they survive the pre-pass.
    const body =
      "Concupiscence and concupiscence again, thou and thou, the house and a house, " +
      "covet desire flesh sin.";
    const { llm, calls } = makeLlm(["concupiscence"]);

    const result = await runGutenbergValidation({
      db,
      dataDir,
      fetchGutenberg: async () => gutenbergText(body),
      llm,
      ref: "10",
    });

    // The stub was used — no real network.
    expect(calls.length).toBeGreaterThan(0);

    // Source persisted as the route does: type 'gutenberg', language 'en', with
    // the stripped (boilerplate-free) text on transcript.
    const src = db
      .prepare("SELECT type, language, transcript FROM source WHERE id = ?")
      .get(result.sourceId) as {
      type: string;
      language: string;
      transcript: string;
    };
    expect(src.type).toBe("gutenberg");
    expect(src.language).toBe("en");
    expect(src.transcript).toContain("concupiscence");
    expect(src.transcript).not.toContain("license boilerplate");

    // The kept word landed in the English deck (and ONLY the keeper).
    expect(result.keptWords).toEqual(["concupiscence"]);
    const enDeck = deckIdForLanguage(db, "en");
    const deckWords = db
      .prepare("SELECT term FROM word WHERE deck_id = ? AND language = 'en'")
      .all(enDeck) as { term: string }[];
    expect(deckWords.map((w) => w.term)).toContain("concupiscence");
    // The common word never reached the deck.
    expect(deckWords.map((w) => w.term)).not.toContain("house");

    // The rubric kept one word out of several pre-pass candidates.
    expect(result.candidates).toBeGreaterThan(1);

    // Coverage indicator counts the extraction_item rows (= words the rubric
    // kept): one row, triaged, materialized, and still untested.
    expect(result.coverage.total).toBe(1);
    expect(result.coverage.triaged).toBe(1);
    expect(result.coverage.kept).toBe(1);
    expect(result.coverage.untested).toBe(1);

    // Real token/cost numbers summed from the llm_call rows the job wrote.
    expect(result.tokensIn).toBeGreaterThan(0);
    expect(result.tokensOut).toBeGreaterThan(0);
    expect(result.costUsd).toBeGreaterThan(0);
    expect(result.tokensPerCandidateIn).toBeCloseTo(
      result.tokensIn / result.candidates,
    );
  });

  it("maxWords caps the candidate set to a bounded slice", async () => {
    // 30 distinct LETTER-ONLY candidate words (the tokenizer captures letters
    // only, so digit suffixes would collapse to one type). None are
    // stopwords/archaic, so all survive the pre-pass.
    const letters = "abcdefghijklmnopqrstuvwxyz";
    const words = Array.from(
      { length: 30 },
      (_, i) => `zeta${letters[Math.floor(i / 5)]}${letters[i % 5]}`,
    );
    const body = words.join(" ");
    const text = gutenbergText(body);

    const uncapped = await runGutenbergValidation({
      db,
      dataDir,
      fetchGutenberg: async () => text,
      llm: makeLlm([]).llm,
      ref: "10",
    });
    expect(uncapped.candidates).toBe(30);

    const capped = await runGutenbergValidation({
      db,
      dataDir,
      fetchGutenberg: async () => text,
      llm: makeLlm([]).llm,
      ref: "10",
      maxWords: 8,
    });
    expect(capped.candidates).toBeLessThanOrEqual(8);
    expect(capped.candidates).toBeLessThan(uncapped.candidates);
  });
});
