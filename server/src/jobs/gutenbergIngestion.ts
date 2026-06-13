import { nowIso, type DB } from "../db/db.js";
import { logger } from "../logger.js";
import { modelPricing } from "../llm/anthropic.js";
import type { LlmService } from "../llm/service.js";
import type { JobQueue } from "./queue.js";
import {
  buildCalibrationSample,
  insertExtractionItems,
  parseExtraction,
} from "./textIngestion.js";
import { prepassCandidates } from "./gutenbergPrepass.js";

export const JOB_TYPE_GUTENBERG_INGESTION = "gutenberg_ingestion";

/**
 * How many pre-pass candidate words ride in one LLM classification call (and so
 * one source_page chunk). Independent of the ~50 triage BATCH_SIZE: the LLM
 * call batches candidates for cost, the triage batches group the words it keeps.
 */
export const CANDIDATES_PER_BATCH = 200;

// Per-batch token model for the upfront cost estimate. Calibrated to a full
// King James Bible run (9034 candidates, 46 batches: real tokensIn 79267,
// real tokensOut 280611, real cost $7.41 on opus). Values intentionally err
// high so the owner's >$5 confirm gate (GOAL §13) fires reliably.
const PROMPT_OVERHEAD_TOKENS = 1000; // rubric + calibration, per call
const TOKENS_PER_CANDIDATE_IN = 4; // a word + its line in the list
const TOKENS_PER_CANDIDATE_OUT = 34; // amortized output across kept/dropped words

export interface GutenbergIngestionPayload {
  sourceId: number;
  /** Patched in after enqueue so the handler can persist per-chunk progress. */
  jobId?: number;
  /** When set (chunk retry), only these source_page ids are processed. */
  pageIds?: number[];
}

interface PageRow {
  id: number;
  page_no: number;
  status: string;
}

/**
 * The candidate-word chunks for a book, one per LLM classification call. A PURE
 * function of the stored (boilerplate-stripped) text — the job re-derives the
 * same ordered chunks on every run, so resume is deterministic and no per-chunk
 * text is persisted (mirrors textIngestion.chunkText).
 */
export function gutenbergChunks(text: string): string[] {
  const candidates = prepassCandidates(text);
  const chunks: string[] = [];
  for (let i = 0; i < candidates.length; i += CANDIDATES_PER_BATCH) {
    chunks.push(candidates.slice(i, i + CANDIDATES_PER_BATCH).join("\n"));
  }
  return chunks;
}

/** Unique candidate-word count left after the pre-pass — used by the estimate. */
export function gutenbergWordCount(text: string): number {
  return prepassCandidates(text).length;
}

/** How many source_page rows (= LLM calls) the book produces. */
export function gutenbergChunkCount(text: string): number {
  return Math.ceil(gutenbergWordCount(text) / CANDIDATES_PER_BATCH);
}

/**
 * Upfront USD cost estimate for classifying `wordCount` candidate words with
 * `model`, reusing the same pricing table that costs real llm_call rows.
 * Unknown models cost nothing estimable → 0 (caller surfaces it honestly).
 */
export function estimateGutenbergCostUsd(
  wordCount: number,
  model: string,
): number {
  const price = modelPricing(model);
  if (!price || wordCount === 0) return 0;
  const batches = Math.ceil(wordCount / CANDIDATES_PER_BATCH);
  const tokensIn =
    batches * PROMPT_OVERHEAD_TOKENS + wordCount * TOKENS_PER_CANDIDATE_IN;
  const tokensOut = wordCount * TOKENS_PER_CANDIDATE_OUT;
  return (tokensIn * price.input + tokensOut * price.output) / 1e6;
}

/**
 * Enqueue a gutenberg_ingestion job, then patch its own id into the payload so
 * the handler can write per-chunk progress JSON onto the job row mid-run.
 */
export function enqueueGutenbergIngestion(
  db: DB,
  queue: JobQueue,
  payload: GutenbergIngestionPayload,
): number {
  const jobId = queue.enqueue(JOB_TYPE_GUTENBERG_INGESTION, payload);
  db.prepare("UPDATE job SET payload = ? WHERE id = ?").run(
    JSON.stringify({ ...payload, jobId }),
    jobId,
  );
  return jobId;
}

/**
 * Per chunk: send a batch of pre-pass candidate words to the archaic-aware
 * English extraction prompt and write the words it keeps as pending
 * extraction_item rows. Mirrors runTextIngestion exactly — chunk failures are
 * recorded on source_page and don't stop the other chunks; the handler throws
 * at the end if any failed so the queue retries, and done chunks are skipped on
 * rerun (resume). The candidate batches are re-derived from source.transcript.
 */
export async function runGutenbergIngestion(
  db: DB,
  llm: LlmService,
  payload: GutenbergIngestionPayload,
): Promise<{ pages: Record<string, "done" | "failed"> }> {
  const source = db
    .prepare("SELECT id, transcript FROM source WHERE id = ?")
    .get(payload.sourceId) as
    | { id: number; transcript: string | null }
    | undefined;
  if (!source?.transcript) {
    throw new Error(`source ${payload.sourceId} not found or has no text`);
  }
  const chunks = gutenbergChunks(source.transcript);

  let pages = db
    .prepare(
      "SELECT id, page_no, status FROM source_page WHERE source_id = ? ORDER BY page_no",
    )
    .all(payload.sourceId) as PageRow[];
  if (payload.pageIds) {
    pages = pages.filter((p) => payload.pageIds!.includes(p.id));
  }

  const progress: Record<string, "done" | "failed"> = {};
  for (const page of pages) {
    if (page.status === "done") {
      progress[page.page_no] = "done"; // resume: already completed on a prior attempt
      continue;
    }
    try {
      const chunk = chunks[page.page_no - 1] ?? "";
      await processChunk(db, llm, source.id, page, chunk);
      progress[page.page_no] = "done";
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      db.prepare(
        "UPDATE source_page SET status = 'failed', error = ?, updated_at = ? WHERE id = ?",
      ).run(message, nowIso(), page.id);
      logger.error("job", "gutenberg chunk ingestion failed", {
        sourceId: source.id,
        pageNo: page.page_no,
        err,
      });
      progress[page.page_no] = "failed";
    }
    if (payload.jobId !== undefined) {
      db.prepare(
        "UPDATE job SET progress = ?, updated_at = ? WHERE id = ?",
      ).run(JSON.stringify({ pages: progress }), nowIso(), payload.jobId);
    }
  }

  const failed = Object.values(progress).filter((s) => s === "failed").length;
  if (failed > 0) {
    throw new Error(`${failed} of ${pages.length} chunks failed`);
  }
  return { pages: progress };
}

async function processChunk(
  db: DB,
  llm: LlmService,
  sourceId: number,
  page: PageRow,
  chunk: string,
): Promise<void> {
  // Gutenberg books are English. The candidate-word list fills {{chunk_text}};
  // the calibration sample is the owner's known/mastered English words.
  const words = parseExtraction(
    await llm.vision("gutenberg_extraction", [], {
      language: "en",
      chunk_text: chunk,
      calibration_sample: buildCalibrationSample(db, "en"),
    }),
  );
  insertExtractionItems(db, sourceId, words);

  db.prepare(
    "UPDATE source_page SET kind = 'vocab', status = 'done', error = NULL, updated_at = ? WHERE id = ?",
  ).run(nowIso(), page.id);
}
