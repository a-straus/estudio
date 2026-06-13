import type {
  JobStatus,
  JobView,
  LessonInsightType,
  SourceCoverage,
  SourcePageKind,
  SourcePageStatus,
  SourcePageView,
  SourceType,
  SourceView,
} from "@estudio/shared";
import { nowIso, type DB } from "./db.js";

// snake_case → camelCase mapping happens here, at the query layer.

interface JobRowDb {
  id: number;
  type: string;
  payload: string;
  status: JobStatus;
  progress: string | null;
  error: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
}

export function listJobs(db: DB): JobView[] {
  const rows = db
    .prepare(
      "SELECT id, type, payload, status, progress, error, attempts, created_at, updated_at FROM job ORDER BY id DESC",
    )
    .all() as JobRowDb[];
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    payload: JSON.parse(r.payload),
    status: r.status,
    progress: r.progress === null ? null : JSON.parse(r.progress),
    error: r.error,
    attempts: r.attempts,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

interface SourceRowDb {
  id: number;
  type: SourceType;
  title: string | null;
  ref: string | null;
  stored_path: string | null;
  transcript: string | null;
  created_at: string;
  updated_at: string;
}

interface SourcePageRowDb {
  id: number;
  source_id: number;
  page_no: number;
  kind: SourcePageKind;
  status: SourcePageStatus;
  error: string | null;
  grammar_topic_id: number | null;
  created_at: string;
  updated_at: string;
}

function toSourceView(r: SourceRowDb): SourceView {
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    ref: r.ref,
    storedPath: r.stored_path,
    transcript: r.transcript,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toSourcePageView(r: SourcePageRowDb): SourcePageView {
  return {
    id: r.id,
    sourceId: r.source_id,
    pageNo: r.page_no,
    kind: r.kind,
    status: r.status,
    error: r.error,
    grammarTopicId: r.grammar_topic_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function insertSource(
  db: DB,
  source: {
    type: SourceType;
    title: string;
    ref: string;
    storedPath: string;
    language: "es" | "en";
  },
): number {
  const now = nowIso();
  const result = db
    .prepare(
      "INSERT INTO source (type, title, ref, stored_path, language, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      source.type,
      source.title,
      source.ref,
      source.storedPath,
      source.language,
      now,
      now,
    );
  return Number(result.lastInsertRowid);
}

export function getSource(db: DB, id: number): SourceView | null {
  const row = db
    .prepare(
      "SELECT id, type, title, ref, stored_path, transcript, created_at, updated_at FROM source WHERE id = ?",
    )
    .get(id) as SourceRowDb | undefined;
  return row ? toSourceView(row) : null;
}

/**
 * One pending row per page. `kind` is NOT NULL in the schema but only known
 * after classification — 'vocab' is the placeholder until the ingestion job
 * sets the real value.
 */
export function insertSourcePages(
  db: DB,
  sourceId: number,
  pageCount: number,
): void {
  const now = nowIso();
  const insert = db.prepare(
    "INSERT INTO source_page (source_id, page_no, kind, status, created_at, updated_at) VALUES (?, ?, 'vocab', 'pending', ?, ?)",
  );
  for (let pageNo = 1; pageNo <= pageCount; pageNo++) {
    insert.run(sourceId, pageNo, now, now);
  }
}

export function listSourcePages(db: DB, sourceId: number): SourcePageView[] {
  const rows = db
    .prepare(
      "SELECT id, source_id, page_no, kind, status, error, grammar_topic_id, created_at, updated_at FROM source_page WHERE source_id = ? ORDER BY page_no",
    )
    .all(sourceId) as SourcePageRowDb[];
  return rows.map(toSourcePageView);
}

export function getSourcePage(db: DB, id: number): SourcePageView | null {
  const row = db
    .prepare(
      "SELECT id, source_id, page_no, kind, status, error, grammar_topic_id, created_at, updated_at FROM source_page WHERE id = ?",
    )
    .get(id) as SourcePageRowDb | undefined;
  return row ? toSourcePageView(row) : null;
}

/**
 * Triage coverage for a source: how many candidates were sorted, how many were
 * kept ('learn' decisions materialized into a word row), and how many of those
 * kept words are still untested — materialized but with no review history yet
 * (no card_state row and no review_log row). Powers the coverage indicator.
 */
export function getSourceCoverage(db: DB, sourceId: number): SourceCoverage {
  const totals = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN decision != 'pending' THEN 1 ELSE 0 END) AS triaged,
         SUM(CASE WHEN decision = 'learn' AND word_id IS NOT NULL THEN 1 ELSE 0 END) AS kept
       FROM extraction_item WHERE source_id = ?`,
    )
    .get(sourceId) as {
    total: number;
    triaged: number | null;
    kept: number | null;
  };
  const { untested } = db
    .prepare(
      `SELECT COUNT(*) AS untested
         FROM extraction_item ei
         JOIN word w ON w.id = ei.word_id
        WHERE ei.source_id = ?
          AND ei.decision = 'learn'
          AND ei.word_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM card_state cs WHERE cs.word_id = w.id)
          AND NOT EXISTS (SELECT 1 FROM review_log rl WHERE rl.word_id = w.id)`,
    )
    .get(sourceId) as { untested: number };
  return {
    total: totals.total,
    triaged: totals.triaged ?? 0,
    kept: totals.kept ?? 0,
    untested,
  };
}

/**
 * Insert one lesson_insight row. payload is JSON-serialized here; its shape is
 * the per-type DTO in @estudio/shared (FlaggedWordPayload, CorrectionPayload,
 * …). word_id/topic_id default null — only topic_covered carries a topic link.
 */
export function insertLessonInsight(
  db: DB,
  insight: {
    sourceId: number;
    type: LessonInsightType;
    payload: unknown;
    wordId?: number | null;
    topicId?: number | null;
  },
): number {
  const now = nowIso();
  const result = db
    .prepare(
      `INSERT INTO lesson_insight
         (source_id, type, payload, word_id, topic_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      insight.sourceId,
      insight.type,
      JSON.stringify(insight.payload),
      insight.wordId ?? null,
      insight.topicId ?? null,
      now,
      now,
    );
  return Number(result.lastInsertRowid);
}
