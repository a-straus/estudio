import type {
  SuggestionTally,
  SuggestionView,
  WordSuggestionView,
  TopicSuggestionView,
} from "@estudio/shared";
import { normalize } from "@estudio/shared";
import { nowIso, type DB } from "./db.js";
import { insertWord } from "./word-queries.js";
import { getDefaultDeckId } from "./word-queries.js";

// ---- Internal payload shapes stored in suggestion.payload (JSON) ----

export interface WordPayload {
  term: string;
  lemma: string | null;
  language: string;
  partOfSpeech: string | null;
  level: string | null;
  glossEs: string | null;
  glossEn: string | null;
  example: string | null;
  reason: string;
}

export interface TopicPayload {
  topicId: number;
  name: string;
  preview: string;
  reason: string;
}

export type SuggestionPayload = WordPayload | TopicPayload;

interface SuggestionRowDb {
  id: number;
  item_type: "word" | "grammar_topic";
  normalized_key: string;
  payload: string;
  status: "pending" | "added" | "skipped";
}

function toView(row: SuggestionRowDb): SuggestionView {
  const payload = JSON.parse(row.payload) as SuggestionPayload;
  if (row.item_type === "word") {
    const p = payload as WordPayload;
    return {
      type: "word",
      id: row.id,
      headword: p.term,
      lemma: p.lemma,
      language: p.language,
      partOfSpeech: p.partOfSpeech,
      level: p.level,
      glossEs: p.glossEs,
      glossEn: p.glossEn,
      example: p.example,
      reason: p.reason,
    } satisfies WordSuggestionView;
  }
  const p = payload as TopicPayload;
  return {
    type: "grammar_topic",
    id: row.id,
    topicId: p.topicId,
    name: p.name,
    preview: p.preview,
    reason: p.reason,
  } satisfies TopicSuggestionView;
}

/** Tally counts across all statuses. */
export function getSuggestionTally(db: DB): SuggestionTally {
  const row = db
    .prepare(
      `SELECT
         COUNT(*) AS suggested,
         SUM(CASE WHEN status = 'added' THEN 1 ELSE 0 END) AS added,
         SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped
       FROM suggestion`,
    )
    .get() as { suggested: number; added: number; skipped: number };
  return {
    suggested: row.suggested,
    added: row.added ?? 0,
    skipped: row.skipped ?? 0,
  };
}

/** The oldest pending suggestion, or null if none exists. */
export function getPendingSuggestion(db: DB): SuggestionView | null {
  const row = db
    .prepare(
      `SELECT id, item_type, normalized_key, payload, status
         FROM suggestion WHERE status = 'pending' ORDER BY id LIMIT 1`,
    )
    .get() as SuggestionRowDb | undefined;
  return row ? toView(row) : null;
}

/** A suggestion by id; null when not found. */
export function getSuggestionById(db: DB, id: number): SuggestionRowDb | null {
  return (
    (db
      .prepare(
        "SELECT id, item_type, normalized_key, payload, status FROM suggestion WHERE id = ?",
      )
      .get(id) as SuggestionRowDb | undefined) ?? null
  );
}

/**
 * All normalized keys already in the suggestion table, for passing to the LLM
 * so it avoids them.
 */
export function getAlreadySuggestedKeys(
  db: DB,
): { type: string; key: string }[] {
  const rows = db
    .prepare("SELECT item_type AS type, normalized_key AS key FROM suggestion")
    .all() as { type: string; key: string }[];
  return rows;
}

/**
 * Insert a word suggestion as 'pending'. Returns the SuggestionView on
 * success, null when the normalized_key already exists (UNIQUE violation) or
 * the word is already in the deck.
 */
export function insertWordSuggestion(
  db: DB,
  payload: WordPayload,
): SuggestionView | null {
  const normalizedKey = normalize(payload.lemma ?? payload.term);

  const exists = db
    .prepare(
      "SELECT 1 FROM suggestion WHERE item_type = 'word' AND normalized_key = ?",
    )
    .get(normalizedKey);
  if (exists) return null;

  // Don't suggest a word already in the deck — check both lemma and surface term
  // because lemma_normalized is nullable (words inserted without a lemma have it NULL).
  const lemmaKey = normalize(payload.lemma ?? payload.term);
  const termKey = normalize(payload.term);
  const inDeck = db
    .prepare(
      "SELECT 1 FROM word WHERE (lemma_normalized = ? OR term_normalized = ?) AND language = ?",
    )
    .get(lemmaKey, termKey, payload.language ?? "es");
  if (inDeck) return null;

  const now = nowIso();
  const result = db
    .prepare(
      `INSERT INTO suggestion (item_type, normalized_key, payload, status, created_at, updated_at)
       VALUES ('word', ?, ?, 'pending', ?, ?)`,
    )
    .run(normalizedKey, JSON.stringify(payload), now, now);
  const id = Number(result.lastInsertRowid);
  return {
    type: "word",
    id,
    headword: payload.term,
    lemma: payload.lemma,
    language: payload.language,
    partOfSpeech: payload.partOfSpeech,
    level: payload.level,
    glossEs: payload.glossEs,
    glossEn: payload.glossEn,
    example: payload.example,
    reason: payload.reason,
  } satisfies WordSuggestionView;
}

/**
 * Insert a grammar-topic suggestion as 'pending'. Returns null when the topic
 * was already suggested or the topicId doesn't exist in grammar_topic.
 */
export function insertTopicSuggestion(
  db: DB,
  payload: TopicPayload,
): SuggestionView | null {
  const topicRow = db
    .prepare("SELECT name FROM grammar_topic WHERE id = ?")
    .get(payload.topicId) as { name: string } | undefined;
  if (!topicRow) return null;

  const normalizedKey = normalize(topicRow.name);

  const exists = db
    .prepare(
      "SELECT 1 FROM suggestion WHERE item_type = 'grammar_topic' AND normalized_key = ?",
    )
    .get(normalizedKey);
  if (exists) return null;

  const now = nowIso();
  const result = db
    .prepare(
      `INSERT INTO suggestion (item_type, normalized_key, payload, status, created_at, updated_at)
       VALUES ('grammar_topic', ?, ?, 'pending', ?, ?)`,
    )
    .run(normalizedKey, JSON.stringify(payload), now, now);
  const id = Number(result.lastInsertRowid);
  return {
    type: "grammar_topic",
    id,
    topicId: payload.topicId,
    name: payload.name,
    preview: payload.preview,
    reason: payload.reason,
  } satisfies TopicSuggestionView;
}

/** Mark an existing suggestion as 'added' or 'skipped'. */
export function updateSuggestionStatus(
  db: DB,
  id: number,
  status: "added" | "skipped",
): void {
  db.prepare(
    "UPDATE suggestion SET status = ?, updated_at = ? WHERE id = ?",
  ).run(status, nowIso(), id);
}

/**
 * When a word suggestion is added, create a source row (type='suggestion') and
 * insert the word into the Spanish deck with status='new'. Returns the new
 * word id.
 */
export function addWordToDeck(db: DB, payload: WordPayload): number {
  // Defense-in-depth: return existing word id without duplicating if already in deck.
  const lemmaKey = normalize(payload.lemma ?? payload.term);
  const termKey = normalize(payload.term);
  const existing = db
    .prepare(
      "SELECT id FROM word WHERE (lemma_normalized = ? OR term_normalized = ?) AND language = ?",
    )
    .get(lemmaKey, termKey, "es") as { id: number } | undefined;
  if (existing) return existing.id;

  const deckId = getDefaultDeckId(db, "es") ?? 1;
  const now = nowIso();

  const sourceResult = db
    .prepare(
      `INSERT INTO source (type, title, language, created_at, updated_at)
       VALUES ('suggestion', ?, 'es', ?, ?)`,
    )
    .run(payload.term, now, now);
  const sourceId = Number(sourceResult.lastInsertRowid);

  return insertWord(db, {
    term: payload.term,
    language: "es",
    lemma: payload.lemma,
    partOfSpeech: payload.partOfSpeech,
    definitionEs: payload.glossEs,
    definitionEn: payload.glossEn,
    example: payload.example,
    level: payload.level,
    status: "new",
    deckId,
    definitionOrigin: "llm",
    promptVersion: null,
  });
}

/**
 * Calibration signal for the LLM prompt: what the learner knows and what's
 * available to suggest.
 */
export interface CalibrationSignal {
  deckWordCount: number;
  deckWords: string[];
  grammarTopics: { id: number; name: string; mastery: number }[];
}

export function gatherCalibrationSignal(db: DB): CalibrationSignal {
  const rows = db
    .prepare(
      "SELECT term_normalized FROM word WHERE language = 'es' AND status IN ('known','mature') ORDER BY created_at DESC LIMIT 120",
    )
    .all() as { term_normalized: string }[];
  const deckWordCount = (
    db
      .prepare("SELECT COUNT(*) AS c FROM word WHERE language = 'es'")
      .get() as { c: number }
  ).c;

  const topics = db
    .prepare(
      "SELECT id, name, mastery FROM grammar_topic ORDER BY mastery ASC, id ASC",
    )
    .all() as { id: number; name: string; mastery: number }[];

  return {
    deckWordCount,
    deckWords: rows.map((r) => r.term_normalized),
    grammarTopics: topics,
  };
}
