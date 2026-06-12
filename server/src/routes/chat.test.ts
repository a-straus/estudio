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

describe("S4 — generateAssistantReply uses most-recent 50 turns", () => {
  it("feeds the latest turn (not the oldest) when the thread has > 50 messages", async () => {
    const capturedPrompts: string[] = [];
    const captureProvider: LlmProvider = {
      name: "capture",
      complete: ({ prompt }) => {
        capturedPrompts.push(prompt as string);
        return Promise.resolve({ text: PLAIN_REPLY, usage: { tokensIn: 1, tokensOut: 1, cacheHit: false, costEstimateUsd: 0 } });
      },
      vision: () => Promise.reject(new Error("not used")),
    };

    db.prepare("UPDATE setting SET value = ? WHERE key = 'llm.chat'").run(
      JSON.stringify({ provider: "capture", model: "capture-chat" }),
    );

    const captureApp = express();
    captureApp.use(express.json());
    const llm = new LlmService(db, { capture: captureProvider }, process.env);
    registerChatRoutes(captureApp, db, llm);
    captureApp.use(errorHandler);

    const createRes = await request(captureApp)
      .post("/api/chat/threads")
      .send({ pageContext: { kind: "home", label: "Home" }, title: "Big thread" });
    const { thread } = createRes.body as CreateThreadResponse;

    // Insert 51 old messages directly (avoid hitting LLM 51 times).
    // First message gets a unique sentinel name so it can't match later messages.
    const oldTs = "2020-01-01T00:00:00Z";
    db.prepare(
      "INSERT INTO chat_message (thread_id, role, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    ).run(thread.id, "user", "OLDEST_SENTINEL_TURN", oldTs, oldTs);
    for (let i = 2; i <= 51; i++) {
      db.prepare(
        "INSERT INTO chat_message (thread_id, role, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      ).run(thread.id, "user", `Old message ${i}`, oldTs, oldTs);
    }

    // Send the latest message — this triggers generateAssistantReply
    await request(captureApp)
      .post(`/api/chat/threads/${thread.id}/messages`)
      .send({ content: "Latest user question" })
      .expect(201);

    expect(capturedPrompts.length).toBe(1);
    // Most recent 50 includes the latest turn
    expect(capturedPrompts[0]).toContain("Latest user question");
    // But NOT the oldest message (it falls outside the 50-turn window)
    expect(capturedPrompts[0]).not.toContain("OLDEST_SENTINEL_TURN");
  });
});

describe("S5 — message ordering tiebreak by id", () => {
  it("returns messages with identical created_at in insertion order", async () => {
    const createRes = await request(app)
      .post("/api/chat/threads")
      .send({ pageContext: { kind: "home", label: "Home" }, title: "Tiebreak test" });
    const { thread } = createRes.body as CreateThreadResponse;

    const sameTs = "2024-01-01T12:00:00Z";
    db.prepare(
      "INSERT INTO chat_message (thread_id, role, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    ).run(thread.id, "user", "First message", sameTs, sameTs);
    db.prepare(
      "INSERT INTO chat_message (thread_id, role, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    ).run(thread.id, "assistant", "Second message", sameTs, sameTs);

    const res = await request(app).get(`/api/chat/threads/${thread.id}`).expect(200);
    const body = res.body as GetThreadResponse;
    expect(body.messages[0].content).toBe("First message");
    expect(body.messages[1].content).toBe("Second message");
  });
});

describe("N3 — lookup_word normalizes accented query", () => {
  it("finds a word via term_normalized when the query term has accents", async () => {
    const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    db.prepare(
      `INSERT INTO word (term, term_normalized, language, status, deck_id, created_at, updated_at)
       VALUES (?, ?, 'es', 'new', 1, ?, ?)`,
    ).run("Vergüenza", "verguenza", now, now);

    const lookupProvider: LlmProvider = {
      name: "lookup",
      complete: () =>
        Promise.resolve({
          text: 'Let me look that up.\n```tool\n{"tool":"lookup_word","args":{"term":"vergüenza"}}\n```',
          usage: { tokensIn: 1, tokensOut: 1, cacheHit: false, costEstimateUsd: 0 },
        }),
      vision: () => Promise.reject(new Error("not used")),
    };

    db.prepare("UPDATE setting SET value = ? WHERE key = 'llm.chat'").run(
      JSON.stringify({ provider: "lookup", model: "lookup-chat" }),
    );

    const lookupApp = express();
    lookupApp.use(express.json());
    const llm = new LlmService(db, { lookup: lookupProvider }, process.env);
    registerChatRoutes(lookupApp, db, llm);
    lookupApp.use(errorHandler);

    const createRes = await request(lookupApp)
      .post("/api/chat/threads")
      .send({ pageContext: { kind: "home", label: "Home" }, title: "Lookup test" });
    const { thread } = createRes.body as CreateThreadResponse;

    const res = await request(lookupApp)
      .post(`/api/chat/threads/${thread.id}/messages`)
      .send({ content: "What is vergüenza?" })
      .expect(201);

    const body = res.body as PostMessageResponse;
    // The tool result should contain the word (found via normalized lookup)
    expect(body.assistantMessage.content).toContain("Vergüenza");
    expect(body.assistantMessage.content).not.toContain("not found");
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
