import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import { openDb, type DB } from "../db/db.js";
import { runMigrations } from "../db/migrate.js";
import { logger } from "../logger.js";
import { JobQueue } from "../jobs/queue.js";
import { registerPdfIngestionHandler } from "../jobs/pdfIngestion.js";
import { registerTextIngestionHandler } from "../jobs/handlers.js";
import { LlmService } from "../llm/service.js";
import type { LlmProvider } from "../llm/types.js";
import { createApp } from "../app.js";

const fixturesDir = fileURLToPath(
  new URL("../../../docs/fixtures/workbook/", import.meta.url),
);
const GRAMMAR_PDF = path.join(fixturesDir, "Grammar worksheet to process.pdf");
const PARAGRAPH_PDF = path.join(fixturesDir, "Paragraph to Find words in.pdf");

let dataDir: string;
let db: DB;
let queue: JobQueue;
let app: Express;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "estudio-sources-"));
  db = openDb(dataDir);
  runMigrations(db, dataDir);
  queue = new JobQueue(db, { backoffBaseMs: 0 });
  app = createApp(db, { queue, dataDir });
});

afterEach(() => {
  logger.detachDb();
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

/** Route both LLM tasks to a mock provider and register the real handler. */
function registerMockedIngestion(): void {
  for (const task of ["page_classification", "pdf_extraction"]) {
    db.prepare("INSERT INTO setting (key, value) VALUES (?, ?)").run(
      `llm.${task}`,
      JSON.stringify({ provider: "mock", model: `mock-${task}` }),
    );
  }
  const provider: LlmProvider = {
    name: "mock",
    complete: () => Promise.reject(new Error("complete not used")),
    vision: async (params) => ({
      text:
        params.model === "mock-page_classification"
          ? '{"kind": "vocab"}'
          : JSON.stringify({
              words: [
                {
                  term: "estrépito",
                  lemma: "estrépito",
                  part_of_speech: "sustantivo",
                  definition_es: "Ruido considerable.",
                  definition_en: "racket, din",
                  example: "El estrépito de la calle no le dejaba dormir.",
                  level: "C1",
                  likely_known: 0.2,
                },
              ],
            }),
      usage: {
        tokensIn: 100,
        tokensOut: 50,
        cacheHit: false,
        costEstimateUsd: 0.003,
      },
    }),
  };
  const llm = new LlmService(db, { mock: provider }, { backoffBaseMs: 0 });
  registerPdfIngestionHandler(queue, db, llm);
}

/** Route text_extraction to a mock provider and register the real handler. */
function registerMockedTextIngestion(): void {
  db.prepare("INSERT INTO setting (key, value) VALUES (?, ?)").run(
    "llm.text_extraction",
    JSON.stringify({ provider: "mock", model: "mock-text" }),
  );
  const provider: LlmProvider = {
    name: "mock",
    complete: () => Promise.reject(new Error("complete not used")),
    vision: async () => ({
      text: JSON.stringify({
        words: [
          {
            term: "estrépito",
            lemma: "estrépito",
            part_of_speech: "sustantivo",
            definition_es: "Ruido considerable.",
            definition_en: "racket, din",
            example: "El estrépito de la calle no le dejaba dormir.",
            level: "C1",
            likely_known: 0.2,
          },
        ],
      }),
      usage: {
        tokensIn: 100,
        tokensOut: 50,
        cacheHit: false,
        costEstimateUsd: 0.003,
      },
    }),
  };
  const llm = new LlmService(db, { mock: provider }, { backoffBaseMs: 0 });
  registerTextIngestionHandler(queue, db, llm);
}

describe("POST /api/sources/text", () => {
  it("creates a text source + chunk pages and enqueues the job", async () => {
    const res = await request(app)
      .post("/api/sources/text")
      .send({ title: "My notes", text: "Una frase con estrépito.", language: "es" });

    expect(res.status).toBe(201);
    expect(res.body.sourceId).toBeGreaterThan(0);
    expect(res.body.jobId).toBeGreaterThan(0);
    expect(res.body.pageCount).toBe(1);

    const source = db
      .prepare("SELECT type, title, stored_path, transcript FROM source WHERE id = ?")
      .get(res.body.sourceId) as {
      type: string;
      title: string;
      stored_path: string | null;
      transcript: string;
    };
    expect(source).toEqual({
      type: "text",
      title: "My notes",
      stored_path: null,
      transcript: "Una frase con estrépito.",
    });

    const pages = db
      .prepare("SELECT status FROM source_page WHERE source_id = ?")
      .all(res.body.sourceId) as { status: string }[];
    expect(pages).toHaveLength(1);
    expect(pages[0]!.status).toBe("pending");

    const job = db
      .prepare("SELECT type, status, payload FROM job WHERE id = ?")
      .get(res.body.jobId) as { type: string; status: string; payload: string };
    expect(job.type).toBe("text_ingestion");
    expect(job.status).toBe("queued");
    expect(JSON.parse(job.payload)).toEqual({
      sourceId: res.body.sourceId,
      language: "es",
      jobId: res.body.jobId,
    });
  });

  it("auto-detects the language when omitted", async () => {
    const res = await request(app)
      .post("/api/sources/text")
      .send({ text: "the quick brown fox was on the road and it is fast" });
    expect(res.status).toBe(201);
    const job = db
      .prepare("SELECT payload FROM job WHERE id = ?")
      .get(res.body.jobId) as { payload: string };
    expect(JSON.parse(job.payload).language).toBe("en");
  });

  it("defaults the title to 'Pasted text'", async () => {
    const res = await request(app)
      .post("/api/sources/text")
      .send({ text: "algo de texto en español aquí" });
    expect(res.body.title).toBeUndefined(); // not echoed
    const source = db
      .prepare("SELECT title FROM source WHERE id = ?")
      .get(res.body.sourceId) as { title: string };
    expect(source.title).toBe("Pasted text");
  });

  it("rejects empty text without creating rows", async () => {
    const res = await request(app)
      .post("/api/sources/text")
      .send({ text: "   " });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("missing_text");
    expect(db.prepare("SELECT COUNT(*) AS c FROM source").get()).toEqual({ c: 0 });
  });

  it("rejects an invalid language", async () => {
    const res = await request(app)
      .post("/api/sources/text")
      .send({ text: "hola", language: "fr" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_language");
  });
});

describe("end-to-end: paste → job → triage candidates", () => {
  it("runs the queued text ingestion job against the pasted text", async () => {
    registerMockedTextIngestion();

    const res = await request(app)
      .post("/api/sources/text")
      .send({ text: "Una frase con estrépito.", language: "es" });
    expect(res.status).toBe(201);
    const sourceId = res.body.sourceId as number;

    expect(await queue.tick()).toBe(true); // runs the ingestion job

    const detail = await request(app).get(`/api/sources/${sourceId}`);
    expect(detail.body.progress).toEqual({
      total: 1,
      pending: 0,
      done: 1,
      failed: 0,
    });
    expect(detail.body.pages[0]).toMatchObject({ kind: "vocab", status: "done" });

    const items = db
      .prepare(
        "SELECT term, batch_no, decision FROM extraction_item WHERE source_id = ?",
      )
      .all(sourceId);
    expect(items).toEqual([
      { term: "estrépito", batch_no: 1, decision: "pending" },
    ]);

    const job = db
      .prepare("SELECT status, progress FROM job WHERE id = ?")
      .get(res.body.jobId) as { status: string; progress: string };
    expect(job.status).toBe("done");
    expect(JSON.parse(job.progress)).toEqual({ pages: { 1: "done" } });
  });
});

describe("POST /api/sources/pdf", () => {
  it("stores the file, creates source + pending pages, and enqueues the job", async () => {
    const res = await request(app)
      .post("/api/sources/pdf")
      .field("title", "Workbook unit 3")
      .attach("file", GRAMMAR_PDF);

    expect(res.status).toBe(201);
    expect(res.body.pageCount).toBe(2);
    expect(res.body.source).toMatchObject({
      type: "pdf",
      title: "Workbook unit 3",
      ref: "Grammar worksheet to process.pdf",
    });
    expect(res.body.jobId).toBeGreaterThan(0);

    // Original bytes persisted under DATA_DIR/uploads.
    const storedPath = res.body.source.storedPath as string;
    expect(storedPath.startsWith(path.join(dataDir, "uploads"))).toBe(true);
    expect(
      fs.readFileSync(storedPath).equals(fs.readFileSync(GRAMMAR_PDF)),
    ).toBe(true);

    const pages = db
      .prepare("SELECT page_no, status FROM source_page WHERE source_id = ?")
      .all(res.body.source.id) as { page_no: number; status: string }[];
    expect(pages.map((p) => p.page_no)).toEqual([1, 2]);
    expect(pages.every((p) => p.status === "pending")).toBe(true);

    const job = db
      .prepare("SELECT type, status, payload FROM job WHERE id = ?")
      .get(res.body.jobId) as { type: string; status: string; payload: string };
    expect(job.type).toBe("pdf_ingestion");
    expect(job.status).toBe("queued");
    expect(JSON.parse(job.payload)).toEqual({
      sourceId: res.body.source.id,
      jobId: res.body.jobId,
    });
  });

  it("defaults the title from the filename", async () => {
    const res = await request(app)
      .post("/api/sources/pdf")
      .attach("file", PARAGRAPH_PDF);
    expect(res.status).toBe(201);
    expect(res.body.source.title).toBe("Paragraph to Find words in");
  });

  it("rejects a request without a file", async () => {
    const res = await request(app).post("/api/sources/pdf");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("missing_file");
  });

  it("rejects a non-PDF upload without creating rows", async () => {
    const res = await request(app)
      .post("/api/sources/pdf")
      .attach("file", Buffer.from("definitely not a pdf"), "notes.pdf");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_pdf");
    expect(db.prepare("SELECT COUNT(*) AS c FROM source").get()).toEqual({
      c: 0,
    });
  });
});

describe("GET /api/sources/:id", () => {
  it("returns source, pages and progress", async () => {
    const upload = await request(app)
      .post("/api/sources/pdf")
      .attach("file", GRAMMAR_PDF);
    const sourceId = upload.body.source.id as number;
    db.prepare(
      "UPDATE source_page SET status = 'failed', error = 'boom' WHERE source_id = ? AND page_no = 2",
    ).run(sourceId);

    const res = await request(app).get(`/api/sources/${sourceId}`);
    expect(res.status).toBe(200);
    expect(res.body.source.id).toBe(sourceId);
    expect(res.body.pages).toHaveLength(2);
    expect(res.body.pages[1]).toMatchObject({
      pageNo: 2,
      status: "failed",
      error: "boom",
    });
    expect(res.body.progress).toEqual({
      total: 2,
      pending: 1,
      done: 0,
      failed: 1,
    });
  });

  it("404s for an unknown source", async () => {
    const res = await request(app).get("/api/sources/9999");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });
});

describe("POST /api/source-pages/:id/retry", () => {
  async function uploadAndFailPage(): Promise<{
    sourceId: number;
    pageId: number;
  }> {
    const upload = await request(app)
      .post("/api/sources/pdf")
      .attach("file", PARAGRAPH_PDF);
    const sourceId = upload.body.source.id as number;
    const pageId = upload.body.source.id
      ? (
          db
            .prepare(
              "SELECT id FROM source_page WHERE source_id = ? AND page_no = 1",
            )
            .get(sourceId) as { id: number }
        ).id
      : 0;
    db.prepare(
      "UPDATE source_page SET status = 'failed', error = 'boom' WHERE id = ?",
    ).run(pageId);
    return { sourceId, pageId };
  }

  it("re-enqueues a failed page and resets its status", async () => {
    const { sourceId, pageId } = await uploadAndFailPage();

    const res = await request(app).post(`/api/source-pages/${pageId}/retry`);
    expect(res.status).toBe(200);
    expect(res.body.jobId).toBeGreaterThan(0);

    const page = db
      .prepare("SELECT status, error FROM source_page WHERE id = ?")
      .get(pageId) as { status: string; error: string | null };
    expect(page).toEqual({ status: "pending", error: null });

    const job = db
      .prepare("SELECT payload FROM job WHERE id = ?")
      .get(res.body.jobId) as { payload: string };
    expect(JSON.parse(job.payload)).toEqual({
      sourceId,
      pageIds: [pageId],
      jobId: res.body.jobId,
    });
  });

  it("409s for a page that is not failed", async () => {
    const upload = await request(app)
      .post("/api/sources/pdf")
      .attach("file", PARAGRAPH_PDF);
    const pageId = (
      db
        .prepare("SELECT id FROM source_page WHERE source_id = ?")
        .get(upload.body.source.id) as { id: number }
    ).id;

    const res = await request(app).post(`/api/source-pages/${pageId}/retry`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("page_not_failed");
  });

  it("404s for an unknown page", async () => {
    const res = await request(app).post("/api/source-pages/9999/retry");
    expect(res.status).toBe(404);
  });
});

describe("end-to-end: upload → job → triage candidates", () => {
  it("runs the queued ingestion job against the uploaded PDF", async () => {
    registerMockedIngestion();

    const upload = await request(app)
      .post("/api/sources/pdf")
      .attach("file", PARAGRAPH_PDF);
    expect(upload.status).toBe(201);
    const sourceId = upload.body.source.id as number;

    expect(await queue.tick()).toBe(true); // runs the ingestion job

    const detail = await request(app).get(`/api/sources/${sourceId}`);
    expect(detail.body.progress).toEqual({
      total: 1,
      pending: 0,
      done: 1,
      failed: 0,
    });
    expect(detail.body.pages[0]).toMatchObject({
      kind: "vocab",
      status: "done",
    });

    const items = db
      .prepare(
        "SELECT term, batch_no, decision FROM extraction_item WHERE source_id = ?",
      )
      .all(sourceId);
    expect(items).toEqual([
      { term: "estrépito", batch_no: 1, decision: "pending" },
    ]);

    const job = db
      .prepare("SELECT status, progress FROM job WHERE id = ?")
      .get(upload.body.jobId) as { status: string; progress: string };
    expect(job.status).toBe("done");
    expect(JSON.parse(job.progress)).toEqual({ pages: { 1: "done" }, total: 1 });
  });
});
