import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalize } from "@estudio/shared";
import { openDb, type DB } from "../db/db.js";
import { runMigrations } from "../db/migrate.js";
import { insertSource, insertSourcePages } from "../db/queries.js";
import { insertCurriculum } from "../db/grammar-queries.js";
import { logger } from "../logger.js";
import { LlmService } from "../llm/service.js";
import { LlmError, type LlmProvider, type VisionParams } from "../llm/types.js";
import { JobQueue } from "./queue.js";
import { enqueuePdfIngestion, runPdfIngestion } from "./pdfIngestion.js";

const fixturesDir = fileURLToPath(
  new URL("../../../docs/fixtures/workbook/", import.meta.url),
);
// Real workbook scans: a 2-page grammar worksheet and a 1-page reading text.
const GRAMMAR_PDF = path.join(fixturesDir, "Grammar worksheet to process.pdf");
const PARAGRAPH_PDF = path.join(fixturesDir, "Paragraph to Find words in.pdf");

let dataDir: string;
let db: DB;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "estudio-ingest-"));
  db = openDb(dataDir);
  runMigrations(db, dataDir);
});

afterEach(() => {
  logger.detachDb();
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
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
  classify?: (call: VisionParams, n: number) => string;
  extract?: (call: VisionParams, n: number) => string;
}

/**
 * LlmService wired to a mock provider. Tasks are routed to distinct mock
 * model names via setting rows, so the provider dispatches on params.model —
 * this also exercises the per-task config override path.
 */
function makeLlm(impl: MockImpl) {
  const calls: { task: "classify" | "extract"; params: VisionParams }[] = [];
  db.prepare("INSERT INTO setting (key, value) VALUES (?, ?)").run(
    "llm.page_classification",
    JSON.stringify({ provider: "mock", model: "mock-classify" }),
  );
  db.prepare("INSERT INTO setting (key, value) VALUES (?, ?)").run(
    "llm.pdf_extraction",
    JSON.stringify({ provider: "mock", model: "mock-extract" }),
  );
  const provider: LlmProvider = {
    name: "mock",
    complete: () => Promise.reject(new Error("complete not used")),
    vision: async (params) => {
      const task = params.model === "mock-classify" ? "classify" : "extract";
      calls.push({ task, params });
      const n = calls.filter((c) => c.task === task).length;
      const fn =
        task === "classify"
          ? (impl.classify ?? (() => '{"kind": "vocab"}'))
          : (impl.extract ?? (() => '{"words": []}'));
      return {
        text: fn(params, n),
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

function makeSource(fixture: string, pageCount: number): number {
  const sourceId = insertSource(db, {
    type: "pdf",
    title: path.basename(fixture, ".pdf"),
    ref: path.basename(fixture),
    storedPath: fixture,
  });
  insertSourcePages(db, sourceId, pageCount);
  return sourceId;
}

function pageRows(sourceId: number) {
  return db
    .prepare(
      "SELECT id, page_no, kind, status, error, grammar_topic_id FROM source_page WHERE source_id = ? ORDER BY page_no",
    )
    .all(sourceId) as {
    id: number;
    page_no: number;
    kind: string;
    status: string;
    error: string | null;
    grammar_topic_id: number | null;
  }[];
}

function itemRows(sourceId: number) {
  return db
    .prepare(
      "SELECT term, lemma, part_of_speech, definition_es, definition_en, example, level, likely_known, batch_no, decision, word_id FROM extraction_item WHERE source_id = ? ORDER BY id",
    )
    .all(sourceId) as Record<string, unknown>[];
}

describe("runPdfIngestion", () => {
  it("processes a real multi-page PDF into done pages and extraction items", async () => {
    const sourceId = makeSource(GRAMMAR_PDF, 2);
    const { llm, calls } = makeLlm({
      extract: (_call, n) =>
        JSON.stringify({
          words: [word(`palabra${n}a`), word(`palabra${n}b`)],
        }),
    });

    const result = await runPdfIngestion(db, llm, { sourceId });
    expect(result).toEqual({ pages: { 1: "done", 2: "done" }, total: 2 });

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
      lemma: "palabra1a",
      part_of_speech: "sustantivo",
      definition_es: "definición de palabra1a",
      definition_en: "meaning of palabra1a",
      example: "Una frase con palabra1a.",
      level: "C1",
      likely_known: 0.3,
      batch_no: 1,
      decision: "pending",
      word_id: null,
    });

    // 2 classify + 2 extract calls, each carrying a real single-page PDF.
    expect(calls).toHaveLength(4);
    for (const call of calls) {
      expect(call.params.attachments).toHaveLength(1);
      const att = call.params.attachments[0]!;
      expect(att.kind).toBe("pdf");
      expect(att.data.subarray(0, 5).toString()).toBe("%PDF-");
      // A split page is a real standalone PDF, much smaller than the source.
      expect(att.data.length).toBeGreaterThan(500);
    }

    const llmCalls = db
      .prepare("SELECT task, status FROM llm_call ORDER BY id")
      .all() as { task: string; status: string }[];
    expect(llmCalls).toHaveLength(4);
    expect(llmCalls.every((c) => c.status === "ok")).toBe(true);
  });

  it("routes grammar pages: kind set, no extraction, topic link left null", async () => {
    const sourceId = makeSource(PARAGRAPH_PDF, 1);
    const { llm, calls } = makeLlm({
      classify: () => '{"kind": "grammar"}',
    });

    await runPdfIngestion(db, llm, { sourceId });

    const [page] = pageRows(sourceId);
    expect(page).toMatchObject({
      kind: "grammar",
      status: "done",
      grammar_topic_id: null,
    });
    expect(itemRows(sourceId)).toHaveLength(0);
    expect(calls.map((c) => c.task)).toEqual(["classify"]);
  });

  it("links a grammar page to a seeded topic by the LLM-named page topic", async () => {
    insertCurriculum(db, [
      {
        name: "Subjuntivo",
        topics: [{ name: "Subjuntivo", description: "triggers" }],
      },
    ]);
    const topicId = (
      db
        .prepare("SELECT id FROM grammar_topic WHERE name = 'Subjuntivo'")
        .get() as {
        id: number;
      }
    ).id;
    // Source label is generic ("Lectura"): the link comes from the topic the
    // classifier names on the page, not the filename/title.
    const sourceId = insertSource(db, {
      type: "pdf",
      title: "Lectura general",
      ref: "lectura.pdf",
      storedPath: PARAGRAPH_PDF,
    });
    insertSourcePages(db, sourceId, 1);
    const { llm } = makeLlm({
      classify: () =>
        '{"kind": "grammar", "topic": "El subjuntivo de emoción"}',
    });

    await runPdfIngestion(db, llm, { sourceId });

    const [page] = pageRows(sourceId);
    expect(page).toMatchObject({ kind: "grammar", grammar_topic_id: topicId });
  });

  it("leaves grammar_topic_id null when the page topic matches no seeded topic", async () => {
    insertCurriculum(db, [
      {
        name: "Subjuntivo",
        topics: [{ name: "Subjuntivo", description: "triggers" }],
      },
    ]);
    const sourceId = makeSource(PARAGRAPH_PDF, 1);
    const { llm } = makeLlm({
      classify: () =>
        '{"kind": "grammar", "topic": "Pretérito de verbos regulares"}',
    });

    await runPdfIngestion(db, llm, { sourceId });

    const [page] = pageRows(sourceId);
    expect(page).toMatchObject({ kind: "grammar", grammar_topic_id: null });
  });

  it("leaves grammar_topic_id null when the model names no page topic", async () => {
    insertCurriculum(db, [
      {
        name: "Subjuntivo",
        topics: [{ name: "Subjuntivo", description: "triggers" }],
      },
    ]);
    // A source label that WOULD have matched under the old filename-based logic;
    // with null topic the link must stay null — we never fall back to the label.
    const sourceId = insertSource(db, {
      type: "pdf",
      title: "El subjuntivo: práctica",
      ref: "subjuntivo.pdf",
      storedPath: PARAGRAPH_PDF,
    });
    insertSourcePages(db, sourceId, 1);
    const { llm } = makeLlm({
      classify: () => '{"kind": "grammar", "topic": null}',
    });

    await runPdfIngestion(db, llm, { sourceId });

    const [page] = pageRows(sourceId);
    expect(page).toMatchObject({ kind: "grammar", grammar_topic_id: null });
  });

  it("groups extraction items into batches of ~50", async () => {
    const sourceId = makeSource(PARAGRAPH_PDF, 1);
    const { llm } = makeLlm({
      extract: () =>
        JSON.stringify({
          words: Array.from({ length: 60 }, (_, i) => word(`término${i}`)),
        }),
    });

    await runPdfIngestion(db, llm, { sourceId });

    const items = itemRows(sourceId);
    expect(items).toHaveLength(60);
    expect(items.filter((i) => i.batch_no === 1)).toHaveLength(50);
    expect(items.filter((i) => i.batch_no === 2)).toHaveLength(10);
  });

  it("never sets word_id at ingestion, even when a matching word exists", async () => {
    // word_id is contractually set only when a learn/know decision materializes
    // a word row at batch confirm; confirm-time dedupe (triage-queries.ts)
    // recomputes lemma matches itself, so ingestion leaves word_id null and
    // still surfaces every candidate.
    db.prepare(
      `INSERT INTO word (term, term_normalized, lemma, lemma_normalized, language, status, deck_id)
       VALUES ('soñar', ?, 'soñar', ?, 'es', 'known', 1)`,
    ).run(normalize("soñar"), normalize("soñar"));
    const sourceId = makeSource(PARAGRAPH_PDF, 1);
    const { llm } = makeLlm({
      extract: () =>
        JSON.stringify({
          words: [
            word("soñaba", { lemma: "Soñar" }), // would have matched the existing word
            word("madrugar"), // no existing word
          ],
        }),
    });

    await runPdfIngestion(db, llm, { sourceId });

    const items = itemRows(sourceId);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ term: "soñaba", decision: "pending" });
    expect(items.every((i) => i.word_id === null)).toBe(true);
  });

  it("fills the calibration sample from known/mature words at the call site", async () => {
    db.prepare(
      `INSERT INTO word (term, term_normalized, lemma, lemma_normalized, language, status, deck_id)
       VALUES ('madrugar', ?, 'madrugar', ?, 'es', 'known', 1)`,
    ).run(normalize("madrugar"), normalize("madrugar"));
    db.prepare(
      `INSERT INTO word (term, term_normalized, lemma, lemma_normalized, language, status, deck_id)
       VALUES ('soñar', ?, 'soñar', ?, 'es', 'mature', 1)`,
    ).run(normalize("soñar"), normalize("soñar"));
    const sourceId = makeSource(PARAGRAPH_PDF, 1);
    const { llm, calls } = makeLlm({});

    await runPdfIngestion(db, llm, { sourceId });

    const extract = calls.find((c) => c.task === "extract")!;
    expect(extract.params.prompt).toContain("madrugar, soñar");
    expect(extract.params.prompt).not.toContain("{{calibration_sample}}");
  });

  it("renders the calibration placeholder cleanly when no known words exist", async () => {
    const sourceId = makeSource(PARAGRAPH_PDF, 1);
    const { llm, calls } = makeLlm({});

    await runPdfIngestion(db, llm, { sourceId });

    const extract = calls.find((c) => c.task === "extract")!;
    expect(extract.params.prompt).not.toContain("{{calibration_sample}}");
    expect(extract.params.prompt).toContain("No known or mastered words");
  });

  it("preserves backticks inside JSON values, stripping only outer fences", async () => {
    const sourceId = makeSource(PARAGRAPH_PDF, 1);
    const { llm } = makeLlm({
      extract: () =>
        "```json\n" +
        JSON.stringify({
          words: [word("código", { example: "Escribe `código` aquí." })],
        }) +
        "\n```",
    });

    await runPdfIngestion(db, llm, { sourceId });

    const items = itemRows(sourceId);
    expect(items).toHaveLength(1);
    expect(items[0]!.example).toBe("Escribe `código` aquí.");
  });

  it("records a per-page failure, finishes other pages, and throws", async () => {
    const sourceId = makeSource(GRAMMAR_PDF, 2);
    const { llm } = makeLlm({
      extract: (_call, n) => {
        if (n === 2) {
          throw new LlmError("vision blew up", { retryable: false });
        }
        return JSON.stringify({ words: [word("alborada")] });
      },
    });

    await expect(runPdfIngestion(db, llm, { sourceId })).rejects.toThrow(
      "1 of 2 pages failed",
    );

    const pages = pageRows(sourceId);
    expect(pages[0]).toMatchObject({ status: "done", error: null });
    expect(pages[1]!.status).toBe("failed");
    expect(pages[1]!.error).toContain("vision blew up");
    expect(itemRows(sourceId)).toHaveLength(1);

    const errorCalls = db
      .prepare("SELECT status FROM llm_call WHERE status = 'error'")
      .all();
    expect(errorCalls).toHaveLength(1);
  });

  it("resumes from partial progress: completed pages are skipped on rerun", async () => {
    const sourceId = makeSource(GRAMMAR_PDF, 2);
    const queue = new JobQueue(db, { backoffBaseMs: 0 });
    const jobId = enqueuePdfIngestion(db, queue, { sourceId });
    const payload = JSON.parse(
      (
        db.prepare("SELECT payload FROM job WHERE id = ?").get(jobId) as {
          payload: string;
        }
      ).payload,
    ) as { sourceId: number; jobId: number };
    expect(payload).toEqual({ sourceId, jobId });

    // Simulate a prior attempt that completed page 1 before dying.
    const [page1] = pageRows(sourceId);
    db.prepare("UPDATE source_page SET status = 'done' WHERE id = ?").run(
      page1!.id,
    );

    const { llm, calls } = makeLlm({
      extract: () => JSON.stringify({ words: [word("estrépito")] }),
    });
    await runPdfIngestion(db, llm, payload);

    // Only page 2 hit the LLM; both pages are recorded in the progress JSON.
    expect(calls).toHaveLength(2);
    expect(pageRows(sourceId).every((p) => p.status === "done")).toBe(true);
    const progress = JSON.parse(
      (
        db.prepare("SELECT progress FROM job WHERE id = ?").get(jobId) as {
          progress: string;
        }
      ).progress,
    );
    expect(progress).toEqual({ pages: { 1: "done", 2: "done" }, total: 2 });
  });

  it("retry payload reprocesses only the requested page", async () => {
    const sourceId = makeSource(GRAMMAR_PDF, 2);
    db.prepare(
      "UPDATE source_page SET status = 'failed', error = 'boom' WHERE source_id = ?",
    ).run(sourceId);
    const pages = pageRows(sourceId);

    const { llm, calls } = makeLlm({});
    await runPdfIngestion(db, llm, { sourceId, pageIds: [pages[1]!.id] });

    expect(calls).toHaveLength(2); // classify + extract for the one page
    const after = pageRows(sourceId);
    expect(after[0]!.status).toBe("failed"); // untouched
    expect(after[1]).toMatchObject({ status: "done", error: null });
  });

  it("fails a page whose LLM response is not valid JSON", async () => {
    const sourceId = makeSource(PARAGRAPH_PDF, 1);
    const { llm } = makeLlm({ classify: () => "sorry, I cannot do that" });

    await expect(runPdfIngestion(db, llm, { sourceId })).rejects.toThrow(
      "1 of 1 pages failed",
    );
    const [page] = pageRows(sourceId);
    expect(page!.status).toBe("failed");
    expect(page!.error).toContain("no JSON");
  });
});
