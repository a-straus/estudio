import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb, type DB } from "../db/db.js";
import { runMigrations } from "../db/migrate.js";
import { logger } from "../logger.js";
import { estimateWhisperCostUsd, WHISPER_USD_PER_MINUTE } from "./openai.js";
import { defaultSplitAudio, TranscriptionService } from "./service.js";
import {
  TranscriptionError,
  type AudioChunk,
  type SplitAudio,
  type TranscribeParams,
  type TranscriptionProvider,
  type TranscriptionResult,
} from "./types.js";

let dataDir: string;
let db: DB;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "estudio-tr-"));
  db = openDb(dataDir);
  runMigrations(db, dataDir);
});

afterEach(() => {
  logger.detachDb();
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function makeProvider(
  transcribe: (params: TranscribeParams) => Promise<TranscriptionResult>,
): TranscriptionProvider & { calls: TranscribeParams[] } {
  const calls: TranscribeParams[] = [];
  return {
    name: "mock",
    calls,
    transcribe: (params) => {
      calls.push(params);
      return transcribe(params);
    },
  };
}

function input(data: Buffer, minutes: number, filename = "lesson.wav") {
  return { data, filename, minutes };
}

function callRows() {
  return db
    .prepare(
      "SELECT task, provider, model, prompt_version, minutes, latency_ms, cache_hit, cost_estimate_usd, status, error FROM transcription_call ORDER BY id",
    )
    .all() as {
    task: string;
    provider: string;
    model: string;
    prompt_version: string | null;
    minutes: number | null;
    latency_ms: number;
    cache_hit: number;
    cost_estimate_usd: number | null;
    status: string;
    error: string | null;
  }[];
}

describe("estimateWhisperCostUsd", () => {
  it("prices audio at $0.006/min (~$0.36/hr)", () => {
    expect(WHISPER_USD_PER_MINUTE).toBe(0.006);
    expect(estimateWhisperCostUsd(0)).toBe(0);
    expect(estimateWhisperCostUsd(10)).toBeCloseTo(0.06, 6);
    expect(estimateWhisperCostUsd(60)).toBeCloseTo(0.36, 6);
  });
});

describe("TranscriptionService.resolveConfig", () => {
  it("defaults to openai / whisper-1", () => {
    const svc = new TranscriptionService(db, {}, { env: {} });
    expect(svc.resolveConfig()).toEqual({
      provider: "openai",
      model: "whisper-1",
    });
  });

  it("env vars override the default", () => {
    const svc = new TranscriptionService(
      db,
      {},
      { env: { TRANSCRIPTION_PROVIDER: "openai", TRANSCRIPTION_MODEL: "whisper-2" } },
    );
    expect(svc.resolveConfig().model).toBe("whisper-2");
  });

  it("setting row beats env and default", () => {
    db.prepare("INSERT INTO setting (key, value) VALUES (?, ?)").run(
      "transcription",
      JSON.stringify({ provider: "mock", model: "setting-model" }),
    );
    const svc = new TranscriptionService(
      db,
      {},
      { env: { TRANSCRIPTION_MODEL: "env-model" } },
    );
    expect(svc.resolveConfig()).toEqual({
      provider: "mock",
      model: "setting-model",
    });
  });
});

describe("TranscriptionService call logging", () => {
  function routeToMock(model = "whisper-1") {
    db.prepare("INSERT INTO setting (key, value) VALUES (?, ?)").run(
      "transcription",
      JSON.stringify({ provider: "mock", model }),
    );
  }

  it("writes an ok transcription_call row with minutes + cost, null prompt_version", async () => {
    routeToMock();
    const provider = makeProvider(async (p) => ({
      text: "hola mundo",
      usage: { minutes: p.minutes, cacheHit: false, costEstimateUsd: 0.012 },
    }));
    const svc = new TranscriptionService(
      db,
      { mock: provider },
      { backoffBaseMs: 0 },
    );

    const result = await svc.transcribe("lesson_audio", input(Buffer.from("x"), 2));
    expect(result.text).toBe("hola mundo");
    expect(result.usage.minutes).toBe(2);
    expect(result.usage.costEstimateUsd).toBeCloseTo(0.012, 6);

    const rows = callRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      task: "lesson_audio",
      provider: "mock",
      model: "whisper-1",
      prompt_version: null,
      minutes: 2,
      cache_hit: 0,
      cost_estimate_usd: 0.012,
      status: "ok",
      error: null,
    });
    expect(rows[0]!.latency_ms).toBeGreaterThanOrEqual(0);
  });

  it("retries a retryable failure then logs ok — one row per attempt", async () => {
    routeToMock();
    let attempts = 0;
    const provider = makeProvider(async (p) => {
      attempts += 1;
      if (attempts < 3) {
        throw new TranscriptionError("rate limited", { retryable: true });
      }
      return {
        text: "ok",
        usage: { minutes: p.minutes, cacheHit: false, costEstimateUsd: 0.006 },
      };
    });
    const svc = new TranscriptionService(
      db,
      { mock: provider },
      { backoffBaseMs: 0, maxAttempts: 3 },
    );

    await expect(
      svc.transcribe("lesson_audio", input(Buffer.from("x"), 1)),
    ).resolves.toMatchObject({ text: "ok" });

    const rows = callRows();
    expect(rows.map((r) => r.status)).toEqual(["error", "error", "ok"]);
    expect(rows[0]!.error).toContain("rate limited");
    expect(rows[0]!.minutes).toBeNull();
    expect(rows[0]!.cost_estimate_usd).toBeNull();
  });

  it("gives up after maxAttempts and writes only error rows", async () => {
    routeToMock();
    const provider = makeProvider(async () => {
      throw new TranscriptionError("still overloaded", { retryable: true });
    });
    const svc = new TranscriptionService(
      db,
      { mock: provider },
      { backoffBaseMs: 0, maxAttempts: 2 },
    );

    await expect(
      svc.transcribe("lesson_audio", input(Buffer.from("x"), 1)),
    ).rejects.toThrow("still overloaded");
    expect(provider.calls).toHaveLength(2);
    expect(callRows().map((r) => r.status)).toEqual(["error", "error"]);
  });

  it("does not retry a non-retryable failure", async () => {
    routeToMock();
    const provider = makeProvider(async () => {
      throw new TranscriptionError("bad audio", { retryable: false });
    });
    const svc = new TranscriptionService(
      db,
      { mock: provider },
      { backoffBaseMs: 0 },
    );

    await expect(
      svc.transcribe("lesson_audio", input(Buffer.from("x"), 1)),
    ).rejects.toThrow("bad audio");
    expect(provider.calls).toHaveLength(1);
    expect(callRows().map((r) => r.status)).toEqual(["error"]);
  });

  it("logs an error row when the configured provider is unknown", async () => {
    db.prepare("INSERT INTO setting (key, value) VALUES (?, ?)").run(
      "transcription",
      JSON.stringify({ provider: "nope", model: "x" }),
    );
    const svc = new TranscriptionService(db, {}, { backoffBaseMs: 0 });

    await expect(
      svc.transcribe("lesson_audio", input(Buffer.from("x"), 1)),
    ).rejects.toThrow('Unknown transcription provider "nope"');
    const rows = callRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ provider: "nope", status: "error" });
  });
});

describe("TranscriptionService chunk → transcribe → stitch", () => {
  function routeToMock() {
    db.prepare("INSERT INTO setting (key, value) VALUES (?, ?)").run(
      "transcription",
      JSON.stringify({ provider: "mock", model: "whisper-1" }),
    );
  }

  it("splits an over-limit input into N chunks and stitches N transcripts in order", async () => {
    routeToMock();
    // Mock splitter: three ordered 2-minute chunks, each tagged so we can prove order.
    const mockSplit: SplitAudio = (inp): AudioChunk[] =>
      [0, 1, 2].map((i) => ({
        data: Buffer.from(`chunk-${i}`),
        filename: `${inp.filename}.${i}`,
        minutes: 2,
      }));
    const provider = makeProvider(async (p) => ({
      // Echo the chunk's bytes back as the "transcript" so order is verifiable.
      text: p.audio.toString(),
      usage: { minutes: p.minutes, cacheHit: false, costEstimateUsd: 0.012 },
    }));
    const svc = new TranscriptionService(
      db,
      { mock: provider },
      { backoffBaseMs: 0, splitAudio: mockSplit },
    );

    const result = await svc.transcribe(
      "lesson_audio",
      input(Buffer.from("big"), 6),
    );

    expect(provider.calls).toHaveLength(3);
    // Stitched in order.
    expect(result.text).toBe("chunk-0 chunk-1 chunk-2");
    // Usage summed across chunks.
    expect(result.usage.minutes).toBe(6);
    expect(result.usage.costEstimateUsd).toBeCloseTo(0.036, 6);
    // One transcription_call row per chunk, all ok.
    const rows = callRows();
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.status)).toEqual(["ok", "ok", "ok"]);
    expect(rows.map((r) => r.minutes)).toEqual([2, 2, 2]);
  });

  it("retries per-chunk: a mid-recording retryable failure recovers without losing order", async () => {
    routeToMock();
    const mockSplit: SplitAudio = (): AudioChunk[] =>
      [0, 1].map((i) => ({
        data: Buffer.from(`c${i}`),
        filename: `seg.${i}`,
        minutes: 1,
      }));
    let c1Attempts = 0;
    const provider = makeProvider(async (p) => {
      if (p.audio.toString() === "c1" && c1Attempts++ === 0) {
        throw new TranscriptionError("blip", { retryable: true });
      }
      return {
        text: p.audio.toString(),
        usage: { minutes: p.minutes, cacheHit: false, costEstimateUsd: 0.006 },
      };
    });
    const svc = new TranscriptionService(
      db,
      { mock: provider },
      { backoffBaseMs: 0, splitAudio: mockSplit },
    );

    const result = await svc.transcribe("lesson_audio", input(Buffer.from("x"), 2));
    expect(result.text).toBe("c0 c1");
    // c0 ok, c1 error then ok.
    expect(callRows().map((r) => r.status)).toEqual(["ok", "error", "ok"]);
  });
});

describe("defaultSplitAudio", () => {
  it("passes audio that fits the limit through as a single chunk", () => {
    const chunks = defaultSplitAudio(input(Buffer.from("small"), 3), 1024);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.minutes).toBe(3);
    expect(chunks[0]!.data.toString()).toBe("small");
  });

  it("defers oversized compressed audio to lesson-recording-ingestion", () => {
    const big = Buffer.alloc(2048, 1);
    expect(() =>
      defaultSplitAudio({ data: big, filename: "lesson.m4a", minutes: 90 }, 1024),
    ).toThrow("audio splitting for m4a is wired in lesson-recording-ingestion");
  });
});
