import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb, type DB } from "../db/db.js";
import { runMigrations } from "../db/migrate.js";
import { logger } from "../logger.js";
import { promptsDir } from "./prompts.js";
import { LlmService } from "./service.js";
import {
  LlmError,
  type LlmProvider,
  type LlmResponse,
  type VisionParams,
} from "./types.js";

let dataDir: string;
let db: DB;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "estudio-llm-"));
  db = openDb(dataDir);
  runMigrations(db, dataDir);
});

afterEach(() => {
  logger.detachDb();
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const OK_USAGE = {
  tokensIn: 120,
  tokensOut: 30,
  cacheHit: true,
  costEstimateUsd: 0.0027,
};

function makeProvider(
  vision: (params: VisionParams) => Promise<LlmResponse>,
): LlmProvider & { calls: VisionParams[] } {
  const calls: VisionParams[] = [];
  return {
    name: "mock",
    calls,
    complete: () => Promise.reject(new Error("complete not used in tests")),
    vision: (params) => {
      calls.push(params);
      return vision(params);
    },
  };
}

function routeTaskToMock(task: string, model = "mock-model"): void {
  db.prepare("INSERT INTO setting (key, value) VALUES (?, ?)").run(
    `llm.${task}`,
    JSON.stringify({ provider: "mock", model }),
  );
}

function llmCallRows() {
  return db
    .prepare(
      "SELECT task, provider, model, prompt_version, tokens_in, tokens_out, latency_ms, cache_hit, cost_estimate_usd, status, error FROM llm_call ORDER BY id",
    )
    .all() as {
    task: string;
    provider: string;
    model: string;
    prompt_version: string;
    tokens_in: number | null;
    tokens_out: number | null;
    latency_ms: number;
    cache_hit: number;
    cost_estimate_usd: number | null;
    status: string;
    error: string | null;
  }[];
}

const attachment = { kind: "pdf" as const, data: Buffer.from("%PDF-fake") };

describe("LlmService.resolveTaskConfig", () => {
  // FABLE-DISABLED (2026-06-13): default was claude-fable-5, now claude-opus-4-8
  // (Fable disabled by Anthropic; see FABLE_REPLACEMENT in service.ts).
  it("defaults pdf_extraction to anthropic / claude-opus-4-8", () => {
    const llm = new LlmService(db, {}, { env: {} });
    expect(llm.resolveTaskConfig("pdf_extraction")).toEqual({
      provider: "anthropic",
      model: "claude-opus-4-8",
    });
  });

  it("defaults chat to anthropic / claude-haiku-4-5", () => {
    const llm = new LlmService(db, {}, { env: {} });
    expect(llm.resolveTaskConfig("chat").model).toBe("claude-haiku-4-5");
  });

  it("defaults suggestion_select to anthropic / claude-sonnet-4-6", () => {
    const llm = new LlmService(db, {}, { env: {} });
    expect(llm.resolveTaskConfig("suggestion_select").model).toBe(
      "claude-sonnet-4-6",
    );
  });

  it("gives gutenberg_extraction 16384 max output tokens (truncation fix)", () => {
    const llm = new LlmService(db, {}, { env: {} });
    expect(llm.resolveTaskConfig("gutenberg_extraction").maxTokens).toBe(16384);
  });

  // Owner cost directive (FEEDBACK iter 165): the book-scale extraction runs on
  // sonnet, not FABLE_REPLACEMENT/opus — keep/drop calls go through human triage,
  // so cost beats top-model accuracy here. See DECISIONS iteration 165.
  it("defaults gutenberg_extraction to the cheaper claude-sonnet-4-6", () => {
    const llm = new LlmService(db, {}, { env: {} });
    expect(llm.resolveTaskConfig("gutenberg_extraction").model).toBe(
      "claude-sonnet-4-6",
    );
  });

  it("leaves other tasks on the adapter default (no maxTokens)", () => {
    const llm = new LlmService(db, {}, { env: {} });
    expect(
      llm.resolveTaskConfig("text_extraction").maxTokens,
    ).toBeUndefined();
    expect(llm.resolveTaskConfig("pdf_extraction").maxTokens).toBeUndefined();
  });

  it("env vars override the default", () => {
    const llm = new LlmService(
      db,
      {},
      {
        env: {
          LLM_PDF_EXTRACTION_PROVIDER: "anthropic",
          LLM_PDF_EXTRACTION_MODEL: "claude-haiku-4-5",
        },
      },
    );
    expect(llm.resolveTaskConfig("pdf_extraction").model).toBe(
      "claude-haiku-4-5",
    );
  });

  it("setting table override beats env and default", () => {
    routeTaskToMock("pdf_extraction", "setting-model");
    const llm = new LlmService(
      db,
      {},
      { env: { LLM_PDF_EXTRACTION_MODEL: "env-model" } },
    );
    expect(llm.resolveTaskConfig("pdf_extraction")).toEqual({
      provider: "mock",
      model: "setting-model",
    });
  });
});

describe("LlmService call logging", () => {
  it("writes an ok llm_call row with usage, latency and prompt_version", async () => {
    routeTaskToMock("pdf_extraction");
    const provider = makeProvider(async () => ({
      text: '{"words": []}',
      usage: OK_USAGE,
    }));
    const llm = new LlmService(db, { mock: provider }, { backoffBaseMs: 0 });

    const text = await llm.vision("pdf_extraction", [attachment]);
    expect(text).toBe('{"words": []}');

    const rows = llmCallRows();
    expect(rows).toHaveLength(1);
    const promptFile = fs.readFileSync(
      path.join(promptsDir, "pdf_extraction.md"),
      "utf8",
    );
    expect(rows[0]).toMatchObject({
      task: "pdf_extraction",
      provider: "mock",
      model: "mock-model",
      prompt_version: crypto
        .createHash("sha256")
        .update(promptFile)
        .digest("hex")
        .slice(0, 12),
      tokens_in: 120,
      tokens_out: 30,
      cache_hit: 1,
      cost_estimate_usd: 0.0027,
      status: "ok",
      error: null,
    });
    expect(rows[0]!.latency_ms).toBeGreaterThanOrEqual(0);
    // The prompt sent to the provider is the template file, never an inline string.
    expect(provider.calls[0]!.prompt).toBe(promptFile);
    expect(provider.calls[0]!.model).toBe("mock-model");
  });

  it("retries retryable failures with one error row per attempt", async () => {
    routeTaskToMock("page_classification");
    let attempts = 0;
    const provider = makeProvider(async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new LlmError("overloaded", { retryable: true });
      }
      return { text: '{"kind": "vocab"}', usage: OK_USAGE };
    });
    const llm = new LlmService(
      db,
      { mock: provider },
      { backoffBaseMs: 0, maxAttempts: 3 },
    );

    await expect(llm.vision("page_classification", [attachment])).resolves.toBe(
      '{"kind": "vocab"}',
    );
    const rows = llmCallRows();
    expect(rows.map((r) => r.status)).toEqual(["error", "error", "ok"]);
    expect(rows[0]!.error).toContain("overloaded");
    expect(rows[0]!.tokens_in).toBeNull();
  });

  it("does not retry non-retryable failures", async () => {
    routeTaskToMock("pdf_extraction");
    const provider = makeProvider(async () => {
      throw new LlmError("bad request", { retryable: false });
    });
    const llm = new LlmService(db, { mock: provider }, { backoffBaseMs: 0 });

    await expect(llm.vision("pdf_extraction", [attachment])).rejects.toThrow(
      "bad request",
    );
    expect(provider.calls).toHaveLength(1);
    expect(llmCallRows().map((r) => r.status)).toEqual(["error"]);
  });

  it("gives up after maxAttempts on persistent retryable failures", async () => {
    routeTaskToMock("pdf_extraction");
    const provider = makeProvider(async () => {
      throw new LlmError("still overloaded", { retryable: true });
    });
    const llm = new LlmService(
      db,
      { mock: provider },
      { backoffBaseMs: 0, maxAttempts: 2 },
    );

    await expect(llm.vision("pdf_extraction", [attachment])).rejects.toThrow(
      "still overloaded",
    );
    expect(provider.calls).toHaveLength(2);
    expect(llmCallRows().map((r) => r.status)).toEqual(["error", "error"]);
  });

  it("logs an error row when the configured provider is unknown", async () => {
    db.prepare("INSERT INTO setting (key, value) VALUES (?, ?)").run(
      "llm.pdf_extraction",
      JSON.stringify({ provider: "nope", model: "x" }),
    );
    const llm = new LlmService(db, {}, { backoffBaseMs: 0 });

    await expect(llm.vision("pdf_extraction", [attachment])).rejects.toThrow(
      'Unknown LLM provider "nope"',
    );
    const rows = llmCallRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ provider: "nope", status: "error" });
  });
});
