import fs from "node:fs";
import path from "node:path";
import { normalize } from "@estudio/shared";
import type {
  CorrectionPayload,
  FlaggedWordPayload,
  StruggleSentencePayload,
  TopicCoveredPayload,
} from "@estudio/shared";
import { nowIso, type DB } from "../db/db.js";
import { insertLessonInsight } from "../db/queries.js";
import { listGrammarTopicsForMatching } from "../db/grammar-queries.js";
import { logger } from "../logger.js";
import type { LlmService } from "../llm/service.js";
import type { TranscriptionService } from "../transcription/service.js";
import {
  readAudioDurationMinutes,
  type ReadAudioDurationMinutes,
} from "../transcription/duration.js";
import type { JobQueue } from "./queue.js";

export const JOB_TYPE_LESSON_AUDIO_INGESTION = "lesson_audio_ingestion";

/** Flagged-word extraction items are grouped for triage in batches of ~this many. */
export const BATCH_SIZE = 50;

export interface LessonAudioIngestionPayload {
  sourceId: number;
  /** Patched in after enqueue so the handler can persist phase progress. */
  jobId?: number;
}

/** Coarse phase written to job.progress while the recording is processed. */
type Phase = "transcribing" | "analyzing" | "done";

/** Extends FlaggedWordPayload with extraction_item fields the prompt now returns. */
interface ParsedFlaggedWord extends FlaggedWordPayload {
  level: string | null;
  example: string | null;
}

interface LessonAnalysis {
  flaggedWords: ParsedFlaggedWord[];
  corrections: CorrectionPayload[];
  struggleSentences: StruggleSentencePayload[];
  topics: TopicCoveredPayload[];
}

/**
 * Enqueue a lesson_audio_ingestion job, then patch its own id into the payload
 * so the handler can write phase progress JSON onto the job row mid-run.
 */
export function enqueueLessonAudioIngestion(
  db: DB,
  queue: JobQueue,
  payload: LessonAudioIngestionPayload,
): number {
  const jobId = queue.enqueue(JOB_TYPE_LESSON_AUDIO_INGESTION, payload);
  db.prepare("UPDATE job SET payload = ? WHERE id = ?").run(
    JSON.stringify({ ...payload, jobId }),
    jobId,
  );
  return jobId;
}

function writePhase(db: DB, jobId: number | undefined, phase: Phase): void {
  if (jobId === undefined) return;
  db.prepare("UPDATE job SET progress = ?, updated_at = ? WHERE id = ?").run(
    JSON.stringify({ phase }),
    nowIso(),
    jobId,
  );
}

/**
 * Transcribe a recorded lesson, then mine its transcript for learning material.
 *
 * Steps, all idempotent so the queue can safely retry:
 *   a. transcribe the stored audio into source.transcript (skipped if already
 *      present, so a retry after analysis failed never re-transcribes — no
 *      duplicate Whisper spend);
 *   b. run the lesson_analysis LLM task on the transcript;
 *   c. delete-and-rewrite this source's lesson_insight + flagged-word
 *      extraction_item rows so a rerun never accumulates duplicates.
 *
 * `readAudioDuration` is an injectable seam (defaults to the music-metadata
 * impl) so the job is unit-testable without a real audio file. Oversized
 * recordings throw a clear TranscriptionError from the default splitter; we
 * surface that as an actionable job failure rather than crash the queue.
 */
export async function runLessonAudioIngestion(
  db: DB,
  llm: LlmService,
  transcription: TranscriptionService,
  payload: LessonAudioIngestionPayload,
  readAudioDuration: ReadAudioDurationMinutes = readAudioDurationMinutes,
): Promise<{ insights: number; flaggedWords: number }> {
  const source = db
    .prepare("SELECT id, ref, stored_path, transcript FROM source WHERE id = ?")
    .get(payload.sourceId) as
    | {
        id: number;
        ref: string | null;
        stored_path: string | null;
        transcript: string | null;
      }
    | undefined;
  if (!source) {
    throw new Error(`source ${payload.sourceId} not found`);
  }

  // a. Transcribe (skip when a prior attempt already stored the transcript).
  // Distinguish null (never transcribed) from "" (transcribed to empty — silent recording).
  // Only transcribe when null; "" means we already spent Whisper and the result was empty.
  let transcript = source.transcript;
  if (transcript === null) {
    if (!source.stored_path) {
      throw new Error(`source ${source.id} has no stored audio file`);
    }
    writePhase(db, payload.jobId, "transcribing");
    const data = fs.readFileSync(source.stored_path);
    const filename = source.ref ?? path.basename(source.stored_path);
    const minutes = await readAudioDuration(data, filename);
    try {
      const result = await transcription.transcribe("lesson_audio", {
        data,
        filename,
        minutes,
      });
      transcript = result.text;
    } catch (err) {
      // Oversized compressed recordings (> ~24 MB per request) can't be split
      // without frame-aware demuxing (ffmpeg) — a deferred follow-up requiring a
      // system dependency we deliberately don't add here. The transcription
      // service throws a clear TranscriptionError; surface it as an actionable
      // job failure (the queue persists this message on job.error and retries
      // up to its limit) rather than let it crash the queue.
      const message = err instanceof Error ? err.message : String(err);
      logger.error("job", "lesson audio transcription failed", {
        sourceId: source.id,
        err,
      });
      throw new Error(
        `transcription failed for source ${source.id}: ${message}`,
      );
    }
    db.prepare(
      "UPDATE source SET transcript = ?, duration_minutes = ?, updated_at = ? WHERE id = ?",
    ).run(transcript, minutes, nowIso(), source.id);
  }

  // b. Analyze the transcript.
  writePhase(db, payload.jobId, "analyzing");
  const analysis = parseAnalysis(
    await llm.complete("lesson_analysis", { transcript: transcript ?? "" }),
  );

  // c. Write results (idempotent delete-and-rewrite for this source).
  writeAnalysis(db, source.id, analysis);

  writePhase(db, payload.jobId, "done");
  return {
    insights:
      analysis.flaggedWords.length +
      analysis.corrections.length +
      analysis.struggleSentences.length +
      analysis.topics.length,
    flaggedWords: analysis.flaggedWords.length,
  };
}

/**
 * Tolerate a markdown code fence / surrounding prose around the model's JSON.
 * Strip only a leading/trailing fence — never backticks elsewhere, which could
 * appear legitimately inside a JSON string value. (Mirrors the ingestion jobs.)
 */
function extractJson(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "")
    .trim();
  const start = trimmed.search(/[{[]/);
  if (start === -1)
    throw new Error(`no JSON in LLM response: ${text.slice(0, 200)}`);
  return JSON.parse(trimmed.slice(start));
}

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null;

function parseAnalysis(text: string): LessonAnalysis {
  const parsed = extractJson(text) as Record<string, unknown>;
  const arr = (v: unknown): Record<string, unknown>[] =>
    Array.isArray(v) ? (v as Record<string, unknown>[]) : [];

  const flaggedWords: ParsedFlaggedWord[] = arr(parsed.flaggedWords)
    .filter((w) => str(w.term) !== null)
    .map((w) => ({
      term: w.term as string,
      lemma: str(w.lemma),
      partOfSpeech: str(w.partOfSpeech),
      definitionEs: str(w.definitionEs),
      definitionEn: str(w.definitionEn),
      level: str(w.level),
      example: str(w.example),
    }));

  const corrections: CorrectionPayload[] = arr(parsed.corrections)
    .filter((c) => str(c.said) !== null && str(c.corrected) !== null)
    .map((c) => ({
      said: c.said as string,
      corrected: c.corrected as string,
      note: str(c.note),
    }));

  const struggleSentences: StruggleSentencePayload[] = arr(
    parsed.struggleSentences,
  )
    .filter((s) => str(s.sentence) !== null)
    .map((s) => ({ sentence: s.sentence as string, note: str(s.note) }));

  const topics: TopicCoveredPayload[] = arr(parsed.topics)
    .filter((t) => str(t.name) !== null)
    .map((t) => ({ name: t.name as string }));

  return { flaggedWords, corrections, struggleSentences, topics };
}

/**
 * Resolve a topic name the model returned back to a seeded grammar_topic id.
 * Match is normalized (lowercase + accent-strip) for robustness against trivial
 * casing/accent drift; no confident match → null (we never invent categories).
 * Mirrors pdfIngestion's matchGrammarTopic.
 */
function matchGrammarTopic(
  topics: { id: number; name: string }[],
  name: string,
): number | null {
  const needle = normalize(name).trim();
  if (needle === "") return null;
  for (const t of topics) {
    if (normalize(t.name).trim() === needle) return t.id;
  }
  return null;
}

/**
 * Persist a lesson's analysis. Delete-and-rewrite this source's prior
 * lesson_insight + extraction_item rows first, so a queue retry (or a manual
 * re-run) never accumulates duplicates. Wrapped in one transaction.
 *
 * Each flagged word becomes BOTH a pending extraction_item (so it flows into the
 * existing /triage?source=N queue, batched ~50, word_id null until a decision
 * materializes a word) AND a flagged_word lesson_insight.
 */
function writeAnalysis(
  db: DB,
  sourceId: number,
  analysis: LessonAnalysis,
): void {
  // S1 guard: never clobber triage decisions. If any extraction_item for this
  // source is already decided (non-pending), skip the destructive rewrite entirely.
  const decided = db
    .prepare(
      "SELECT 1 FROM extraction_item WHERE source_id = ? AND decision != 'pending' LIMIT 1",
    )
    .get(sourceId);
  if (decided) {
    logger.info(
      `skipping re-analysis write: source ${sourceId} already has triaged items`,
    );
    return;
  }

  const topics = listGrammarTopicsForMatching(db);
  const now = nowIso();

  const insertItem = db.prepare(
    `INSERT INTO extraction_item
       (source_id, term, lemma, part_of_speech, definition_es, definition_en,
        example, level, likely_known, batch_no, decision, word_id,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?)`,
  );

  db.transaction(() => {
    db.prepare("DELETE FROM lesson_insight WHERE source_id = ?").run(sourceId);
    db.prepare("DELETE FROM extraction_item WHERE source_id = ?").run(sourceId);

    analysis.flaggedWords.forEach((w, i) => {
      const batchNo = Math.floor(i / BATCH_SIZE) + 1;
      insertItem.run(
        sourceId,
        w.term,
        w.lemma,
        w.partOfSpeech,
        w.definitionEs,
        w.definitionEn,
        w.example,
        w.level,
        0, // likely_known = 0: flagged words are by definition unknown to the learner
        batchNo,
        now,
        now,
      );
      insertLessonInsight(db, {
        sourceId,
        type: "flagged_word",
        payload: {
          term: w.term,
          lemma: w.lemma,
          partOfSpeech: w.partOfSpeech,
          definitionEs: w.definitionEs,
          definitionEn: w.definitionEn,
        },
      });
    });

    for (const c of analysis.corrections) {
      insertLessonInsight(db, { sourceId, type: "correction", payload: c });
    }
    for (const s of analysis.struggleSentences) {
      insertLessonInsight(db, {
        sourceId,
        type: "struggle_sentence",
        payload: s,
      });
    }
    for (const t of analysis.topics) {
      insertLessonInsight(db, {
        sourceId,
        type: "topic_covered",
        payload: t,
        topicId: matchGrammarTopic(topics, t.name),
      });
    }
  })();
}
