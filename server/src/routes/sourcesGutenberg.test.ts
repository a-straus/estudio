import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express, { type Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb, type DB } from "../db/db.js";
import { runMigrations } from "../db/migrate.js";
import { logger } from "../logger.js";
import { JobQueue } from "../jobs/queue.js";
import { registerGutenbergIngestionHandler } from "../jobs/handlers.js";
import {
  estimateGutenbergCostUsd,
  gutenbergWordCount,
} from "../jobs/gutenbergIngestion.js";
import { LlmService } from "../llm/service.js";
import type { LlmProvider } from "../llm/types.js";
import { registerSourceRoutes } from "./sources.js";
import { registerTriageRoutes } from "./triage.js";

let dataDir: string;
let db: DB;
let queue: JobQueue;
let app: Express;

const STRIPPED = "firmament propitiation raiment concupiscence habergeon covet";
const FAKE_BOOK = `The Project Gutenberg eBook

Title: Sample Book

*** START OF THE PROJECT GUTENBERG EBOOK SAMPLE ***

${STRIPPED}

*** END OF THE PROJECT GUTENBERG EBOOK SAMPLE ***

License boilerplate that must not be stored.`;

// The model is a PRICED name (so the estimate is non-zero) but routed to the
// mock provider (so no live call happens).
function mockLlm(): LlmService {
  db.prepare("INSERT INTO setting (key, value) VALUES (?, ?)").run(
    "llm.gutenberg_extraction",
    JSON.stringify({ provider: "mock", model: "claude-opus-4-8" }),
  );
  const provider: LlmProvider = {
    name: "mock",
    complete: () => Promise.reject(new Error("complete not used")),
    vision: async () => ({
      text: JSON.stringify({
        words: [
          {
            term: "firmament",
            lemma: "firmament",
            part_of_speech: "noun",
            definition_es: null,
            definition_en: "the vault of the sky",
            example: "He set the stars in the firmament.",
            level: "C2",
            likely_known: 0.2,
          },
          {
            term: "propitiation",
            lemma: "propitiation",
            part_of_speech: "noun",
            definition_es: null,
            definition_en: "the act of appeasing",
            example: "An offering of propitiation.",
            level: "C2",
            likely_known: 0.1,
          },
        ],
      }),
      usage: { tokensIn: 100, tokensOut: 50, cacheHit: false, costEstimateUsd: 0.003 },
    }),
  };
  return new LlmService(db, { mock: provider }, { backoffBaseMs: 0 });
}

let llm: LlmService;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "estudio-gutenberg-route-"));
  db = openDb(dataDir);
  runMigrations(db, dataDir);
  queue = new JobQueue(db, { backoffBaseMs: 0 });
  llm = mockLlm();
  registerGutenbergIngestionHandler(queue, db, llm);
  app = express();
  app.use(express.json());
  registerSourceRoutes(app, db, queue, dataDir, {
    llm,
    fetchGutenberg: async () => FAKE_BOOK,
  });
  registerTriageRoutes(app, db);
});

afterEach(() => {
  logger.detachDb();
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("POST /api/sources/gutenberg (estimate)", () => {
  it("stores an English gutenberg source + raw text and returns a cost estimate, without starting the job", async () => {
    const res = await request(app)
      .post("/api/sources/gutenberg")
      .send({ ref: "10" });

    expect(res.status).toBe(201);
    expect(res.body.sourceId).toBeGreaterThan(0);
    expect(res.body.title).toBe("Sample Book");
    expect(res.body.wordCount).toBe(gutenbergWordCount(STRIPPED));
    expect(res.body.batches).toBe(1);
    expect(res.body.estimateUsd).toBeCloseTo(
      estimateGutenbergCostUsd(res.body.wordCount, "claude-opus-4-8"),
      9,
    );
    expect(res.body.estimateUsd).toBeGreaterThan(0);

    const source = db
      .prepare(
        "SELECT type, ref, language, transcript, stored_path FROM source WHERE id = ?",
      )
      .get(res.body.sourceId) as {
      type: string;
      ref: string;
      language: string;
      transcript: string;
      stored_path: string;
    };
    expect(source.type).toBe("gutenberg");
    expect(source.ref).toBe("10");
    expect(source.language).toBe("en");
    expect(source.transcript).toContain("firmament");
    expect(source.transcript).not.toContain("boilerplate");
    // Raw text also written under DATA_DIR/books as the original-file record.
    expect(source.stored_path.startsWith(path.join(dataDir, "books"))).toBe(
      true,
    );
    expect(fs.readFileSync(source.stored_path, "utf8")).toContain("firmament");

    // The expensive job is NOT started until confirm.
    expect(db.prepare("SELECT COUNT(*) AS c FROM job").get()).toEqual({ c: 0 });
    expect(
      db.prepare("SELECT COUNT(*) AS c FROM source_page").get(),
    ).toEqual({ c: 0 });
  });

  it("rejects a ref that resolves to no book", async () => {
    const res = await request(app)
      .post("/api/sources/gutenberg")
      .send({ ref: "not a book" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_gutenberg_ref");
  });

  it("rejects a missing ref", async () => {
    const res = await request(app).post("/api/sources/gutenberg").send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("missing_ref");
  });

  it("502s when the fetch fails", async () => {
    const app2 = express();
    app2.use(express.json());
    registerSourceRoutes(app2, db, queue, dataDir, {
      llm,
      fetchGutenberg: async () => {
        throw new Error("network down");
      },
    });
    const res = await request(app2)
      .post("/api/sources/gutenberg")
      .send({ ref: "10" });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("fetch_failed");
  });

  it("502s when the fetch is aborted (timeout path)", async () => {
    const app2 = express();
    app2.use(express.json());
    registerSourceRoutes(app2, db, queue, dataDir, {
      llm,
      fetchGutenberg: async () => {
        throw Object.assign(new Error("aborted"), { name: "AbortError" });
      },
    });
    const res = await request(app2)
      .post("/api/sources/gutenberg")
      .send({ ref: "10" });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("fetch_failed");
  });
});

describe("POST /api/sources/gutenberg/:id/confirm", () => {
  async function createSource(): Promise<number> {
    const res = await request(app)
      .post("/api/sources/gutenberg")
      .send({ ref: "10" });
    return res.body.sourceId as number;
  }

  it("enqueues the resumable classification job and creates the chunk pages", async () => {
    const sourceId = await createSource();
    const res = await request(app).post(
      `/api/sources/gutenberg/${sourceId}/confirm`,
    );
    expect(res.status).toBe(201);
    expect(res.body.jobId).toBeGreaterThan(0);
    expect(res.body.pageCount).toBe(1);

    const job = db
      .prepare("SELECT type, status FROM job WHERE id = ?")
      .get(res.body.jobId) as { type: string; status: string };
    expect(job.type).toBe("gutenberg_ingestion");
    expect(job.status).toBe("queued");

    const pages = db
      .prepare("SELECT COUNT(*) AS c FROM source_page WHERE source_id = ?")
      .get(sourceId) as { c: number };
    expect(pages.c).toBe(1);
  });

  it("409s if the extraction has already been started", async () => {
    const sourceId = await createSource();
    await request(app).post(`/api/sources/gutenberg/${sourceId}/confirm`);
    const again = await request(app).post(
      `/api/sources/gutenberg/${sourceId}/confirm`,
    );
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("already_confirmed");
  });

  it("404s for an unknown / non-gutenberg source", async () => {
    const res = await request(app).post("/api/sources/gutenberg/9999/confirm");
    expect(res.status).toBe(404);
  });
});

describe("end-to-end: gutenberg → job → kept words land in the English deck", () => {
  it("materializes confirmed 'learn' words into the English Vocabulary deck", async () => {
    const create = await request(app)
      .post("/api/sources/gutenberg")
      .send({ ref: "10" });
    const sourceId = create.body.sourceId as number;
    await request(app).post(`/api/sources/gutenberg/${sourceId}/confirm`);

    expect(await queue.tick()).toBe(true); // runs the classification job

    const items = db
      .prepare(
        "SELECT id, term, definition_es, definition_en FROM extraction_item WHERE source_id = ? ORDER BY id",
      )
      .all(sourceId) as {
      id: number;
      term: string;
      definition_es: string | null;
      definition_en: string | null;
    }[];
    expect(items.map((i) => i.term)).toEqual(["firmament", "propitiation"]);
    expect(items[0].definition_es).toBeNull();
    expect(items[0].definition_en).toBe("the vault of the sky");

    // Keep both ('learn'), then confirm the batch — reuses the existing triage
    // confirm path, which routes by source.language.
    for (const it of items) {
      await request(app)
        .patch(`/api/extraction-items/${it.id}`)
        .send({ decision: "learn" });
    }
    const confirm = await request(app)
      .post(`/api/sources/${sourceId}/extraction-items/confirm`)
      .send({ batchNo: 1 });
    expect(confirm.status).toBe(200);
    expect(confirm.body.learn).toBe(2);

    const words = db
      .prepare(
        `SELECT w.term, w.language, d.language AS deck_language, d.name AS deck_name
           FROM word w JOIN deck d ON d.id = w.deck_id
          WHERE w.source_id = ? ORDER BY w.term`,
      )
      .all(sourceId) as {
      term: string;
      language: string;
      deck_language: string;
      deck_name: string;
    }[];
    expect(words).toHaveLength(2);
    for (const w of words) {
      expect(w.language).toBe("en");
      expect(w.deck_language).toBe("en");
      expect(w.deck_name).toBe("English Vocabulary");
    }
  });
});

describe("GET /api/sources/:id/coverage", () => {
  it("returns triaged/total + kept + untested counts", async () => {
    const create = await request(app)
      .post("/api/sources/gutenberg")
      .send({ ref: "10" });
    const sourceId = create.body.sourceId as number;
    await request(app).post(`/api/sources/gutenberg/${sourceId}/confirm`);
    await queue.tick();

    // Before any triage: 2 candidates, none sorted/kept.
    let cov = await request(app).get(`/api/sources/${sourceId}/coverage`);
    expect(cov.body).toEqual({ total: 2, triaged: 0, kept: 0, untested: 0 });

    const items = db
      .prepare("SELECT id FROM extraction_item WHERE source_id = ? ORDER BY id")
      .all(sourceId) as { id: number }[];
    // Keep one, skip the other, then confirm.
    await request(app)
      .patch(`/api/extraction-items/${items[0].id}`)
      .send({ decision: "learn" });
    await request(app)
      .patch(`/api/extraction-items/${items[1].id}`)
      .send({ decision: "skip" });
    await request(app)
      .post(`/api/sources/${sourceId}/extraction-items/confirm`)
      .send({ batchNo: 1 });

    cov = await request(app).get(`/api/sources/${sourceId}/coverage`);
    // Both sorted; one kept ('learn') and materialized; it has no review
    // history yet, so it is untested.
    expect(cov.body).toEqual({ total: 2, triaged: 2, kept: 1, untested: 1 });
  });

  it("404s for an unknown source", async () => {
    const res = await request(app).get("/api/sources/9999/coverage");
    expect(res.status).toBe(404);
  });
});
