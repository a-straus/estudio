import fs from "node:fs";
import { normalize } from "@estudio/shared";
import { nowIso, type DB } from "../db/db.js";
import { listGrammarTopicsForMatching } from "../db/grammar-queries.js";
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
): Promise<{ pages: Record<string, "done" | "failed">; total: number }> {
  const source = db
    .prepare("SELECT id, title, ref, stored_path FROM source WHERE id = ?")
    .get(payload.sourceId) as
    | {
        id: number;
        title: string | null;
        ref: string | null;
        stored_path: string | null;
      }
    | undefined;
  if (!source?.stored_path) {
    throw new Error(`source ${payload.sourceId} not found or has no file`);
  }
  const pdf = fs.readFileSync(source.stored_path);
  // Deterministic page→curriculum link: the seeded topic names are handed to the
  // page-classification LLM, which names the one each grammar page teaches; we
  // then match THAT name back to a topic id. No extra LLM call beyond the
  // classification itself.
  const topics = listGrammarTopicsForMatching(db);

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
      await processPage(db, llm, source.id, page, pdf, topics);
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
      ).run(
        JSON.stringify({ pages: progress, total: pages.length }),
        nowIso(),
        payload.jobId,
      );
    }
  }

  const failed = Object.values(progress).filter((s) => s === "failed").length;
  if (failed > 0) {
    throw new Error(`${failed} of ${pages.length} pages failed`);
  }
  return { pages: progress, total: pages.length };
}

async function processPage(
  db: DB,
  llm: LlmService,
  sourceId: number,
  page: PageRow,
  pdf: Buffer,
  topics: { id: number; name: string }[],
): Promise<void> {
  const pagePdf = await extractPagePdf(pdf, page.page_no);
  const attachments = [{ kind: "pdf" as const, data: pagePdf }];

  const { kind, topic } = parseClassification(
    await llm.vision("page_classification", attachments, {
      grammar_topics: renderTopicList(topics),
    }),
  );
  db.prepare(
    "UPDATE source_page SET kind = ?, updated_at = ? WHERE id = ?",
  ).run(kind, nowIso(), page.id);

  if (kind === "vocab") {
    // PDF sources are Spanish workbooks; the calibration lookup is scoped to
    // that language rather than hardcoded inside the query (review finding #5).
    const words = parseExtraction(
      await llm.vision("pdf_extraction", attachments, {
        calibration_sample: buildCalibrationSample(db, "es"),
      }),
    );
    insertExtractionItems(db, sourceId, words);
  } else {
    // Grammar page: the classifier was given the seeded topic list and returns
    // the matching topic's name verbatim (or null). We resolve that name back to
    // its id; left NULL when the model named no topic or its name doesn't match
    // a seeded one — never a guess, never a new LLM call.
    const topicId = topic ? matchGrammarTopic(topics, topic) : null;
    if (topicId !== null) {
      db.prepare(
        "UPDATE source_page SET grammar_topic_id = ?, updated_at = ? WHERE id = ?",
      ).run(topicId, nowIso(), page.id);
    }
  }

  db.prepare(
    "UPDATE source_page SET status = 'done', error = NULL, updated_at = ? WHERE id = ?",
  ).run(nowIso(), page.id);
}

/** The seeded topic names, one per line, handed to the classifier to choose from. */
function renderTopicList(topics: { id: number; name: string }[]): string {
  if (topics.length === 0) {
    return "(No grammar curriculum has been seeded yet — always reply with topic: null.)";
  }
  return topics.map((t) => `- ${t.name}`).join("\n");
}

/**
 * Resolve the topic name the classifier returned (copied from the seeded list)
 * back to its id. Match is normalized (lowercase + accent-strip) for robustness
 * against trivial casing/accent drift; first match by topic id wins, no match → null.
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
 * Tolerate a markdown code fence / surrounding prose around the model's JSON.
 * Strip only a leading/trailing fence — never backticks elsewhere, which could
 * appear legitimately inside a JSON string value.
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

/**
 * GOAL: every classification batch includes a sample of the owner's known and
 * mastered words so the model can calibrate `likely_known`. Up to ~20 es words
 * with status 'known' or 'mature'. Empty today (no such words yet) — renders a
 * clean fallback instruction so the prompt stays coherent.
 */
function buildCalibrationSample(db: DB, language: string): string {
  const rows = db
    .prepare(
      `SELECT term, lemma FROM word
        WHERE language = ? AND status IN ('known', 'mature')
        ORDER BY id LIMIT 20`,
    )
    .all(language) as { term: string; lemma: string | null }[];
  if (rows.length === 0) {
    return "(No known or mastered words recorded yet — estimate likely_known from typical B2 learner knowledge.)";
  }
  return rows.map((r) => r.lemma ?? r.term).join(", ");
}

/**
 * Parse the page classification. `topic` is the grammar concept the model saw
 * on a grammar page (Spanish free text), used for the deterministic page→topic
 * link. It is optional: vocab pages omit it, and older cached grammar responses
 * predate the field — both yield topic: null.
 */
function parseClassification(text: string): {
  kind: "vocab" | "grammar";
  topic: string | null;
} {
  const parsed = extractJson(text) as { kind?: unknown; topic?: unknown };
  if (parsed.kind === "vocab" || parsed.kind === "grammar") {
    const topic =
      typeof parsed.topic === "string" && parsed.topic.trim() !== ""
        ? parsed.topic
        : null;
    return { kind: parsed.kind, topic };
  }
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
 * per source. word_id stays null at ingestion: per the data-model contract it
 * is set only when a learn/know decision materializes a word row at batch
 * confirm. Confirm-time dedupe (db/triage-queries.ts) recomputes lemma matches
 * itself, so duplicates are still surfaced there — nothing is dropped here.
 */
function insertExtractionItems(
  db: DB,
  sourceId: number,
  words: CandidateWord[],
): void {
  const { c: existing } = db
    .prepare("SELECT COUNT(*) AS c FROM extraction_item WHERE source_id = ?")
    .get(sourceId) as { c: number };
  const insert = db.prepare(
    `INSERT INTO extraction_item
       (source_id, term, lemma, part_of_speech, definition_es, definition_en,
        example, level, likely_known, batch_no, decision, word_id,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?)`,
  );
  const now = nowIso();
  db.transaction(() => {
    words.forEach((w, i) => {
      const batchNo = Math.floor((existing + i) / BATCH_SIZE) + 1;
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
        now,
        now,
      );
    });
  })();
}
