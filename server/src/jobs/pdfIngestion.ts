import fs from "node:fs";
import { normalize } from "@estudio/shared";
import { nowIso, type DB } from "../db/db.js";
import { logger } from "../logger.js";
import type { LlmService } from "../llm/service.js";
import { extractPagePdf } from "../pdf/pages.js";
import type { JobQueue } from "./queue.js";

export const JOB_TYPE_PDF_INGESTION = "pdf_ingestion";

/** Extraction items are grouped for triage in batches of ~this many. */
export const BATCH_SIZE = 50;

export interface PdfIngestionPayload {
  sourceId: number;
  /** Patched in after enqueue so the handler can persist per-page progress. */
  jobId?: number;
  /** When set (page retry), only these source_page ids are processed. */
  pageIds?: number[];
}

interface PageRow {
  id: number;
  page_no: number;
  status: string;
}

interface CandidateWord {
  term: string;
  lemma: string | null;
  partOfSpeech: string | null;
  definitionEs: string | null;
  definitionEn: string | null;
  example: string | null;
  level: string | null;
  likelyKnown: number | null;
}

/**
 * Enqueue a pdf_ingestion job, then patch its own id into the payload so the
 * handler can write per-page progress JSON onto the job row mid-run.
 */
export function enqueuePdfIngestion(
  db: DB,
  queue: JobQueue,
  payload: PdfIngestionPayload,
): number {
  const jobId = queue.enqueue(JOB_TYPE_PDF_INGESTION, payload);
  db.prepare("UPDATE job SET payload = ? WHERE id = ?").run(
    JSON.stringify({ ...payload, jobId }),
    jobId,
  );
  return jobId;
}

export function registerPdfIngestionHandler(
  queue: JobQueue,
  db: DB,
  llm: LlmService,
): void {
  queue.register(JOB_TYPE_PDF_INGESTION, (payload) =>
    runPdfIngestion(db, llm, payload as PdfIngestionPayload),
  );
}

/**
 * Per page: classify vocab|grammar, then extract vocabulary candidates for
 * vocab pages. Page failures are recorded on source_page (status + error)
 * and don't stop the remaining pages; the handler throws at the end if any
 * page failed, so the queue retries — completed pages are skipped on rerun
 * (resume), and the progress JSON on the job row records per-page outcomes.
 */
export async function runPdfIngestion(
  db: DB,
  llm: LlmService,
  payload: PdfIngestionPayload,
): Promise<{ pages: Record<string, "done" | "failed"> }> {
  const source = db
    .prepare("SELECT id, stored_path FROM source WHERE id = ?")
    .get(payload.sourceId) as
    | { id: number; stored_path: string | null }
    | undefined;
  if (!source?.stored_path) {
    throw new Error(`source ${payload.sourceId} not found or has no file`);
  }
  const pdf = fs.readFileSync(source.stored_path);

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
      await processPage(db, llm, source.id, page, pdf);
      progress[page.page_no] = "done";
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      db.prepare(
        "UPDATE source_page SET status = 'failed', error = ?, updated_at = ? WHERE id = ?",
      ).run(message, nowIso(), page.id);
      logger.error("job", "pdf page ingestion failed", {
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
    throw new Error(`${failed} of ${pages.length} pages failed`);
  }
  return { pages: progress };
}

async function processPage(
  db: DB,
  llm: LlmService,
  sourceId: number,
  page: PageRow,
  pdf: Buffer,
): Promise<void> {
  const pagePdf = await extractPagePdf(pdf, page.page_no);
  const attachments = [{ kind: "pdf" as const, data: pagePdf }];

  const kind = parseClassification(
    await llm.vision("page_classification", attachments),
  );
  db.prepare(
    "UPDATE source_page SET kind = ?, updated_at = ? WHERE id = ?",
  ).run(kind, nowIso(), page.id);

  if (kind === "vocab") {
    const words = parseExtraction(
      await llm.vision("pdf_extraction", attachments),
    );
    insertExtractionItems(db, sourceId, words);
  }
  // Grammar pages keep grammar_topic_id null — curriculum linking is a later task.

  db.prepare(
    "UPDATE source_page SET status = 'done', error = NULL, updated_at = ? WHERE id = ?",
  ).run(nowIso(), page.id);
}

/** Tolerate markdown fences / surrounding prose around the model's JSON. */
function extractJson(text: string): unknown {
  const trimmed = text.replace(/```(?:json)?/g, "").trim();
  const start = trimmed.search(/[{[]/);
  if (start === -1)
    throw new Error(`no JSON in LLM response: ${text.slice(0, 200)}`);
  return JSON.parse(trimmed.slice(start));
}

function parseClassification(text: string): "vocab" | "grammar" {
  const parsed = extractJson(text) as { kind?: unknown };
  if (parsed.kind === "vocab" || parsed.kind === "grammar") return parsed.kind;
  throw new Error(`invalid page classification: ${text.slice(0, 200)}`);
}

function parseExtraction(text: string): CandidateWord[] {
  const parsed = extractJson(text) as { words?: unknown };
  if (!Array.isArray(parsed.words)) {
    throw new Error(`invalid extraction response: ${text.slice(0, 200)}`);
  }
  return parsed.words.map((w: Record<string, unknown>, i) => {
    if (typeof w.term !== "string" || w.term.trim() === "") {
      throw new Error(`extraction candidate ${i} has no term`);
    }
    const str = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);
    const likelyKnown =
      typeof w.likely_known === "number"
        ? Math.min(1, Math.max(0, w.likely_known))
        : null;
    return {
      term: w.term,
      lemma: str(w.lemma),
      partOfSpeech: str(w.part_of_speech),
      definitionEs: str(w.definition_es),
      definitionEn: str(w.definition_en),
      example: str(w.example),
      level: str(w.level),
      likelyKnown,
    };
  });
}

/**
 * Write candidates as pending extraction_item rows, batch_no grouping ~50
 * per source. Dedupe is a flag, never a drop: a normalized-lemma match
 * against existing word rows sets word_id on the candidate so triage can
 * surface "you already have this word" — decision stays pending.
 */
function insertExtractionItems(
  db: DB,
  sourceId: number,
  words: CandidateWord[],
): void {
  const { c: existing } = db
    .prepare("SELECT COUNT(*) AS c FROM extraction_item WHERE source_id = ?")
    .get(sourceId) as { c: number };
  const findWord = db.prepare(
    "SELECT id FROM word WHERE lemma_normalized = ? AND language = 'es'",
  );
  const insert = db.prepare(
    `INSERT INTO extraction_item
       (source_id, term, lemma, part_of_speech, definition_es, definition_en,
        example, level, likely_known, batch_no, decision, word_id,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
  );
  const now = nowIso();
  db.transaction(() => {
    words.forEach((w, i) => {
      const batchNo = Math.floor((existing + i) / BATCH_SIZE) + 1;
      const match = findWord.get(normalize(w.lemma ?? w.term)) as
        | { id: number }
        | undefined;
      insert.run(
        sourceId,
        w.term,
        w.lemma,
        w.partOfSpeech,
        w.definitionEs,
        w.definitionEn,
        w.example,
        w.level,
        w.likelyKnown,
        batchNo,
        match?.id ?? null,
        now,
        now,
      );
    });
  })();
}
