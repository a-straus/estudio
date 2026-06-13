import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb, type DB } from "../db/db.js";
import { runMigrations } from "../db/migrate.js";
import { insertSource } from "../db/queries.js";
import { insertCurriculum } from "../db/grammar-queries.js";
import { logger } from "../logger.js";
import { LlmService } from "../llm/service.js";
import { LlmError, type LlmProvider } from "../llm/types.js";
import { TranscriptionService } from "../transcription/service.js";
import {
  TranscriptionError,
  type TranscribeParams,
  type TranscriptionProvider,
  type TranscriptionResult,
} from "../transcription/types.js";
import type { ReadAudioDurationMinutes } from "../transcription/duration.js";
import { JobQueue } from "./queue.js";
import {
  enqueueLessonAudioIngestion,
  runLessonAudioIngestion,
} from "./lessonAudioIngestion.js";

let dataDir: string;
let db: DB;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "estudio-lesson-audio-"));
  db = openDb(dataDir);
  runMigrations(db, dataDir);
});

afterEach(() => {
  logger.detachDb();
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const ANALYSIS = {
  flaggedWords: [
    {
      term: "madrugar",
      lemma: "madrugar",
      partOfSpeech: "verbo",
      definitionEs: "Levantarse muy temprano.",
      definitionEn: "to get up early",
    },
  ],
  corrections: [
    { said: "yo iба", corrected: "yo iba", note: "spelling/pronunciation" },
  ],
  struggleSentences: [
    {
      sentence: "Si hubiera sabido, habría venido.",
      note: "conditional perfect",
    },
  ],
  topics: [{ name: "Subjuntivo" }],
};

/** A stub duration reader — never touches real audio bytes. */
const stubDuration = (minutes: number): ReadAudioDurationMinutes => {
  return async () => minutes;
};

/** LlmService whose lesson_analysis task is routed to a mock provider. */
function makeLlm(complete: () => string | Promise<string>) {
  db.prepare("INSERT INTO setting (key, value) VALUES (?, ?)").run(
    "llm.lesson_analysis",
    JSON.stringify({ provider: "mock", model: "mock-analysis" }),
  );
  const provider: LlmProvider = {
    name: "mock",
    complete: async () => ({
      text: await complete(),
      usage: {
        tokensIn: 100,
        tokensOut: 50,
        cacheHit: false,
        costEstimateUsd: 0.004,
      },
    }),
    vision: () => Promise.reject(new Error("vision not used")),
  };
  return new LlmService(db, { mock: provider }, { backoffBaseMs: 0 });
}

/** TranscriptionService whose mock provider echoes a fixed transcript. */
function makeTranscription(
  transcribe: (p: TranscribeParams) => Promise<TranscriptionResult>,
  opts: { maxChunkBytes?: number } = {},
) {
  db.prepare("INSERT INTO setting (key, value) VALUES (?, ?)").run(
    "transcription",
    JSON.stringify({ provider: "mock", model: "whisper-1" }),
  );
  const calls: TranscribeParams[] = [];
  const provider: TranscriptionProvider = {
    name: "mock",
    transcribe: (p) => {
      calls.push(p);
      return transcribe(p);
    },
  };
  const svc = new TranscriptionService(
    db,
    { mock: provider },
    { backoffBaseMs: 0, ...opts },
  );
  return { svc, calls };
}

function transcript(text: string) {
  return async (p: TranscribeParams): Promise<TranscriptionResult> => ({
    text,
    usage: { minutes: p.minutes, cacheHit: false, costEstimateUsd: 0.012 },
  });
}

/** Write an audio file to disk and insert a lesson_audio source pointing at it. */
function makeAudioSource(filename = "lesson.m4a", bytes = 32): number {
  const storedPath = path.join(dataDir, filename);
  fs.writeFileSync(storedPath, Buffer.alloc(bytes, 7));
  return insertSource(db, {
    type: "lesson_audio",
    title: "Tuesday lesson",
    ref: filename,
    storedPath,
    language: "es",
  });
}

function insightRows(sourceId: number) {
  return db
    .prepare(
      "SELECT type, payload, word_id, topic_id FROM lesson_insight WHERE source_id = ? ORDER BY id",
    )
    .all(sourceId) as {
    type: string;
    payload: string;
    word_id: number | null;
    topic_id: number | null;
  }[];
}

function itemRows(sourceId: number) {
  return db
    .prepare(
      "SELECT term, lemma, part_of_speech, definition_es, definition_en, batch_no, decision, word_id FROM extraction_item WHERE source_id = ? ORDER BY id",
    )
    .all(sourceId) as Record<string, unknown>[];
}

describe("runLessonAudioIngestion", () => {
  it("transcribes, stores the transcript, and writes one insight per type", async () => {
    const sourceId = makeAudioSource();
    const llm = makeLlm(() => JSON.stringify(ANALYSIS));
    const { svc, calls } = makeTranscription(
      transcript("hola, hoy practicamos"),
    );

    const result = await runLessonAudioIngestion(
      db,
      llm,
      svc,
      { sourceId },
      stubDuration(60),
    );
    expect(result).toEqual({ insights: 4, flaggedWords: 1 });

    // a. transcript saved; the provider saw the file bytes + computed minutes.
    expect(calls).toHaveLength(1);
    expect(calls[0]!.minutes).toBe(60);
    const stored = db
      .prepare("SELECT transcript, duration_minutes FROM source WHERE id = ?")
      .get(sourceId) as { transcript: string; duration_minutes: number };
    expect(stored.transcript).toBe("hola, hoy practicamos");
    expect(stored.duration_minutes).toBe(60);

    // c. one lesson_insight per type.
    const insights = insightRows(sourceId);
    expect(insights.map((i) => i.type)).toEqual([
      "flagged_word",
      "correction",
      "struggle_sentence",
      "topic_covered",
    ]);
    expect(JSON.parse(insights[0]!.payload)).toEqual(ANALYSIS.flaggedWords[0]);
    expect(JSON.parse(insights[1]!.payload)).toEqual(ANALYSIS.corrections[0]);
    expect(JSON.parse(insights[2]!.payload)).toEqual(
      ANALYSIS.struggleSentences[0],
    );
    expect(insights.every((i) => i.word_id === null)).toBe(true);

    // flagged word also flows into the triage queue as a pending extraction_item.
    const items = itemRows(sourceId);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      term: "madrugar",
      lemma: "madrugar",
      part_of_speech: "verbo",
      definition_es: "Levantarse muy temprano.",
      definition_en: "to get up early",
      batch_no: 1,
      decision: "pending",
      word_id: null,
    });

    // transcription_call + llm_call rows logged.
    expect(
      db.prepare("SELECT COUNT(*) AS c FROM transcription_call").get(),
    ).toEqual({ c: 1 });
    expect(
      db.prepare("SELECT task, status FROM llm_call ORDER BY id").all(),
    ).toEqual([{ task: "lesson_analysis", status: "ok" }]);
  });

  it("links a topic_covered insight to a seeded grammar_topic by normalized name", async () => {
    insertCurriculum(db, [
      { name: "Modo", topics: [{ name: "Subjuntivo", description: null }] },
    ]);
    const topicId = (
      db
        .prepare("SELECT id FROM grammar_topic WHERE name = 'Subjuntivo'")
        .get() as {
        id: number;
      }
    ).id;
    const sourceId = makeAudioSource();
    // accent/case drift still matches via normalize.
    const llm = makeLlm(() =>
      JSON.stringify({
        flaggedWords: [],
        corrections: [],
        struggleSentences: [],
        topics: [{ name: "subjuntivo" }, { name: "Condicional" }],
      }),
    );
    const { svc } = makeTranscription(transcript("texto"));

    await runLessonAudioIngestion(db, llm, svc, { sourceId }, stubDuration(10));

    const insights = insightRows(sourceId);
    expect(insights).toHaveLength(2);
    // "subjuntivo" → matched; "Condicional" not seeded → null.
    expect(insights[0]).toMatchObject({
      type: "topic_covered",
      topic_id: topicId,
    });
    expect(insights[1]).toMatchObject({
      type: "topic_covered",
      topic_id: null,
    });
  });

  it("skips re-transcription and does not duplicate rows on rerun", async () => {
    const sourceId = makeAudioSource();
    const llm = makeLlm(() => JSON.stringify(ANALYSIS));
    const { svc, calls } = makeTranscription(transcript("hola"));

    await runLessonAudioIngestion(db, llm, svc, { sourceId }, stubDuration(60));
    // Second run: transcript already present, so the provider is NOT called again.
    await runLessonAudioIngestion(db, llm, svc, { sourceId }, stubDuration(60));

    expect(calls).toHaveLength(1);
    // Delete-and-rewrite keeps exactly one set of rows.
    expect(insightRows(sourceId)).toHaveLength(4);
    expect(itemRows(sourceId)).toHaveLength(1);
  });

  it("batches flagged words into groups of ~50", async () => {
    const sourceId = makeAudioSource();
    const flaggedWords = Array.from({ length: 60 }, (_, i) => ({
      term: `palabra${i}`,
      lemma: `palabra${i}`,
      partOfSpeech: "sustantivo",
      definitionEs: "x",
      definitionEn: "x",
    }));
    const llm = makeLlm(() =>
      JSON.stringify({
        flaggedWords,
        corrections: [],
        struggleSentences: [],
        topics: [],
      }),
    );
    const { svc } = makeTranscription(transcript("texto"));

    await runLessonAudioIngestion(db, llm, svc, { sourceId }, stubDuration(10));

    const items = itemRows(sourceId);
    expect(items).toHaveLength(60);
    expect(items.filter((i) => i.batch_no === 1)).toHaveLength(50);
    expect(items.filter((i) => i.batch_no === 2)).toHaveLength(10);
  });

  it("tolerates a fenced JSON response from the model", async () => {
    const sourceId = makeAudioSource();
    const llm = makeLlm(() => "```json\n" + JSON.stringify(ANALYSIS) + "\n```");
    const { svc } = makeTranscription(transcript("texto"));

    await runLessonAudioIngestion(db, llm, svc, { sourceId }, stubDuration(10));
    expect(insightRows(sourceId)).toHaveLength(4);
  });

  it("fails cleanly on oversized audio without crashing the queue", async () => {
    const sourceId = makeAudioSource("lesson.m4a", 2048);
    const llm = makeLlm(() => JSON.stringify(ANALYSIS));
    // Default splitter + a tiny per-request limit → the oversized .m4a throws.
    const { svc, calls } = makeTranscription(transcript("never reached"), {
      maxChunkBytes: 1024,
    });

    await expect(
      runLessonAudioIngestion(db, llm, svc, { sourceId }, stubDuration(90)),
    ).rejects.toThrow(
      /transcription failed for source .*audio splitting for m4a/,
    );

    // Provider never invoked; nothing written; transcript stays empty.
    expect(calls).toHaveLength(0);
    expect(insightRows(sourceId)).toHaveLength(0);
    expect(itemRows(sourceId)).toHaveLength(0);
    const src = db
      .prepare("SELECT transcript FROM source WHERE id = ?")
      .get(sourceId) as { transcript: string | null };
    expect(src.transcript).toBeNull();

    // Through the queue: the job ends up failed, the queue keeps running.
    const queue = new JobQueue(db, { backoffBaseMs: 0 });
    queue.register(
      "lesson_audio_ingestion",
      (payload) =>
        runLessonAudioIngestion(
          db,
          llm,
          svc,
          payload as { sourceId: number },
          stubDuration(90),
        ),
      { maxAttempts: 1 },
    );
    const jobId = enqueueLessonAudioIngestion(db, queue, { sourceId });
    await expect(queue.tick()).resolves.toBe(true);
    const job = db
      .prepare("SELECT status, error FROM job WHERE id = ?")
      .get(jobId) as { status: string; error: string };
    expect(job.status).toBe("failed");
    expect(job.error).toContain("audio splitting for m4a");
  });

  it("propagates an analysis failure after the transcript is saved (resumable)", async () => {
    const sourceId = makeAudioSource();
    const llm = makeLlm(() => {
      throw new LlmError("model exploded", { retryable: false });
    });
    const { svc, calls } = makeTranscription(transcript("transcrito"));

    await expect(
      runLessonAudioIngestion(db, llm, svc, { sourceId }, stubDuration(60)),
    ).rejects.toThrow("model exploded");

    // Transcript persisted, so a retry resumes at analysis without re-transcribing.
    const src = db
      .prepare("SELECT transcript FROM source WHERE id = ?")
      .get(sourceId) as { transcript: string };
    expect(src.transcript).toBe("transcrito");

    const llmOk = makeLlmRetry(() => JSON.stringify(ANALYSIS));
    await runLessonAudioIngestion(
      db,
      llmOk,
      svc,
      { sourceId },
      stubDuration(60),
    );
    expect(calls).toHaveLength(1); // no second transcription
    expect(insightRows(sourceId)).toHaveLength(4);
  });

  it("S2: populates level, example, and likely_known = 0 on extraction_item", async () => {
    const sourceId = makeAudioSource();
    const analysis = {
      flaggedWords: [
        {
          term: "madrugar",
          lemma: "madrugar",
          partOfSpeech: "verbo",
          definitionEs: "Levantarse muy temprano.",
          definitionEn: "to get up early",
          level: "B2",
          example: "Me gusta madrugar los domingos.",
        },
      ],
      corrections: [],
      struggleSentences: [],
      topics: [],
    };
    const llm = makeLlm(() => JSON.stringify(analysis));
    const { svc } = makeTranscription(transcript("texto"));

    await runLessonAudioIngestion(db, llm, svc, { sourceId }, stubDuration(10));

    const items = db
      .prepare(
        "SELECT level, example, likely_known FROM extraction_item WHERE source_id = ?",
      )
      .all(sourceId) as {
      level: string | null;
      example: string | null;
      likely_known: number | null;
    }[];
    expect(items).toHaveLength(1);
    expect(items[0]!.level).toBe("B2");
    expect(items[0]!.example).toBe("Me gusta madrugar los domingos.");
    expect(items[0]!.likely_known).toBe(0);
  });

  it("S2: falls back to null level/example when the model omits them", async () => {
    const sourceId = makeAudioSource();
    // ANALYSIS has no level/example fields — parser must tolerate this gracefully.
    const llm = makeLlm(() => JSON.stringify(ANALYSIS));
    const { svc } = makeTranscription(transcript("texto"));

    await runLessonAudioIngestion(db, llm, svc, { sourceId }, stubDuration(10));

    const items = db
      .prepare(
        "SELECT level, example, likely_known FROM extraction_item WHERE source_id = ?",
      )
      .all(sourceId) as {
      level: string | null;
      example: string | null;
      likely_known: number | null;
    }[];
    expect(items).toHaveLength(1);
    expect(items[0]!.level).toBeNull();
    expect(items[0]!.example).toBeNull();
    expect(items[0]!.likely_known).toBe(0); // still 0 regardless of level/example
  });

  it("S1: skips destructive rewrite when the source already has triaged extraction_items", async () => {
    const sourceId = makeAudioSource();
    const llm = makeLlm(() => JSON.stringify(ANALYSIS));
    const { svc } = makeTranscription(transcript("texto"));

    await runLessonAudioIngestion(db, llm, svc, { sourceId }, stubDuration(10));

    // Simulate a triage decision on the extraction_item.
    db.prepare(
      "UPDATE extraction_item SET decision = 'learn' WHERE source_id = ?",
    ).run(sourceId);

    // Second run with different analysis — should NOT overwrite the decided row.
    const llm2 = makeLlmRetry(() =>
      JSON.stringify({ flaggedWords: [], corrections: [], struggleSentences: [], topics: [] }),
    );
    await runLessonAudioIngestion(db, llm2, svc, { sourceId }, stubDuration(10));

    const items = itemRows(sourceId);
    expect(items).toHaveLength(1); // original decided item preserved
    expect(items[0]!.decision).toBe("learn");
  });

  it("N3: does not re-transcribe when stored transcript is empty string", async () => {
    const sourceId = makeAudioSource();
    // Simulate a prior run that transcribed to empty (e.g. silent recording).
    db.prepare("UPDATE source SET transcript = '' WHERE id = ?").run(sourceId);

    const llm = makeLlm(() =>
      JSON.stringify({
        flaggedWords: [],
        corrections: [],
        struggleSentences: [],
        topics: [],
      }),
    );
    const { svc, calls } = makeTranscription(transcript("should not be called"));

    await runLessonAudioIngestion(db, llm, svc, { sourceId }, stubDuration(10));

    expect(calls).toHaveLength(0); // Whisper not re-invoked for a stored ""
    const src = db
      .prepare("SELECT transcript FROM source WHERE id = ?")
      .get(sourceId) as { transcript: string };
    expect(src.transcript).toBe("");
  });

  it("patches the jobId into the payload and streams phase progress", async () => {
    const sourceId = makeAudioSource();
    const queue = new JobQueue(db, { backoffBaseMs: 0 });
    const jobId = enqueueLessonAudioIngestion(db, queue, { sourceId });
    const payload = JSON.parse(
      (
        db.prepare("SELECT payload FROM job WHERE id = ?").get(jobId) as {
          payload: string;
        }
      ).payload,
    );
    expect(payload).toEqual({ sourceId, jobId });

    const llm = makeLlm(() => JSON.stringify(ANALYSIS));
    const { svc } = makeTranscription(transcript("texto"));
    await runLessonAudioIngestion(db, llm, svc, payload, stubDuration(60));

    const progress = JSON.parse(
      (
        db.prepare("SELECT progress FROM job WHERE id = ?").get(jobId) as {
          progress: string;
        }
      ).progress,
    );
    expect(progress).toEqual({ phase: "done" });
  });
});

/** A second LlmService routed to mock (the first run consumed its setting row). */
function makeLlmRetry(complete: () => string) {
  const provider: LlmProvider = {
    name: "mock",
    complete: async () => ({
      text: complete(),
      usage: { tokensIn: 1, tokensOut: 1, cacheHit: false, costEstimateUsd: 0 },
    }),
    vision: () => Promise.reject(new Error("vision not used")),
  };
  return new LlmService(db, { mock: provider }, { backoffBaseMs: 0 });
}
