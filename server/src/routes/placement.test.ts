import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import express, { type Express } from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { errorHandler } from "../app.js";
import { openDb, type DB } from "../db/db.js";
import { runMigrations } from "../db/migrate.js";
import { logger } from "../logger.js";
import { LlmService } from "../llm/service.js";
import type { LlmProvider } from "../llm/types.js";
import { buildCalibrationSample } from "../jobs/textIngestion.js";
import { registerPlacementRoutes } from "./placement.js";
import type {
  PlacementCompleteRequest,
  PlacementCompleteResponse,
  PlacementNextRequest,
  PlacementNextResponse,
  PlacementStatusResponse,
  PlacementWord,
} from "@estudio/shared";

let dataDir: string;
let db: DB;
let app: Express;
let completeImpl: () => string;

const BAND_WORDS_JSON = JSON.stringify({
  words: [
    {
      term: "propitiation",
      lemma: "propitiation",
      part_of_speech: "noun",
      definition_en: "The act of gaining favor by making amends.",
      band: "C2",
    },
    {
      term: "perspicacious",
      lemma: "perspicacious",
      part_of_speech: "adjective",
      definition_en: "Having a ready insight; shrewd.",
      band: "C2",
    },
    {
      term: "ameliorate",
      lemma: "ameliorate",
      part_of_speech: "verb",
      definition_en: "Make something bad or unsatisfactory better.",
      band: "C2",
    },
    {
      term: "equivocate",
      lemma: "equivocate",
      part_of_speech: "verb",
      definition_en: "Use ambiguous language to conceal the truth.",
      band: "C2",
    },
    {
      term: "sanguine",
      lemma: "sanguine",
      part_of_speech: "adjective",
      definition_en: "Optimistic, especially in a difficult situation.",
      band: "C2",
    },
    {
      term: "recondite",
      lemma: "recondite",
      part_of_speech: "adjective",
      definition_en: "Not known by many people; obscure.",
      band: "C2",
    },
  ],
});

const OK_USAGE = {
  tokensIn: 100,
  tokensOut: 200,
  cacheHit: false,
  costEstimateUsd: 0.002,
};

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "estudio-placement-"));
  db = openDb(dataDir);
  runMigrations(db, dataDir);

  completeImpl = () => BAND_WORDS_JSON;

  const provider: LlmProvider = {
    name: "anthropic",
    complete: (_params) =>
      Promise.resolve({ text: completeImpl(), usage: OK_USAGE }),
    vision: () => Promise.reject(new Error("vision not used")),
  };

  // Route english_placement to the mock provider
  db.prepare("INSERT INTO setting (key, value) VALUES (?, ?)").run(
    "llm.english_placement",
    JSON.stringify({ provider: "anthropic", model: "mock" }),
  );

  const llm = new LlmService(db, { anthropic: provider }, { maxAttempts: 1 });

  app = express();
  app.use(express.json());
  registerPlacementRoutes(app, db, llm);
  app.use(errorHandler);
});

afterEach(() => {
  logger.detachDb();
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("GET /api/placement/status", () => {
  it("returns calibrated=false when never run", async () => {
    const res = await request(app).get("/api/placement/status");
    expect(res.status).toBe(200);
    const body = res.body as PlacementStatusResponse;
    expect(body.calibrated).toBe(false);
  });

  it("returns calibrated=true with level+seeded after completion", async () => {
    // First seed via complete
    const knownWords: PlacementWord[] = [
      {
        term: "sanguine",
        lemma: "sanguine",
        part_of_speech: "adjective",
        definition_en: "Optimistic.",
        band: "C2",
      },
    ];
    await request(app)
      .post("/api/placement/complete")
      .send({ level: "C1", knownWords } satisfies PlacementCompleteRequest);

    const res = await request(app).get("/api/placement/status");
    expect(res.status).toBe(200);
    const body = res.body as PlacementStatusResponse;
    expect(body.calibrated).toBe(true);
    expect(body.level).toBe("C1");
    expect(body.seeded).toBe(1);
  });
});

describe("POST /api/placement/next", () => {
  it("returns first band (C1) on empty completedBands", async () => {
    const res = await request(app)
      .post("/api/placement/next")
      .send({ completedBands: [] } satisfies PlacementNextRequest);
    expect(res.status).toBe(200);
    const body = res.body as PlacementNextResponse;
    expect(body.done).toBe(false);
    if (!body.done) {
      expect(body.band).toBe("C1");
      expect(Array.isArray(body.words)).toBe(true);
      expect(body.words.length).toBeGreaterThan(0);
    }
  });

  it("returns done when boundary is clear", async () => {
    // Simulate C1 with 3/6 known (boundary case)
    const words = JSON.parse(BAND_WORDS_JSON).words as PlacementWord[];
    const res = await request(app)
      .post("/api/placement/next")
      .send({
        completedBands: [
          {
            band: "C1",
            words,
            knownTerms: ["propitiation", "perspicacious", "ameliorate"],
          },
        ],
      } satisfies PlacementNextRequest);
    expect(res.status).toBe(200);
    const body = res.body as PlacementNextResponse;
    expect(body.done).toBe(true);
  });

  it("caches band results (second call does not re-invoke LLM)", async () => {
    let callCount = 0;
    const provider: LlmProvider = {
      name: "anthropic",
      complete: (_params) => {
        callCount++;
        return Promise.resolve({ text: BAND_WORDS_JSON, usage: OK_USAGE });
      },
      vision: () => Promise.reject(new Error("vision not used")),
    };
    const llm2 = new LlmService(db, { anthropic: provider }, { maxAttempts: 1 });
    const app2 = express();
    app2.use(express.json());
    registerPlacementRoutes(app2, db, llm2);
    app2.use(errorHandler);

    await request(app2)
      .post("/api/placement/next")
      .send({ completedBands: [] } satisfies PlacementNextRequest);
    const countAfterFirst = callCount;

    await request(app2)
      .post("/api/placement/next")
      .send({ completedBands: [] } satisfies PlacementNextRequest);
    // Second call should hit cache; LLM call count must not increase
    expect(callCount).toBe(countAfterFirst);
  });
});

describe("POST /api/placement/complete", () => {
  const knownWords: PlacementWord[] = [
    {
      term: "sanguine",
      lemma: "sanguine",
      part_of_speech: "adjective",
      definition_en: "Optimistic, especially in a difficult situation.",
      band: "C1",
    },
    {
      term: "ameliorate",
      lemma: "ameliorate",
      part_of_speech: "verb",
      definition_en: "Make something bad or unsatisfactory better.",
      band: "C1",
    },
  ];

  it("seeds status=known en words and returns seeded count", async () => {
    const res = await request(app)
      .post("/api/placement/complete")
      .send({ level: "C1", knownWords } satisfies PlacementCompleteRequest);
    expect(res.status).toBe(200);
    const body = res.body as PlacementCompleteResponse;
    expect(body.level).toBe("C1");
    expect(body.seeded).toBe(2);
  });

  it("seeded words appear in buildCalibrationSample('en')", async () => {
    await request(app)
      .post("/api/placement/complete")
      .send({ level: "C1", knownWords } satisfies PlacementCompleteRequest);

    const sample = buildCalibrationSample(db, "en");
    expect(sample).toContain("sanguine");
    expect(sample).toContain("ameliorate");
  });

  it("seeded words have status=known and language=en", async () => {
    await request(app)
      .post("/api/placement/complete")
      .send({ level: "C1", knownWords } satisfies PlacementCompleteRequest);

    const rows = db
      .prepare("SELECT term, status, language FROM word WHERE language = 'en'")
      .all() as { term: string; status: string; language: string }[];
    expect(rows.length).toBe(2);
    for (const r of rows) {
      expect(r.status).toBe("known");
      expect(r.language).toBe("en");
    }
  });

  it("re-running dedupes — no duplicate words created", async () => {
    const body: PlacementCompleteRequest = { level: "C1", knownWords };
    await request(app).post("/api/placement/complete").send(body);
    await request(app).post("/api/placement/complete").send(body);

    const rows = db
      .prepare("SELECT term FROM word WHERE language = 'en'")
      .all() as { term: string }[];
    // Each term must appear exactly once
    const terms = rows.map((r) => r.term);
    const unique = new Set(terms);
    expect(unique.size).toBe(terms.length);
    expect(terms.length).toBe(2);
  });

  it("rejects invalid level", async () => {
    const res = await request(app)
      .post("/api/placement/complete")
      .send({ level: "INVALID", knownWords: [] });
    expect(res.status).toBe(400);
  });
});
