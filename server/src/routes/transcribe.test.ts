import request from "supertest";
import express, { type Express } from "express";
import { beforeEach, describe, expect, it } from "vitest";
import type { TranscriptionService } from "../transcription/service.js";
import { errorHandler } from "../app.js";
import { registerTranscribeRoutes } from "./transcribe.js";

const TRANSCRIPT = "hola mundo";

const fakeTranscription = {
  transcribe: () =>
    Promise.resolve({
      text: TRANSCRIPT,
      usage: { minutes: 0.5, cacheHit: false, costEstimateUsd: 0 },
    }),
} as unknown as TranscriptionService;

describe("POST /api/transcribe", () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    registerTranscribeRoutes(app, null as never, fakeTranscription, {
      readAudioDuration: async () => 0.5,
    });
    app.use(errorHandler);
  });

  it("returns 200 with { text } on valid audio", async () => {
    const res = await request(app)
      .post("/api/transcribe")
      .attach("file", Buffer.from("fake-audio-bytes"), "voice.webm")
      .expect(200);
    expect(res.body.text).toBe(TRANSCRIPT);
  });

  it("returns 503 when transcription is not provided", async () => {
    const noTranscriptionApp = express();
    noTranscriptionApp.use(express.json());
    registerTranscribeRoutes(noTranscriptionApp, null as never, undefined, {
      readAudioDuration: async () => 0.5,
    });
    noTranscriptionApp.use(errorHandler);

    const res = await request(noTranscriptionApp)
      .post("/api/transcribe")
      .attach("file", Buffer.from("fake-audio-bytes"), "voice.webm")
      .expect(503);
    expect(res.body.error.code).toBe("transcription_unavailable");
  });

  it("returns 422 on empty transcript", async () => {
    const emptyTranscription = {
      transcribe: () =>
        Promise.resolve({
          text: "   ",
          usage: { minutes: 0.5, cacheHit: false, costEstimateUsd: 0 },
        }),
    } as unknown as TranscriptionService;

    const emptyApp = express();
    emptyApp.use(express.json());
    registerTranscribeRoutes(emptyApp, null as never, emptyTranscription, {
      readAudioDuration: async () => 0.5,
    });
    emptyApp.use(errorHandler);

    const res = await request(emptyApp)
      .post("/api/transcribe")
      .attach("file", Buffer.from("fake-audio-bytes"), "voice.webm")
      .expect(422);
    expect(res.body.error.code).toBe("empty_transcript");
  });

  it("returns 400 on unreadable audio", async () => {
    const badDurationApp = express();
    badDurationApp.use(express.json());
    registerTranscribeRoutes(badDurationApp, null as never, fakeTranscription, {
      readAudioDuration: async () => {
        throw new Error("not audio");
      },
    });
    badDurationApp.use(errorHandler);

    const res = await request(badDurationApp)
      .post("/api/transcribe")
      .attach("file", Buffer.from("not-audio"), "voice.webm")
      .expect(400);
    expect(res.body.error.code).toBe("invalid_audio");
  });
});
