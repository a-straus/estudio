// SQL for the word library: list/search, detail (provenance + card_state +
// recent reviews), and CRUD writes. snake_case → camelCase mapping happens
// here. Owned by the library-ui task; keep non-library queries out of it.

import {
  normalize,
  type CardStateSummary,
  type ReviewLogEntry,
  type WordDetailResponse,
  type WordLanguage,
  type WordListItem,
  type WordListQuery,
  type WordStatus,
} from "@estudio/shared";
import { nowIso, type DB } from "./db.js";

const LIST_COLS =
  "id, term, lemma, language, part_of_speech, definition_es, definition_en, example, level, status, deck_id, source_id";

interface WordRowDb {
  id: number;
  term: string;
  lemma: string | null;
  language: WordLanguage;
  part_of_speech: string | null;
  definition_es: string | null;
  definition_en: string | null;
  example: string | null;
  level: string | null;
  status: WordStatus;
  deck_id: number;
  source_id: number | null;
}

function toListItem(r: WordRowDb): WordListItem {
  return {
    id: r.id,
    term: r.term,
    lemma: r.lemma,
    language: r.language,
    partOfSpeech: r.part_of_speech,
    definitionEs: r.definition_es,
    definitionEn: r.definition_en,
    example: r.example,
    level: r.level,
    status: r.status,
    deckId: r.deck_id,
    sourceId: r.source_id,
  };
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Build the shared WHERE clause + bound params for list and count. Search is
 * accent-insensitive: the query is normalized (lowercase + accent-strip) and
 * matched against the term_normalized / lemma_normalized indexed columns, so
 * searching "mas" finds "más".
 */
function buildFilter(query: WordListQuery): {
  where: string;
  params: (string | number)[];
} {
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  if (query.q && query.q.trim() !== "") {
    const needle = `%${normalize(query.q.trim())}%`;
    clauses.push("(term_normalized LIKE ? OR lemma_normalized LIKE ?)");
    params.push(needle, needle);
  }
  if (query.status) {
    clauses.push("status = ?");
    params.push(query.status);
  }
  if (query.partOfSpeech) {
    clauses.push("part_of_speech = ?");
    params.push(query.partOfSpeech);
  }
  if (query.deckId !== undefined) {
    clauses.push("deck_id = ?");
    params.push(query.deckId);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  return { where, params };
}

export function listWords(
  db: DB,
  query: WordListQuery,
): { items: WordListItem[]; total: number; limit: number; offset: number } {
  const { where, params } = buildFilter(query);
  const orderBy =
    query.sort === "alpha"
      ? "ORDER BY term_normalized ASC, id ASC"
      : "ORDER BY created_at DESC, id DESC";

  const limit = Math.min(Math.max(1, query.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const offset = Math.max(0, query.offset ?? 0);

  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM word ${where}`).get(...params) as {
      c: number;
    }
  ).c;

  const rows = db
    .prepare(
      `SELECT ${LIST_COLS} FROM word ${where} ${orderBy} LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as WordRowDb[];

  return { items: rows.map(toListItem), total, limit, offset };
}

export function wordExistsById(db: DB, id: number): boolean {
  return db.prepare("SELECT 1 FROM word WHERE id = ?").get(id) !== undefined;
}

/** UNIQUE(term, language) guard for manual add — exact match, accents kept. */
export function wordExistsByTermLanguage(
  db: DB,
  term: string,
  language: WordLanguage,
): boolean {
  return (
    db
      .prepare("SELECT 1 FROM word WHERE term = ? AND language = ?")
      .get(term, language) !== undefined
  );
}

/** Lowest-id deck for a language — the manual-add default when none is given. */
export function getDefaultDeckId(
  db: DB,
  language: WordLanguage,
): number | null {
  const row = db
    .prepare("SELECT id FROM deck WHERE language = ? ORDER BY id LIMIT 1")
    .get(language) as { id: number } | undefined;
  return row?.id ?? null;
}

export function deckExists(db: DB, deckId: number): boolean {
  return (
    db.prepare("SELECT 1 FROM deck WHERE id = ?").get(deckId) !== undefined
  );
}

export interface InsertWordFields {
  term: string;
  language: WordLanguage;
  lemma: string | null;
  partOfSpeech: string | null;
  definitionEs: string | null;
  definitionEn: string | null;
  example: string | null;
  level: string | null;
  status: WordStatus;
  deckId: number;
  definitionOrigin: "llm" | "owner";
  promptVersion: string | null;
}

export function insertWord(db: DB, f: InsertWordFields): number {
  const now = nowIso();
  const result = db
    .prepare(
      `INSERT INTO word
         (term, term_normalized, lemma, lemma_normalized, language,
          part_of_speech, definition_es, definition_en, example, level,
          status, deck_id, definition_origin, prompt_version,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      f.term,
      normalize(f.term),
      f.lemma,
      f.lemma ? normalize(f.lemma) : null,
      f.language,
      f.partOfSpeech,
      f.definitionEs,
      f.definitionEn,
      f.example,
      f.level,
      f.status,
      f.deckId,
      f.definitionOrigin,
      f.promptVersion,
      now,
      now,
    );
  return Number(result.lastInsertRowid);
}

export interface UpdateWordFields {
  lemma?: string | null;
  partOfSpeech?: string | null;
  definitionEs?: string | null;
  definitionEn?: string | null;
  example?: string | null;
  level?: string | null;
  status?: WordStatus;
}

/** Definition-field edits flip definition_origin to 'owner' + stamp owner_edited_at. */
const DEFINITION_FIELDS = ["definitionEs", "definitionEn", "example"] as const;

export function updateWord(db: DB, id: number, fields: UpdateWordFields): void {
  const sets: string[] = [];
  const params: (string | number | null)[] = [];

  const col: Record<keyof UpdateWordFields, string> = {
    lemma: "lemma",
    partOfSpeech: "part_of_speech",
    definitionEs: "definition_es",
    definitionEn: "definition_en",
    example: "example",
    level: "level",
    status: "status",
  };

  for (const key of Object.keys(fields) as (keyof UpdateWordFields)[]) {
    const value = fields[key];
    if (value === undefined) continue;
    sets.push(`${col[key]} = ?`);
    params.push(value);
    if (key === "lemma") {
      sets.push("lemma_normalized = ?");
      params.push(value ? normalize(value) : null);
    }
  }

  const touchesDefinition = DEFINITION_FIELDS.some(
    (k) => fields[k] !== undefined,
  );
  if (touchesDefinition) {
    sets.push("definition_origin = 'owner'");
    sets.push("owner_edited_at = ?");
    params.push(nowIso());
  }

  sets.push("updated_at = ?");
  params.push(nowIso());

  db.prepare(`UPDATE word SET ${sets.join(", ")} WHERE id = ?`).run(
    ...params,
    id,
  );
}

export function deleteWord(db: DB, id: number): void {
  db.prepare("DELETE FROM word WHERE id = ?").run(id);
}

interface WordDetailRowDb extends WordRowDb {
  definition_origin: "llm" | "owner";
  owner_edited_at: string | null;
  prompt_version: string | null;
  created_at: string;
  updated_at: string;
  source_title: string | null;
}

const RECENT_REVIEWS_LIMIT = 20;

export function getWordDetail(db: DB, id: number): WordDetailResponse | null {
  const qualifiedCols = LIST_COLS.split(", ")
    .map((c) => `w.${c}`)
    .join(", ");
  const row = db
    .prepare(
      `SELECT ${qualifiedCols}, w.definition_origin, w.owner_edited_at,
              w.prompt_version, w.created_at, w.updated_at, s.title AS source_title
       FROM word w
       LEFT JOIN source s ON s.id = w.source_id
       WHERE w.id = ?`,
    )
    .get(id) as WordDetailRowDb | undefined;
  if (!row) return null;

  const cardRow = db
    .prepare(
      "SELECT ease, interval_days, due_at, reps FROM card_state WHERE word_id = ?",
    )
    .get(id) as
    | { ease: number; interval_days: number; due_at: string; reps: number }
    | undefined;
  const cardState: CardStateSummary | null = cardRow
    ? {
        ease: cardRow.ease,
        intervalDays: cardRow.interval_days,
        dueAt: cardRow.due_at,
        reps: cardRow.reps,
      }
    : null;

  const logRows = db
    .prepare(
      `SELECT id, ts, direction, grade, ease_after, interval_after, origin
       FROM review_log WHERE word_id = ? ORDER BY ts DESC, id DESC LIMIT ?`,
    )
    .all(id, RECENT_REVIEWS_LIMIT) as {
    id: number;
    ts: string;
    direction: ReviewLogEntry["direction"];
    grade: ReviewLogEntry["grade"];
    ease_after: number;
    interval_after: number;
    origin: ReviewLogEntry["origin"];
  }[];
  const recentReviews: ReviewLogEntry[] = logRows.map((r) => ({
    id: r.id,
    ts: r.ts,
    direction: r.direction,
    grade: r.grade,
    easeAfter: r.ease_after,
    intervalAfter: r.interval_after,
    origin: r.origin,
  }));

  return {
    ...toListItem(row),
    definitionOrigin: row.definition_origin,
    ownerEditedAt: row.owner_edited_at,
    promptVersion: row.prompt_version,
    sourceTitle: row.source_title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cardState,
    recentReviews,
  };
}
