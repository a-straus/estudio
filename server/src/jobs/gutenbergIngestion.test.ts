import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb, type DB } from "../db/db.js";
import { runMigrations } from "../db/migrate.js";
import { logger } from "../logger.js";
import { LlmService } from "../llm/service.js";
import { loadPrompt } from "../llm/prompts.js";
import { LlmError, type LlmProvider, type VisionParams } from "../llm/types.js";
import { JobQueue } from "./queue.js";
import {
  CANDIDATES_PER_BATCH,
  enqueueGutenbergIngestion,
  estimateGutenbergCostUsd,
  gutenbergChunkCount,
  gutenbergChunks,
  gutenbergWordCount,
  runGutenbergIngestion,
} from "./gutenbergIngestion.js";

let dataDir: string;
let db: DB;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "estudio-gutenberg-"));
  db = openDb(dataDir);
  runMigrations(db, dataDir);
});

afterEach(() => {
  logger.detachDb();
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

/** An English candidate word as the gutenberg_extraction prompt returns it. */
function word(term: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    term,
    lemma: term,
    part_of_speech: "noun",
    definition_es: null,
    definition_en: `an English definition of ${term}`,
    example: `A sentence using ${term}.`,
    level: "C2",
    likely_known: 0.2,
    ...overrides,
  };
}

interface MockImpl {
  extract?: (call: VisionParams, n: number) => string;
}

function makeLlm(impl: MockImpl) {
  const calls: VisionParams[] = [];
  db.prepare("INSERT INTO setting (key, value) VALUES (?, ?)").run(
    "llm.gutenberg_extraction",
    JSON.stringify({ provider: "mock", model: "mock-gutenberg" }),
  );
  const provider: LlmProvider = {
    name: "mock",
    complete: () => Promise.reject(new Error("complete not used")),
    vision: async (params) => {
      calls.push(params);
      const fn = impl.extract ?? (() => '{"words": []}');
      return {
        text: fn(params, calls.length),
        usage: {
          tokensIn: 100,
          tokensOut: 20,
          cacheHit: false,
          costEstimateUsd: 0.002,
        },
      };
    },
  };
  return {
    llm: new LlmService(db, { mock: provider }, { backoffBaseMs: 0 }),
    calls,
  };
}

/** A gutenberg source with stored text + one pending page per candidate chunk. */
function makeSource(text: string): number {
  const now = "2026-01-01T00:00:00Z";
  const sourceId = Number(
    db
      .prepare(
        "INSERT INTO source (type, title, ref, transcript, language, created_at, updated_at) VALUES ('gutenberg', 'Book', '10', ?, 'en', ?, ?)",
      )
      .run(text, now, now).lastInsertRowid,
  );
  const insert = db.prepare(
    "INSERT INTO source_page (source_id, page_no, kind, status, created_at, updated_at) VALUES (?, ?, 'vocab', 'pending', ?, ?)",
  );
  for (let i = 1; i <= gutenbergChunkCount(text); i++) {
    insert.run(sourceId, i, now, now);
  }
  return sourceId;
}

function pageRows(sourceId: number) {
  return db
    .prepare(
      "SELECT id, page_no, status, error FROM source_page WHERE source_id = ? ORDER BY page_no",
    )
    .all(sourceId) as {
    id: number;
    page_no: number;
    status: string;
    error: string | null;
  }[];
}

function itemRows(sourceId: number) {
  return db
    .prepare(
      "SELECT term, definition_es, definition_en, batch_no, decision FROM extraction_item WHERE source_id = ? ORDER BY id",
    )
    .all(sourceId) as Record<string, unknown>[];
}

const TEXT = "firmament propitiation raiment concupiscence habergeon covet";

// Distinct LETTER-ONLY candidate words (the tokenizer captures letters only, so
// digits would collapse to one type). i → "qa", "qb", … "qcae".
function alphaWord(i: number): string {
  return (
    "q" +
    String(i)
      .split("")
      .map((d) => "abcdefghij"[Number(d)])
      .join("")
  );
}
const MANY = Array.from({ length: CANDIDATES_PER_BATCH + 5 }, (_, i) =>
  alphaWord(i),
).join(" ");

describe("gutenberg_extraction prompt", () => {
  const { text } = loadPrompt("gutenberg_extraction");

  it("keeps the GOAL §6.1 rubric sentence near-verbatim", () => {
    expect(text).toMatch(
      /advanced, or .*words? that a reasonable, intelligent college student wouldn't know/i,
    );
  });

  it("carries the archaic include/exclude guidance", () => {
    expect(text).toMatch(/Exclude/);
    expect(text).toContain("thee");
    expect(text).toContain("saith");
    expect(text).toMatch(/Include/);
    expect(text).toContain("concupiscence");
    expect(text).toContain("propitiation");
  });

  it("preserves the shared extraction output JSON keys", () => {
    for (const key of [
      "term",
      "lemma",
      "part_of_speech",
      "definition_es",
      "definition_en",
      "example",
      "level",
      "likely_known",
    ]) {
      expect(text).toContain(key);
    }
    expect(text).toContain("{{calibration_sample}}");
    expect(text).toContain("{{chunk_text}}");
  });
});

describe("gutenbergChunks / counts", () => {
  it("chunks the pre-pass candidate words into LLM batches", () => {
    const chunks = gutenbergChunks(TEXT);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].split("\n")).toContain("firmament");
    expect(gutenbergWordCount(TEXT)).toBe(6);
    expect(gutenbergChunkCount(TEXT)).toBe(1);
  });

  it("splits more than CANDIDATES_PER_BATCH words across chunks", () => {
    expect(gutenbergChunkCount(MANY)).toBe(2);
    expect(gutenbergChunks(MANY)).toHaveLength(2);
  });
});

describe("estimateGutenbergCostUsd", () => {
  it("scales with the candidate count and is zero for an unknown model", () => {
    const cost = estimateGutenbergCostUsd(12000, "claude-opus-4-8");
    expect(cost).toBeGreaterThan(0);
    // More words → larger estimate.
    expect(estimateGutenbergCostUsd(24000, "claude-opus-4-8")).toBeGreaterThan(
      cost,
    );
    expect(estimateGutenbergCostUsd(12000, "unknown-model")).toBe(0);
    expect(estimateGutenbergCostUsd(0, "claude-opus-4-8")).toBe(0);
  });

  it("does not undershoot the real KJV run (9034 candidates, actual $7.41 on opus)", () => {
    // Constants are calibrated to this run; estimate must always be >= real cost.
    const estimate = estimateGutenbergCostUsd(9034, "claude-opus-4-8");
    expect(estimate).toBeGreaterThanOrEqual(7.41);
    // A small book still produces a small positive estimate (not zero).
    expect(estimateGutenbergCostUsd(5, "claude-opus-4-8")).toBeGreaterThan(0);
  });
});

describe("runGutenbergIngestion", () => {
  it("writes English extraction items (definition_en set, definition_es null)", async () => {
    const sourceId = makeSource(TEXT);
    const { llm, calls } = makeLlm({
      extract: () =>
        JSON.stringify({ words: [word("firmament"), word("propitiation")] }),
    });

    const result = await runGutenbergIngestion(db, llm, { sourceId });
    expect(result).toEqual({ pages: { 1: "done" } });

    const items = itemRows(sourceId);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      term: "firmament",
      definition_es: null,
      decision: "pending",
      batch_no: 1,
    });
    expect(items[0].definition_en).toContain("firmament");

    // Went through the gutenberg_extraction prompt as an English, no-attachment
    // call carrying the candidate word list.
    expect(calls).toHaveLength(1);
    expect(calls[0].attachments).toEqual([]);
    expect(calls[0].prompt).toContain("firmament");
    expect(calls[0].prompt).toContain("**en**");
    expect(pageRows(sourceId)[0].status).toBe("done");
  });

  it("groups extraction items into ~50-size triage batches", async () => {
    const sourceId = makeSource(TEXT);
    const { llm } = makeLlm({
      extract: () =>
        JSON.stringify({
          words: Array.from({ length: 60 }, (_, i) => word(`term${i}`)),
        }),
    });

    await runGutenbergIngestion(db, llm, { sourceId });

    const items = itemRows(sourceId);
    expect(items).toHaveLength(60);
    expect(items.filter((i) => i.batch_no === 1)).toHaveLength(50);
    expect(items.filter((i) => i.batch_no === 2)).toHaveLength(10);
  });

  it("records a per-chunk failure and throws (queue retries)", async () => {
    const sourceId = makeSource(MANY);
    const { llm } = makeLlm({
      extract: (_c, n) => {
        if (n === 2) throw new LlmError("model blew up", { retryable: false });
        return JSON.stringify({ words: [word("firmament")] });
      },
    });

    await expect(
      runGutenbergIngestion(db, llm, { sourceId }),
    ).rejects.toThrow("1 of 2 chunks failed");
    const pages = pageRows(sourceId);
    expect(pages[0].status).toBe("done");
    expect(pages[1].status).toBe("failed");
    expect(pages[1].error).toContain("model blew up");
  });

  it("resumes: completed chunks are skipped on rerun", async () => {
    const sourceId = makeSource(MANY);
    const queue = new JobQueue(db, { backoffBaseMs: 0 });
    const jobId = enqueueGutenbergIngestion(db, queue, { sourceId });
    const payload = JSON.parse(
      (
        db.prepare("SELECT payload FROM job WHERE id = ?").get(jobId) as {
          payload: string;
        }
      ).payload,
    ) as { sourceId: number; jobId: number };
    expect(payload).toEqual({ sourceId, jobId });

    // Pretend chunk 1 completed on a prior attempt.
    db.prepare(
      "UPDATE source_page SET status = 'done' WHERE source_id = ? AND page_no = 1",
    ).run(sourceId);

    const { llm, calls } = makeLlm({
      extract: () => JSON.stringify({ words: [word("propitiation")] }),
    });
    await runGutenbergIngestion(db, llm, payload);

    expect(calls).toHaveLength(1); // only chunk 2 hit the LLM
    expect(pageRows(sourceId).every((p) => p.status === "done")).toBe(true);
  });
});
