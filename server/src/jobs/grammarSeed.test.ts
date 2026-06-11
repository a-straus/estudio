import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb, type DB } from "../db/db.js";
import { runMigrations } from "../db/migrate.js";
import { logger } from "../logger.js";
import { LlmService } from "../llm/service.js";
import type { LlmProvider } from "../llm/types.js";
import { JobQueue } from "./queue.js";
import {
  enqueueGrammarSeed,
  JOB_TYPE_GRAMMAR_SEED,
  runGrammarSeed,
} from "./grammarSeed.js";
import { registerGrammarSeedHandler } from "./handlers.js";

let dataDir: string;
let db: DB;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "estudio-grammar-"));
  db = openDb(dataDir);
  runMigrations(db, dataDir);
});

afterEach(() => {
  logger.detachDb();
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const CURRICULUM = {
  categories: [
    {
      name: "Subjuntivo",
      topics: [
        { name: "Disparadores de emoción", description: "Me alegra que…" },
        { name: "Subjuntivo en cláusulas si", description: "Si tuviera…" },
      ],
    },
    {
      name: "Por y para",
      topics: [{ name: "Contraste por/para", description: "Causa vs fin." }],
    },
  ],
};

function makeLlm(text: string) {
  const calls: { prompt: string }[] = [];
  db.prepare("INSERT OR REPLACE INTO setting (key, value) VALUES (?, ?)").run(
    "llm.grammar_curriculum",
    JSON.stringify({ provider: "mock", model: "mock-grammar" }),
  );
  const provider: LlmProvider = {
    name: "mock",
    complete: async (params) => {
      calls.push({ prompt: params.prompt });
      return {
        text,
        usage: {
          tokensIn: 100,
          tokensOut: 200,
          cacheHit: false,
          costEstimateUsd: 0.01,
        },
      };
    },
    vision: () => Promise.reject(new Error("vision not used")),
  };
  return {
    llm: new LlmService(db, { mock: provider }, { backoffBaseMs: 0 }),
    calls,
  };
}

function categories() {
  return db
    .prepare(
      "SELECT id, name, sort_order FROM grammar_category ORDER BY sort_order",
    )
    .all() as { id: number; name: string; sort_order: number }[];
}

function topics() {
  return db
    .prepare(
      "SELECT category_id, name, description, mastery FROM grammar_topic ORDER BY id",
    )
    .all() as {
    category_id: number;
    name: string;
    description: string | null;
    mastery: number;
  }[];
}

describe("runGrammarSeed", () => {
  it("persists categories and topics from the model's JSON", async () => {
    const { llm, calls } = makeLlm(JSON.stringify(CURRICULUM));

    const result = await runGrammarSeed(db, llm);

    expect(result).toEqual({ seeded: true, categories: 2, topics: 3 });
    expect(calls).toHaveLength(1);

    const cats = categories();
    expect(cats.map((c) => c.name)).toEqual(["Subjuntivo", "Por y para"]);
    expect(cats.map((c) => c.sort_order)).toEqual([0, 1]);

    const tps = topics();
    expect(tps).toHaveLength(3);
    expect(tps[0]).toMatchObject({
      name: "Disparadores de emoción",
      description: "Me alegra que…",
      mastery: 0,
      category_id: cats[0]!.id,
    });
    expect(tps[2]!.category_id).toBe(cats[1]!.id);
  });

  it("tolerates a markdown code fence around the JSON", async () => {
    const { llm } = makeLlm("```json\n" + JSON.stringify(CURRICULUM) + "\n```");
    const result = await runGrammarSeed(db, llm);
    expect(result.seeded).toBe(true);
    expect(categories()).toHaveLength(2);
  });

  it("is idempotent: a second run no-ops and makes no LLM call", async () => {
    const first = makeLlm(JSON.stringify(CURRICULUM));
    await runGrammarSeed(db, first.llm);

    const second = makeLlm(JSON.stringify(CURRICULUM));
    const result = await runGrammarSeed(db, second.llm);

    expect(result).toEqual({ seeded: false, categories: 0, topics: 0 });
    expect(second.calls).toHaveLength(0); // no generation on the second run
    expect(categories()).toHaveLength(2); // curriculum not duplicated
    expect(topics()).toHaveLength(3);
  });

  it("rejects a response with no categories", async () => {
    const { llm } = makeLlm(JSON.stringify({ categories: [] }));
    await expect(runGrammarSeed(db, llm)).rejects.toThrow(
      "invalid curriculum response",
    );
    expect(categories()).toHaveLength(0);
  });

  it("rejects a category with no topics", async () => {
    const { llm } = makeLlm(
      JSON.stringify({ categories: [{ name: "Solo", topics: [] }] }),
    );
    await expect(runGrammarSeed(db, llm)).rejects.toThrow("has no topics");
  });

  it("runs end-to-end through the queue handler", async () => {
    const { llm } = makeLlm(JSON.stringify(CURRICULUM));
    const queue = new JobQueue(db, { backoffBaseMs: 0 });
    registerGrammarSeedHandler(queue, db, llm);

    const jobId = enqueueGrammarSeed(queue);
    const ran = await queue.tick();

    expect(ran).toBe(true);
    const job = db
      .prepare("SELECT type, status, progress FROM job WHERE id = ?")
      .get(jobId) as { type: string; status: string; progress: string };
    expect(job.type).toBe(JOB_TYPE_GRAMMAR_SEED);
    expect(job.status).toBe("done");
    expect(JSON.parse(job.progress)).toEqual({
      seeded: true,
      categories: 2,
      topics: 3,
    });
    expect(categories()).toHaveLength(2);
  });
});
