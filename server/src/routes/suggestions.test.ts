import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import express, { type Express } from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  SuggestionNextResponse,
  SuggestionDecisionResponse,
} from "@estudio/shared";
import { errorHandler } from "../app.js";
import { openDb, type DB } from "../db/db.js";
import { runMigrations } from "../db/migrate.js";
import { logger } from "../logger.js";
import { LlmService } from "../llm/service.js";
import type { LlmProvider } from "../llm/types.js";
import { registerSuggestionRoutes } from "./suggestions.js";
import { normalize } from "@estudio/shared";

let dataDir: string;
let db: DB;
let app: Express;

// Shared mock responses
const WORD_SUGGESTION = {
  type: "word",
  term: "desenvolverse",
  lemma: "desenvolverse",
  language: "es",
  part_of_speech: "verbo",
  level: "C1",
  gloss_es: "manejarse bien en una situación difícil",
  gloss_en: "to get along, to cope",
  example: "Sabe desenvolverse solo.",
  reason: "near your level",
};

const TOPIC_SUGGESTION = {
  type: "grammar_topic",
  topic_id: 0, // will be set after seeding
  name: "Por y para",
  preview: "Covers the key distinctions between por and para.",
  reason: "mastery 0.0 · foundational contrast",
};

const EXHAUSTED = { type: "exhausted" };

// Track which suggestion the mock returns to allow tests to swap it.
let mockResponse: object = WORD_SUGGESTION;

function buildApp(overrideMockResponse?: object) {
  if (overrideMockResponse) mockResponse = overrideMockResponse;

  db.prepare("INSERT OR REPLACE INTO setting (key, value) VALUES (?, ?)").run(
    "llm.suggestion_select",
    JSON.stringify({ provider: "mock", model: "mock-suggestion" }),
  );

  const provider: LlmProvider = {
    name: "mock",
    complete: () =>
      Promise.resolve({
        text: JSON.stringify(mockResponse),
        usage: { tokensIn: 1, tokensOut: 1, cacheHit: false, costEstimateUsd: 0 },
      }),
    vision: () => Promise.reject(new Error("vision not used")),
  };
  const llm = new LlmService(db, { mock: provider }, { backoffBaseMs: 0 });

  const a = express();
  a.use(express.json());
  registerSuggestionRoutes(a, db, llm);
  a.use(errorHandler);
  return a;
}

beforeEach(() => {
  mockResponse = WORD_SUGGESTION;
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "estudio-suggestions-"));
  db = openDb(dataDir);
  runMigrations(db, dataDir);
  app = buildApp();
});

afterEach(() => {
  logger.detachDb();
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("GET /api/suggestions/next", () => {
  it("returns a word suggestion from the LLM", async () => {
    const res = await request(app).get("/api/suggestions/next").expect(200);
    const body = res.body as SuggestionNextResponse;
    expect(body.suggestion).not.toBeNull();
    expect(body.suggestion!.type).toBe("word");
    if (body.suggestion!.type === "word") {
      expect(body.suggestion!.headword).toBe("desenvolverse");
      expect(body.suggestion!.reason).toBe("near your level");
    }
    expect(body.tally.suggested).toBe(1);
    expect(body.tally.added).toBe(0);
    expect(body.tally.skipped).toBe(0);
  });

  it("returns the existing pending suggestion without calling LLM again", async () => {
    // First call inserts the pending suggestion.
    await request(app).get("/api/suggestions/next").expect(200);

    // Swap LLM to return something different — it should NOT be called.
    mockResponse = { ...WORD_SUGGESTION, term: "sobresalir", reason: "other" };

    const res = await request(app).get("/api/suggestions/next").expect(200);
    const body = res.body as SuggestionNextResponse;
    // Still the original suggestion.
    expect(body.suggestion?.type === "word" && body.suggestion.headword).toBe(
      "desenvolverse",
    );
    // Still 1 row in the suggestion table (not 2).
    expect(body.tally.suggested).toBe(1);
  });

  it("returns a grammar topic suggestion", async () => {
    // Seed a grammar topic.
    db.prepare(
      `INSERT INTO grammar_category (name, sort_order) VALUES ('Preposiciones', 0)`,
    ).run();
    const topicId = Number(
      db
        .prepare(
          `INSERT INTO grammar_topic (category_id, name, description)
           VALUES (1, 'Por y para', 'Causa vs. fin.')`,
        )
        .run().lastInsertRowid,
    );
    mockResponse = { ...TOPIC_SUGGESTION, topic_id: topicId };
    app = buildApp();

    const res = await request(app).get("/api/suggestions/next").expect(200);
    const body = res.body as SuggestionNextResponse;
    expect(body.suggestion!.type).toBe("grammar_topic");
    if (body.suggestion!.type === "grammar_topic") {
      expect(body.suggestion!.topicId).toBe(topicId);
      expect(body.suggestion!.name).toBe("Por y para");
    }
  });

  it("returns null suggestion when LLM reports exhausted", async () => {
    mockResponse = EXHAUSTED;
    app = buildApp();

    const res = await request(app).get("/api/suggestions/next").expect(200);
    const body = res.body as SuggestionNextResponse;
    expect(body.suggestion).toBeNull();
    expect(body.tally.suggested).toBe(0);
  });

  it("never re-suggests a skipped word — uniqueness is permanent", async () => {
    // Insert a skipped suggestion for the same word.
    db.prepare(
      `INSERT INTO suggestion (item_type, normalized_key, payload, status)
       VALUES ('word', ?, '{"term":"desenvolverse","lemma":null,"language":"es","partOfSpeech":null,"level":null,"glossEs":null,"glossEn":null,"example":null,"reason":"x"}', 'skipped')`,
    ).run(normalize("desenvolverse"));

    // LLM still returns the same word — should not be re-inserted.
    const res = await request(app).get("/api/suggestions/next").expect(200);
    const body = res.body as SuggestionNextResponse;
    expect(body.suggestion).toBeNull();
    // Still 1 row (the skipped one), no new pending.
    expect(body.tally.suggested).toBe(1);
    expect(body.tally.skipped).toBe(1);
  });

  it("never re-suggests an added word", async () => {
    db.prepare(
      `INSERT INTO suggestion (item_type, normalized_key, payload, status)
       VALUES ('word', ?, '{"term":"desenvolverse","lemma":null,"language":"es","partOfSpeech":null,"level":null,"glossEs":null,"glossEn":null,"example":null,"reason":"x"}', 'added')`,
    ).run(normalize("desenvolverse"));

    const res = await request(app).get("/api/suggestions/next").expect(200);
    expect(res.body.suggestion).toBeNull();
  });

  it("does not suggest a word already in the deck", async () => {
    db.prepare(
      `INSERT INTO word (term, term_normalized, lemma, lemma_normalized, language,
         part_of_speech, definition_en, status, deck_id)
       VALUES ('desenvolverse', ?, null, null, 'es', 'verbo', 'to cope', 'new', 1)`,
    ).run(normalize("desenvolverse"));

    const res = await request(app).get("/api/suggestions/next").expect(200);
    expect(res.body.suggestion).toBeNull();
  });

  it("returns empty tally with null suggestion when no LLM configured", async () => {
    const noLlmApp = express();
    noLlmApp.use(express.json());
    registerSuggestionRoutes(noLlmApp, db);
    noLlmApp.use(errorHandler);

    const res = await request(noLlmApp).get("/api/suggestions/next").expect(200);
    expect(res.body.suggestion).toBeNull();
    expect(res.body.tally.suggested).toBe(0);
  });
});

describe("POST /api/suggestions/:id/decision", () => {
  async function getFirstSuggestion(): Promise<number> {
    const res = await request(app).get("/api/suggestions/next").expect(200);
    const body = res.body as SuggestionNextResponse;
    return body.suggestion!.id;
  }

  it("records a skip decision permanently", async () => {
    const id = await getFirstSuggestion();

    const res = await request(app)
      .post(`/api/suggestions/${id}/decision`)
      .send({ action: "skip" })
      .expect(200);
    const body = res.body as SuggestionDecisionResponse;
    expect(body.ok).toBe(true);

    const { status } = db
      .prepare("SELECT status FROM suggestion WHERE id = ?")
      .get(id) as { status: string };
    expect(status).toBe("skipped");

    const tally = await request(app).get("/api/suggestions/next");
    expect(tally.body.tally.skipped).toBe(1);
  });

  it("records an add decision and creates a word in the deck", async () => {
    const id = await getFirstSuggestion();

    await request(app)
      .post(`/api/suggestions/${id}/decision`)
      .send({ action: "add" })
      .expect(200);

    const { status } = db
      .prepare("SELECT status FROM suggestion WHERE id = ?")
      .get(id) as { status: string };
    expect(status).toBe("added");

    const word = db
      .prepare("SELECT term, status FROM word WHERE term = ?")
      .get("desenvolverse") as { term: string; status: string } | undefined;
    expect(word).toBeDefined();
    expect(word!.term).toBe("desenvolverse");
    expect(word!.status).toBe("new");
  });

  it("records an add for a grammar topic without modifying the topic", async () => {
    db.prepare(
      `INSERT INTO grammar_category (name, sort_order) VALUES ('Preposiciones', 0)`,
    ).run();
    const topicId = Number(
      db
        .prepare(
          `INSERT INTO grammar_topic (category_id, name, description)
           VALUES (1, 'Por y para', 'Causa vs. fin.')`,
        )
        .run().lastInsertRowid,
    );
    mockResponse = { ...TOPIC_SUGGESTION, topic_id: topicId };
    app = buildApp();

    const id = await getFirstSuggestion();
    await request(app)
      .post(`/api/suggestions/${id}/decision`)
      .send({ action: "add" })
      .expect(200);

    const { status } = db
      .prepare("SELECT status FROM suggestion WHERE id = ?")
      .get(id) as { status: string };
    expect(status).toBe("added");
  });

  it("409s on a second decision for the same suggestion", async () => {
    const id = await getFirstSuggestion();
    await request(app)
      .post(`/api/suggestions/${id}/decision`)
      .send({ action: "skip" })
      .expect(200);
    await request(app)
      .post(`/api/suggestions/${id}/decision`)
      .send({ action: "skip" })
      .expect(409);
  });

  it("404s for an unknown suggestion id", async () => {
    await request(app)
      .post("/api/suggestions/9999/decision")
      .send({ action: "skip" })
      .expect(404);
  });

  it("400s for an invalid action", async () => {
    const id = await getFirstSuggestion();
    await request(app)
      .post(`/api/suggestions/${id}/decision`)
      .send({ action: "maybe" })
      .expect(400);
  });
});
