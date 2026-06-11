import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import express, { type Express } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WordDetailResponse, WordListResponse } from "@estudio/shared";
import { errorHandler } from "../app.js";
import { openDb, type DB } from "../db/db.js";
import { runMigrations } from "../db/migrate.js";
import { logger } from "../logger.js";
import { LlmService } from "../llm/service.js";
import {
  LlmError,
  type LlmProvider,
  type LlmResponse,
  type VisionParams,
} from "../llm/types.js";
import { registerWordRoutes } from "./words.js";

let dataDir: string;
let db: DB;
let app: Express;
let visionImpl: (params: VisionParams) => Promise<LlmResponse>;
let visionCalls: VisionParams[];

const OK_USAGE = {
  tokensIn: 80,
  tokensOut: 40,
  cacheHit: false,
  costEstimateUsd: 0.001,
};

function definitionJson(): string {
  return JSON.stringify({
    lemma: "desasosiego",
    partOfSpeech: "sustantivo",
    definitionEs: "Estado de inquietud.",
    definitionEn: "restlessness; unease",
    example: "Sentía un profundo desasosiego.",
    level: "C1",
  });
}

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "estudio-words-"));
  db = openDb(dataDir);
  runMigrations(db, dataDir);

  visionCalls = [];
  visionImpl = () =>
    Promise.resolve({ text: definitionJson(), usage: OK_USAGE });
  const provider: LlmProvider = {
    name: "anthropic",
    complete: () => Promise.reject(new Error("complete not used")),
    vision: (params) => {
      visionCalls.push(params);
      return visionImpl(params);
    },
  };
  const llm = new LlmService(db, { anthropic: provider }, { maxAttempts: 1 });

  app = express();
  app.use(express.json());
  registerWordRoutes(app, db, llm);
  app.use(errorHandler);
});

afterEach(() => {
  logger.detachDb();
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("word routes", () => {
  it("runs the full lifecycle: POST auto-fills, then GET/PATCH/DELETE", async () => {
    // POST with only term + language → LLM auto-fills, origin llm.
    const created = await request(app)
      .post("/api/words")
      .send({ term: "desasosiego", language: "es" })
      .expect(201);
    const body = created.body as WordDetailResponse;
    expect(visionCalls).toHaveLength(1);
    // {{term}}/{{language}} slots were filled in the prompt sent to the provider.
    expect(visionCalls[0].prompt).toContain("desasosiego");
    expect(visionCalls[0].prompt).toContain("es");
    expect(visionCalls[0].prompt).not.toContain("{{term}}");
    expect(body.definitionEn).toBe("restlessness; unease");
    expect(body.definitionOrigin).toBe("llm");
    expect(body.promptVersion).toBeTruthy();
    expect(body.deckId).toBe(1);
    const id = body.id;

    // GET detail.
    const got = await request(app).get(`/api/words/${id}`).expect(200);
    expect((got.body as WordDetailResponse).term).toBe("desasosiego");

    // PATCH a definition field → origin flips to owner, owner_edited_at set.
    const patched = await request(app)
      .patch(`/api/words/${id}`)
      .send({ definitionEn: "unease; disquiet" })
      .expect(200);
    const pbody = patched.body as WordDetailResponse;
    expect(pbody.definitionEn).toBe("unease; disquiet");
    expect(pbody.definitionOrigin).toBe("owner");
    expect(pbody.ownerEditedAt).not.toBeNull();

    // DELETE → 204, then GET 404.
    await request(app).delete(`/api/words/${id}`).expect(204);
    await request(app).get(`/api/words/${id}`).expect(404);
  });

  it("trusts owner-supplied definitions and skips the LLM (origin owner)", async () => {
    const res = await request(app)
      .post("/api/words")
      .send({
        term: "vergüenza",
        language: "es",
        definitionEn: "shame; embarrassment",
      })
      .expect(201);
    expect(visionCalls).toHaveLength(0);
    const body = res.body as WordDetailResponse;
    expect(body.definitionOrigin).toBe("owner");
    expect(body.definitionEn).toBe("shame; embarrassment");
    expect(body.promptVersion).toBeNull();
  });

  it("returns 409 word_exists on a duplicate term+language", async () => {
    await request(app)
      .post("/api/words")
      .send({ term: "casa", language: "es", definitionEn: "house" })
      .expect(201);
    const dup = await request(app)
      .post("/api/words")
      .send({ term: "casa", language: "es", definitionEn: "house" })
      .expect(409);
    expect(dup.body.error.code).toBe("word_exists");
  });

  it("returns 502 llm_failed and inserts nothing when auto-define fails", async () => {
    visionImpl = () =>
      Promise.reject(new LlmError("provider down", { retryable: false }));
    const res = await request(app)
      .post("/api/words")
      .send({ term: "inefable", language: "es" })
      .expect(502);
    expect(res.body.error.code).toBe("llm_failed");
    // The word must not have been inserted.
    const list = (await request(app).get("/api/words?q=inefable").expect(200))
      .body as WordListResponse;
    expect(list.items).toHaveLength(0);
  });

  it("validates term, language and rejects unknown status", async () => {
    expect(
      (
        await request(app)
          .post("/api/words")
          .send({ language: "es" })
          .expect(400)
      ).body.error.code,
    ).toBe("invalid_term");
    expect(
      (
        await request(app)
          .post("/api/words")
          .send({ term: "x", language: "fr" })
          .expect(400)
      ).body.error.code,
    ).toBe("invalid_language");
  });

  it("lists with accent-insensitive search and status filter", async () => {
    await request(app)
      .post("/api/words")
      .send({ term: "más", language: "es", definitionEn: "more" })
      .expect(201);
    await request(app)
      .post("/api/words")
      .send({ term: "casa", language: "es", definitionEn: "house" })
      .expect(201);

    const found = (await request(app).get("/api/words?q=mas").expect(200))
      .body as WordListResponse;
    expect(found.items.map((w) => w.term)).toEqual(["más"]);
    expect(found.total).toBe(1);
  });

  it("404s an unknown word on GET/PATCH/DELETE", async () => {
    await request(app).get("/api/words/999").expect(404);
    await request(app)
      .patch("/api/words/999")
      .send({ status: "mature" })
      .expect(404);
    await request(app).delete("/api/words/999").expect(404);
  });
});
