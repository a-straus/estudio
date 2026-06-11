import type { Language } from "@estudio/shared";
import { nowIso, type DB } from "../db/db.js";
import { logger } from "../logger.js";
import type { LlmService } from "../llm/service.js";
import type { JobQueue } from "./queue.js";

export const JOB_TYPE_TEXT_INGESTION = "text_ingestion";

/** Extraction items are grouped for triage in batches of ~this many. */
export const BATCH_SIZE = 50;

/**
 * Chunk targets. The paste is split on paragraph boundaries into chunks no
 * larger than ~CHUNK_MAX chars; a single paragraph longer than CHUNK_MAX is
 * hard-split. Chunking is a PURE function of the stored transcript so the job
 * can re-derive each chunk's text from its source_page (page_no) on every run,
 * including resume — no per-chunk text is persisted.
 */
const CHUNK_TARGET = 3000;
const CHUNK_MAX = 4000;

export interface TextIngestionPayload {
  sourceId: number;
  /** Resolved at enqueue time (request value or auto-detected); carried so the
   *  job is deterministic on resume — there is no language column on `source`. */
  language: Language;
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
 * Cheap, dependency-free language auto-detect used when the request omits
 * `language`. Spanish-only orthography (ñ, ¿, ¡, accented vowels) is a strong
 * signal; otherwise we compare counts of common Spanish vs English stopwords.
 * Ties resolve to Spanish — this is a Spanish-learning app, so es is the
 * sensible default and the heuristic only needs to catch clearly-English pastes.
 */
export function detectLanguage(text: string): Language {
  if (/[ñ¿¡áéíóú]/i.test(text)) return "es";
  const lower = text.toLowerCase();
  const es = (
    lower.match(
      /\b(el|la|los|las|de|que|y|en|un|una|por|con|para|es|no|se|su|lo|como|pero|más)\b/g,
    ) ?? []
  ).length;
  const en = (
    lower.match(
      /\b(the|of|and|to|in|a|is|that|it|for|on|with|as|was|are|be|this|have|but|not)\b/g,
    ) ?? []
  ).length;
  return en > es ? "en" : "es";
}

/** Split pasted text into page-sized chunks on paragraph boundaries. */
export function chunkText(text: string): string[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const para of paragraphs) {
    if (para.length > CHUNK_MAX) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      for (let i = 0; i < para.length; i += CHUNK_MAX) {
        chunks.push(para.slice(i, i + CHUNK_MAX));
      }
      continue;
    }
    if (current && current.length + para.length + 2 > CHUNK_TARGET) {
      chunks.push(current);
      current = "";
    }
    current = current ? `${current}\n\n${para}` : para;
  }
  if (current) chunks.push(current);
  // A non-empty paste with no paragraph breaks shorter than a chunk still gets
  // one chunk; the route guarantees the text is non-empty.
  return chunks.length > 0 ? chunks : [text.trim()];
}

/** How many source_page rows a paste produces — used by the route. */
export function chunkCount(text: string): number {
  return chunkText(text).length;
}

/**
 * Enqueue a text_ingestion job, then patch its own id into the payload so the
 * handler can write per-chunk progress JSON onto the job row mid-run.
 */
export function enqueueTextIngestion(
  db: DB,
  queue: JobQueue,
  payload: TextIngestionPayload,
): number {
  const jobId = queue.enqueue(JOB_TYPE_TEXT_INGESTION, payload);
  db.prepare("UPDATE job SET payload = ? WHERE id = ?").run(
    JSON.stringify({ ...payload, jobId }),
    jobId,
  );
  return jobId;
}

/**
 * Per chunk: extract vocabulary candidates and write them as pending
 * extraction_item rows. Chunk failures are recorded on source_page (status +
 * error) and don't stop the remaining chunks; the handler throws at the end if
 * any chunk failed, so the queue retries — completed chunks are skipped on
 * rerun (resume), and the progress JSON on the job row records per-chunk
 * outcomes. Mirrors jobs/pdfIngestion.ts; text has no classify step (every
 * chunk is vocab).
 */
export async function runTextIngestion(
  db: DB,
  llm: LlmService,
  payload: TextIngestionPayload,
): Promise<{ pages: Record<string, "done" | "failed"> }> {
  const source = db
    .prepare("SELECT id, transcript FROM source WHERE id = ?")
    .get(payload.sourceId) as
    | { id: number; transcript: string | null }
    | undefined;
  if (!source?.transcript) {
    throw new Error(`source ${payload.sourceId} not found or has no text`);
  }
  const chunks = chunkText(source.transcript);

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
      await processChunk(db, llm, source.id, page, chunk, payload.language);
      progress[page.page_no] = "done";
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      db.prepare(
        "UPDATE source_page SET status = 'failed', error = ?, updated_at = ? WHERE id = ?",
      ).run(message, nowIso(), page.id);
      logger.error("job", "text chunk ingestion failed", {
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
  language: Language,
): Promise<void> {
  // text_extraction is a pure-text task, but LlmService.complete() takes no
  // substitutions — vision() is the substitution-capable entry point, so we
  // call it with an empty attachments array (a text-only prompt). The chunk
  // text and calibration sample fill the prompt's {{placeholders}}.
  const words = parseExtraction(
    await llm.vision("text_extraction", [], {
      language,
      chunk_text: chunk,
      calibration_sample: buildCalibrationSample(db, language),
    }),
  );
  insertExtractionItems(db, sourceId, words);

  db.prepare(
    "UPDATE source_page SET kind = 'vocab', status = 'done', error = NULL, updated_at = ? WHERE id = ?",
  ).run(nowIso(), page.id);
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
 * Sample of the owner's known and mastered words in the source's language, so
 * the model can calibrate `likely_known`. Up to ~20 words with status 'known'
 * or 'mature'. Empty renders a clean fallback instruction.
 */
function buildCalibrationSample(db: DB, language: Language): string {
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
 * Write candidates as pending extraction_item rows, batch_no grouping ~50 per
 * source. word_id stays null at ingestion: per the data-model contract it is
 * set only when a learn/know decision materializes a word row at triage confirm.
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
