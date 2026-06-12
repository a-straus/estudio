import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import express, { type Express } from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  CreateThreadResponse,
  GetThreadResponse,
  ListThreadsResponse,
  PostMessageResponse,
  PostVoiceResponse,
  ConfirmToolResponse,
} from "@estudio/shared";
import { errorHandler } from "../app.js";
import { openDb, type DB } from "../db/db.js";
import { runMigrations } from "../db/migrate.js";
import { LlmService } from "../llm/service.js";
import type { LlmProvider } from "../llm/types.js";
import type { TranscriptionService } from "../transcription/service.js";
import { registerChatRoutes } from "./chat.js";

let dataDir: string;
let db: DB;
let app: Express;

const PLAIN_REPLY = "Because avergonzarse is reflexive by nature.";
const TOOL_REPLY = `Because it's useful.\n\`\`\`tool\n{"tool":"add_word_to_deck","args":{"term":"avergonzarse","deck_id":1}}\n\`\`\``;

const provider: LlmProvider = {
  name: "mock",
  complete: ({ prompt }) => {
    const text = prompt.includes("ADD_WORD") ? TOOL_REPLY : PLAIN_REPLY;
    return Promise.resolve({
      text,
      usage: { tokensIn: 1, tokensOut: 1, cacheHit: false, costEstimateUsd: 0 },
    });
  },
  vision: () => Promise.reject(new Error("not used")),
};

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "estudio-chat-r-"));
  db = openDb(dataDir);
  runMigrations(db, dataDir);

  db.prepare("INSERT INTO setting (key, value) VALUES (?, ?)").run(
    "llm.chat",
    JSON.stringify({ provider: "mock", model: "mock-chat" }),
  );

  const llm = new LlmService(db, { mock: provider }, process.env);
  app = express();
  app.use(express.json());
  registerChatRoutes(app, db, llm);
  app.use(errorHandler);
});

afterEach(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("POST /api/chat/threads", () => {
  it("creates a thread and returns it", async () => {
    const res = await request(app)
      .post("/api/chat/threads")
      .send({ pageContext: { kind: "review", label: "vergüenza" }, title: "Ask about vergüenza" })
      .expect(201);

    const body = res.body as CreateThreadResponse;
    expect(body.thread.id).toBeTypeOf("number");
    expect(body.thread.title).toBe("Ask about vergüenza");
    expect(body.thread.pageContext.label).toBe("vergüenza");
  });

  it("returns 400 when required fields are missing", async () => {
    await request(app).post("/api/chat/threads").send({}).expect(400);
  });
});

describe("GET /api/chat/threads", () => {
  it("returns empty list initially", async () => {
    const res = await request(app).get("/api/chat/threads").expect(200);
    const body = res.body as ListThreadsResponse;
    expect(body.threads).toHaveLength(0);
    expect(body.hasMore).toBe(false);
  });

  it("lists created threads", async () => {
    await request(app)
      .post("/api/chat/threads")
      .send({ pageContext: { kind: "home", label: "Home" }, title: "Thread 1" });

    const res = await request(app).get("/api/chat/threads").expect(200);
    const body = res.body as ListThreadsResponse;
    expect(body.threads).toHaveLength(1);
    expect(body.threads[0].title).toBe("Thread 1");
  });
});

describe("GET /api/chat/threads/:id", () => {
  it("returns 404 for unknown thread", async () => {
    await request(app).get("/api/chat/threads/999").expect(404);
  });

  it("returns thread with empty messages", async () => {
    const createRes = await request(app)
      .post("/api/chat/threads")
      .send({ pageContext: { kind: "home", label: "Home" }, title: "My thread" });
    const { thread } = createRes.body as CreateThreadResponse;

    const res = await request(app)
      .get(`/api/chat/threads/${thread.id}`)
      .expect(200);
    const body = res.body as GetThreadResponse;
    expect(body.thread.id).toBe(thread.id);
    expect(body.messages).toHaveLength(0);
  });
});

describe("POST /api/chat/threads/:id/messages", () => {
  it("creates user + assistant turns", async () => {
    const createRes = await request(app)
      .post("/api/chat/threads")
      .send({ pageContext: { kind: "review", label: "vergüenza" }, title: "Test" });
    const { thread } = createRes.body as CreateThreadResponse;

    const res = await request(app)
      .post(`/api/chat/threads/${thread.id}/messages`)
      .send({ content: "Why is it reflexive?" })
      .expect(201);

    const body = res.body as PostMessageResponse;
    expect(body.userMessage.role).toBe("user");
    expect(body.userMessage.content).toBe("Why is it reflexive?");
    expect(body.assistantMessage.role).toBe("assistant");
    expect(body.assistantMessage.content).toBeTruthy();
  });

  it("pauses on mutation tool with toolCall set", async () => {
    const createRes = await request(app)
      .post("/api/chat/threads")
      .send({ pageContext: { kind: "review", label: "vergüenza" }, title: "Test" });
    const { thread } = createRes.body as CreateThreadResponse;

    const res = await request(app)
      .post(`/api/chat/threads/${thread.id}/messages`)
      .send({ content: "ADD_WORD please" }) // triggers TOOL_REPLY branch in mock
      .expect(201);

    const body = res.body as PostMessageResponse;
    expect(body.assistantMessage.toolCall).toBeTruthy();
    expect(body.assistantMessage.toolCall?.toolName).toBe("add_word_to_deck");
    expect(body.assistantMessage.toolCall?.requiresConfirmation).toBe(true);
  });

  it("returns 400 when content is empty", async () => {
    const createRes = await request(app)
      .post("/api/chat/threads")
      .send({ pageContext: { kind: "home", label: "Home" }, title: "Test" });
    const { thread } = createRes.body as CreateThreadResponse;

    await request(app)
      .post(`/api/chat/threads/${thread.id}/messages`)
      .send({ content: "" })
      .expect(400);
  });
});

describe("POST /api/chat/threads/:id/tool", () => {
  it("confirms a pending add_word_to_deck and stores receipt", async () => {
    const createRes = await request(app)
      .post("/api/chat/threads")
      .send({ pageContext: { kind: "review", label: "vergüenza" }, title: "Test" });
    const { thread } = createRes.body as CreateThreadResponse;

    const msgRes = await request(app)
      .post(`/api/chat/threads/${thread.id}/messages`)
      .send({ content: "ADD_WORD please" });
    const { assistantMessage } = msgRes.body as PostMessageResponse;

    const res = await request(app)
      .post(`/api/chat/threads/${thread.id}/tool`)
      .send({ action: "confirm", messageId: assistantMessage.id })
      .expect(200);

    const body = res.body as ConfirmToolResponse;
    expect(body.assistantMessage.toolReceipt?.status).toBe("confirmed");
    expect(body.assistantMessage.toolReceipt?.toolName).toBe("add_word_to_deck");
  });

  it("skips a pending tool and stores receipt", async () => {
    const createRes = await request(app)
      .post("/api/chat/threads")
      .send({ pageContext: { kind: "review", label: "vergüenza" }, title: "Test" });
    const { thread } = createRes.body as CreateThreadResponse;

    const msgRes = await request(app)
      .post(`/api/chat/threads/${thread.id}/messages`)
      .send({ content: "ADD_WORD please" });
    const { assistantMessage } = msgRes.body as PostMessageResponse;

    const res = await request(app)
      .post(`/api/chat/threads/${thread.id}/tool`)
      .send({ action: "skip", messageId: assistantMessage.id })
      .expect(200);

    const body = res.body as ConfirmToolResponse;
    expect(body.assistantMessage.toolReceipt?.status).toBe("skipped");
  });
});

describe("POST /api/chat/threads/:id/voice", () => {
  const VOICE_TRANSCRIPT = "como se dice vergüenza";

  const fakeTranscription = {
    transcribe: () =>
      Promise.resolve({
        text: VOICE_TRANSCRIPT,
        usage: { minutes: 0.5, cacheHit: false, costEstimateUsd: 0 },
      }),
  } as unknown as TranscriptionService;

  let voiceApp: Express;

  beforeEach(() => {
    voiceApp = express();
    voiceApp.use(express.json());
    const llm = new LlmService(db, { mock: provider }, process.env);
    registerChatRoutes(voiceApp, db, llm, fakeTranscription, {
      readAudioDuration: async () => 0.5,
    });
    voiceApp.use(errorHandler);
  });

  it("transcribes a clip and returns 201 with transcript + user + assistant turns", async () => {
    const createRes = await request(voiceApp)
      .post("/api/chat/threads")
      .send({ pageContext: { kind: "review", label: "vergüenza" }, title: "Voice test" })
      .expect(201);
    const { thread } = createRes.body as CreateThreadResponse;

    const res = await request(voiceApp)
      .post(`/api/chat/threads/${thread.id}/voice`)
      .attach("file", Buffer.from("fake-audio-bytes"), "voice.webm")
      .expect(201);

    const body = res.body as PostVoiceResponse;
    expect(body.transcript).toBe(VOICE_TRANSCRIPT);
    expect(body.userMessage.role).toBe("user");
    expect(body.userMessage.content).toBe(VOICE_TRANSCRIPT);
    expect(body.assistantMessage.role).toBe("assistant");
    expect(body.assistantMessage.content).toBeTruthy();
  });

  it("returns 400 when no file is attached", async () => {
    const createRes = await request(voiceApp)
      .post("/api/chat/threads")
      .send({ pageContext: { kind: "home", label: "Home" }, title: "Test" });
    const { thread } = createRes.body as CreateThreadResponse;

    const res = await request(voiceApp)
      .post(`/api/chat/threads/${thread.id}/voice`)
      .expect(400);
    expect(res.body.error.code).toBe("missing_file");
  });

  it("returns 400 for an unsupported file extension", async () => {
    const createRes = await request(voiceApp)
      .post("/api/chat/threads")
      .send({ pageContext: { kind: "home", label: "Home" }, title: "Test" });
    const { thread } = createRes.body as CreateThreadResponse;

    const res = await request(voiceApp)
      .post(`/api/chat/threads/${thread.id}/voice`)
      .attach("file", Buffer.from("x"), "recording.txt")
      .expect(400);
    expect(res.body.error.code).toBe("invalid_audio");
  });

  it("returns 404 for unknown thread", async () => {
    await request(voiceApp)
      .post("/api/chat/threads/9999/voice")
      .attach("file", Buffer.from("x"), "voice.webm")
      .expect(404);
  });

  it("returns 503 when transcription service is unavailable", async () => {
    const noTranscriptionApp = express();
    noTranscriptionApp.use(express.json());
    const llm = new LlmService(db, { mock: provider }, process.env);
    registerChatRoutes(noTranscriptionApp, db, llm, undefined, {
      readAudioDuration: async () => 0.5,
    });
    noTranscriptionApp.use(errorHandler);

    const createRes = await request(noTranscriptionApp)
      .post("/api/chat/threads")
      .send({ pageContext: { kind: "home", label: "Home" }, title: "Test" });
    const { thread } = createRes.body as CreateThreadResponse;

    const res = await request(noTranscriptionApp)
      .post(`/api/chat/threads/${thread.id}/voice`)
      .attach("file", Buffer.from("x"), "voice.webm")
      .expect(503);
    expect(res.body.error.code).toBe("transcription_unavailable");
  });
});
