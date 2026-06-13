import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Language } from "@estudio/shared";
import { openDb, type DB } from "../db/db.js";
import { runMigrations } from "../db/migrate.js";
import { logger } from "../logger.js";
import { LlmService } from "../llm/service.js";
import { LlmError, type LlmProvider, type VisionParams } from "../llm/types.js";
import { JobQueue } from "./queue.js";
import {
  chunkText,
  detectLanguage,
  enqueueTextIngestion,
  extractJson,
  runTextIngestion,
} from "./textIngestion.js";

let dataDir: string;
let db: DB;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "estudio-text-"));
  db = openDb(dataDir);
  runMigrations(db, dataDir);
});

afterEach(() => {
  logger.detachDb();
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("extractJson", () => {
  it("parses well-formed JSON", () => {
    expect(extractJson('{"words":[{"term":"foo"}]}')).toEqual({
      words: [{ term: "foo" }],
    });
  });

  it("strips a ```json fence and surrounding prose", () => {
    const fenced = '```json\n{"words":[{"term":"foo"}]}\n```';
    expect(extractJson(fenced)).toEqual({ words: [{ term: "foo" }] });
  });

  it("throws a clear truncation error with length and tail on cut-off JSON", () => {
    const truncated = '{"words":[{"term":"foo","definition":"unterminat';
    let caught: unknown;
    try {
      extractJson(truncated);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toMatch(/truncat/i);
    expect(message).toContain(`length=${truncated.length}`);
    expect(message).toContain("unterminat");
    // Not a bare SyntaxError leaking through.
    expect((caught as Error).name).toBe("Error");
  });

  it("throws the 'no JSON' error when the response has no JSON at all", () => {
    expect(() => extractJson("I'm sorry, I can't help with that.")).toThrow(
      /no JSON in LLM response/,
    );
  });
});

function word(term: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    term,
    lemma: term,
    part_of_speech: "sustantivo",
    definition_es: `definición de ${term}`,
    definition_en: `meaning of ${term}`,
    example: `Una frase con ${term}.`,
    level: "C1",
    likely_known: 0.3,
    ...overrides,
  };
}

interface MockImpl {
  extract?: (call: VisionParams, n: number) => string;
}

function makeLlm(impl: MockImpl) {
  const calls: VisionParams[] = [];
  db.prepare("INSERT INTO setting (key, value) VALUES (?, ?)").run(
    "llm.text_extraction",
    JSON.stringify({ provider: "mock", model: "mock-text" }),
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

/** Create a text source with its transcript and one pending page per chunk. */
function makeSource(text: string): number {
  const now = "2026-01-01T00:00:00Z";
  const sourceId = Number(
    db
      .prepare(
        "INSERT INTO source (type, title, ref, transcript, created_at, updated_at) VALUES ('text', 'Paste', NULL, ?, ?, ?)",
      )
      .run(text, now, now).lastInsertRowid,
  );
  const insert = db.prepare(
    "INSERT INTO source_page (source_id, page_no, kind, status, created_at, updated_at) VALUES (?, ?, 'vocab', 'pending', ?, ?)",
  );
  chunkText(text).forEach((_chunk, i) => insert.run(sourceId, i + 1, now, now));
  return sourceId;
}

function pageRows(sourceId: number) {
  return db
    .prepare(
      "SELECT id, page_no, kind, status, error FROM source_page WHERE source_id = ? ORDER BY page_no",
    )
    .all(sourceId) as {
    id: number;
    page_no: number;
    kind: string;
    status: string;
    error: string | null;
  }[];
}

function itemRows(sourceId: number) {
  return db
    .prepare(
      "SELECT term, lemma, definition_es, level, likely_known, batch_no, decision, word_id FROM extraction_item WHERE source_id = ? ORDER BY id",
    )
    .all(sourceId) as Record<string, unknown>[];
}

const TWO_PARAS = `${"a".repeat(2500)}\n\n${"b".repeat(2500)}`;

describe("chunkText", () => {
  it("splits on paragraph boundaries into page-sized chunks", () => {
    const chunks = chunkText(TWO_PARAS);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.startsWith("a")).toBe(true);
    expect(chunks[1]!.startsWith("b")).toBe(true);
  });

  it("keeps a short multi-paragraph paste in a single chunk", () => {
    expect(chunkText("Hola.\n\nQué tal.")).toEqual(["Hola.\n\nQué tal."]);
  });

  it("hard-splits a single paragraph longer than the max", () => {
    const chunks = chunkText("x".repeat(9000));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toBe("x".repeat(9000));
  });
});

describe("detectLanguage", () => {
  it("detects Spanish from diacritics/punctuation", () => {
    expect(detectLanguage("¿Qué tal? Mañana será otro día.")).toBe("es");
  });

  it("detects Spanish from stopwords without diacritics", () => {
    expect(
      detectLanguage("el perro y la casa de un amigo con la familia"),
    ).toBe("es");
  });

  it("detects English from stopwords", () => {
    expect(
      detectLanguage("the quick brown fox was on the road and it is fast"),
    ).toBe("en");
  });
});

describe("runTextIngestion", () => {
  it("extracts candidates from each chunk into pending items", async () => {
    const sourceId = makeSource(TWO_PARAS);
    const { llm, calls } = makeLlm({
      extract: (_call, n) =>
        JSON.stringify({ words: [word(`palabra${n}a`), word(`palabra${n}b`)] }),
    });

    const result = await runTextIngestion(db, llm, {
      sourceId,
      language: "es",
    });
    expect(result).toEqual({ pages: { 1: "done", 2: "done" } });

    const pages = pageRows(sourceId);
    expect(pages).toHaveLength(2);
    for (const p of pages) {
      expect(p.status).toBe("done");
      expect(p.kind).toBe("vocab");
      expect(p.error).toBeNull();
    }

    const items = itemRows(sourceId);
    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({
      term: "palabra1a",
      decision: "pending",
      batch_no: 1,
      word_id: null,
    });

    // One extraction call per chunk, each carrying its own chunk text and no
    // attachments (pure-text prompt).
    expect(calls).toHaveLength(2);
    expect(calls[0]!.attachments).toEqual([]);
    expect(calls[0]!.prompt).toContain("a".repeat(2500));
    expect(calls[1]!.prompt).toContain("b".repeat(2500));
  });

  it("fills the calibration sample from known/mature words in the source language", async () => {
    db.prepare(
      `INSERT INTO word (term, term_normalized, lemma, lemma_normalized, language, status, deck_id)
       VALUES ('threshold', 'threshold', 'threshold', 'threshold', 'en', 'known', 1)`,
    ).run();
    db.prepare(
      `INSERT INTO word (term, term_normalized, lemma, lemma_normalized, language, status, deck_id)
       VALUES ('madrugar', 'madrugar', 'madrugar', 'madrugar', 'es', 'known', 1)`,
    ).run();
    const sourceId = makeSource("The cat sat on the mat.");
    const { llm, calls } = makeLlm({});

    await runTextIngestion(db, llm, { sourceId, language: "en" });

    // English source → English calibration words only; Spanish word excluded.
    expect(calls[0]!.prompt).toContain("threshold");
    expect(calls[0]!.prompt).not.toContain("madrugar");
    expect(calls[0]!.prompt).not.toContain("{{calibration_sample}}");
  });

  it("auto-detect path: language resolved at enqueue flows to the prompt", async () => {
    // Mirrors the route: detect once, carry on the payload.
    const text = "the quick brown fox was on the road and it is fast";
    const language: Language = detectLanguage(text);
    expect(language).toBe("en");
    const sourceId = makeSource(text);
    const { llm, calls } = makeLlm({});

    await runTextIngestion(db, llm, { sourceId, language });

    expect(calls[0]!.prompt).toContain("written in **en**");
  });

  it("records a per-chunk failure, finishes other chunks, and throws", async () => {
    const sourceId = makeSource(TWO_PARAS);
    const { llm } = makeLlm({
      extract: (_call, n) => {
        if (n === 2) throw new LlmError("model blew up", { retryable: false });
        return JSON.stringify({ words: [word("alborada")] });
      },
    });

    await expect(
      runTextIngestion(db, llm, { sourceId, language: "es" }),
    ).rejects.toThrow("1 of 2 chunks failed");

    const pages = pageRows(sourceId);
    expect(pages[0]).toMatchObject({ status: "done", error: null });
    expect(pages[1]!.status).toBe("failed");
    expect(pages[1]!.error).toContain("model blew up");
    expect(itemRows(sourceId)).toHaveLength(1);
  });

  it("resumes from partial progress: completed chunks are skipped on rerun", async () => {
    const sourceId = makeSource(TWO_PARAS);
    const queue = new JobQueue(db, { backoffBaseMs: 0 });
    const jobId = enqueueTextIngestion(db, queue, { sourceId, language: "es" });
    const payload = JSON.parse(
      (
        db.prepare("SELECT payload FROM job WHERE id = ?").get(jobId) as {
          payload: string;
        }
      ).payload,
    ) as { sourceId: number; language: Language; jobId: number };
    expect(payload).toEqual({ sourceId, language: "es", jobId });

    // Simulate a prior attempt that completed chunk 1 before dying.
    const [chunk1] = pageRows(sourceId);
    db.prepare("UPDATE source_page SET status = 'done' WHERE id = ?").run(
      chunk1!.id,
    );

    const { llm, calls } = makeLlm({
      extract: () => JSON.stringify({ words: [word("estrépito")] }),
    });
    await runTextIngestion(db, llm, payload);

    expect(calls).toHaveLength(1); // only chunk 2 hit the LLM
    expect(pageRows(sourceId).every((p) => p.status === "done")).toBe(true);
    const progress = JSON.parse(
      (
        db.prepare("SELECT progress FROM job WHERE id = ?").get(jobId) as {
          progress: string;
        }
      ).progress,
    );
    expect(progress).toEqual({ pages: { 1: "done", 2: "done" } });
  });

  it("retry payload reprocesses only the requested chunk", async () => {
    const sourceId = makeSource(TWO_PARAS);
    db.prepare(
      "UPDATE source_page SET status = 'failed', error = 'boom' WHERE source_id = ?",
    ).run(sourceId);
    const pages = pageRows(sourceId);

    const { llm, calls } = makeLlm({
      extract: () => JSON.stringify({ words: [word("nimbo")] }),
    });
    await runTextIngestion(db, llm, {
      sourceId,
      language: "es",
      pageIds: [pages[1]!.id],
    });

    expect(calls).toHaveLength(1);
    const after = pageRows(sourceId);
    expect(after[0]!.status).toBe("failed"); // untouched
    expect(after[1]).toMatchObject({ status: "done", error: null });
  });

  it("groups extraction items into batches of ~50", async () => {
    const sourceId = makeSource("short paste");
    const { llm } = makeLlm({
      extract: () =>
        JSON.stringify({
          words: Array.from({ length: 60 }, (_, i) => word(`término${i}`)),
        }),
    });

    await runTextIngestion(db, llm, { sourceId, language: "es" });

    const items = itemRows(sourceId);
    expect(items).toHaveLength(60);
    expect(items.filter((i) => i.batch_no === 1)).toHaveLength(50);
    expect(items.filter((i) => i.batch_no === 2)).toHaveLength(10);
  });

  it("fails a chunk whose LLM response is not valid JSON", async () => {
    const sourceId = makeSource("short paste");
    const { llm } = makeLlm({ extract: () => "sorry, I cannot do that" });

    await expect(
      runTextIngestion(db, llm, { sourceId, language: "es" }),
    ).rejects.toThrow("1 of 1 chunks failed");
    const [page] = pageRows(sourceId);
    expect(page!.status).toBe("failed");
    expect(page!.error).toContain("no JSON");
  });
});
