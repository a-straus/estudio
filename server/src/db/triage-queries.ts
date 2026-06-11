import {
  MAY_KNOW_THRESHOLD,
  normalize,
  type ConfirmResponse,
  type DedupeHit,
  type ExtractionItemView,
  type TriageDecision,
  type TriageGroup,
  type TriageTally,
} from "@estudio/shared";
import { nowIso, type DB } from "./db.js";

// snake_case → camelCase mapping lives here, at the query layer. SQL for the
// triage flow is isolated in this file so it never collides with queries.ts.

// Extraction candidates are Spanish vocabulary: the ingestion pipeline emits
// es candidates and dedupes against es words (see jobs/pdfIngestion.ts).
const LANGUAGE = "es";

interface ExtractionItemRowDb {
  id: number;
  source_id: number;
  term: string;
  lemma: string | null;
  part_of_speech: string | null;
  definition_es: string | null;
  definition_en: string | null;
  example: string | null;
  level: string | null;
  likely_known: number | null;
  batch_no: number | null;
  decision: TriageDecision;
  decided_at: string | null;
  word_id: number | null;
  created_at: string;
  updated_at: string;
}

function toView(r: ExtractionItemRowDb): ExtractionItemView {
  return {
    id: r.id,
    sourceId: r.source_id,
    term: r.term,
    lemma: r.lemma,
    partOfSpeech: r.part_of_speech,
    definitionEs: r.definition_es,
    definitionEn: r.definition_en,
    example: r.example,
    level: r.level,
    likelyKnown: r.likely_known,
    batchNo: r.batch_no,
    decision: r.decision,
    decidedAt: r.decided_at,
    wordId: r.word_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const SELECT_COLS =
  "id, source_id, term, lemma, part_of_speech, definition_es, definition_en, example, level, likely_known, batch_no, decision, decided_at, word_id, created_at, updated_at";

/** Lemma key used for dedupe — mirrors the ingestion-time CHECK. */
function lemmaKey(item: { lemma: string | null; term: string }): string {
  return normalize(item.lemma ?? item.term);
}

/** True when a candidate belongs to the named likely-known group. */
function inGroup(likelyKnown: number | null, group: TriageGroup): boolean {
  const mayKnow = likelyKnown !== null && likelyKnown >= MAY_KNOW_THRESHOLD;
  return group === "may_know" ? mayKnow : !mayKnow;
}

export function getExtractionItem(
  db: DB,
  id: number,
): ExtractionItemView | null {
  const row = db
    .prepare(`SELECT ${SELECT_COLS} FROM extraction_item WHERE id = ?`)
    .get(id) as ExtractionItemRowDb | undefined;
  return row ? toView(row) : null;
}

function listBatchItems(
  db: DB,
  sourceId: number,
  batchNo: number,
): ExtractionItemView[] {
  const rows = db
    .prepare(
      `SELECT ${SELECT_COLS} FROM extraction_item WHERE source_id = ? AND batch_no = ? ORDER BY id`,
    )
    .all(sourceId, batchNo) as ExtractionItemRowDb[];
  return rows.map(toView);
}

function tallyOf(items: ExtractionItemView[]): TriageTally {
  const tally: TriageTally = { know: 0, learn: 0, skip: 0, pending: 0 };
  for (const it of items) tally[it.decision] += 1;
  return tally;
}

export interface BatchData {
  batchNo: number;
  batchCount: number;
  items: ExtractionItemView[];
  tally: TriageTally;
}

/**
 * Resolve the batch to triage for a source. With `requested`, returns that
 * batch; otherwise the lowest batch that still has pending items, falling back
 * to the last batch (everything decided) or batch 1 (nothing extracted).
 */
export function getBatch(
  db: DB,
  sourceId: number,
  requested?: number,
): BatchData {
  const batchRows = db
    .prepare(
      `SELECT batch_no AS batchNo,
              SUM(CASE WHEN decision = 'pending' THEN 1 ELSE 0 END) AS pending
         FROM extraction_item
        WHERE source_id = ? AND batch_no IS NOT NULL
        GROUP BY batch_no
        ORDER BY batch_no`,
    )
    .all(sourceId) as { batchNo: number; pending: number }[];

  const batchCount = batchRows.length;
  let batchNo: number;
  if (requested !== undefined) {
    batchNo = requested;
  } else if (batchCount === 0) {
    batchNo = 1;
  } else {
    batchNo =
      batchRows.find((b) => b.pending > 0)?.batchNo ??
      batchRows[batchCount - 1].batchNo;
  }

  const items = listBatchItems(db, sourceId, batchNo);
  return { batchNo, batchCount, items, tally: tallyOf(items) };
}

/**
 * Record a per-item decision (including 'pending' for undo). Does not touch
 * decided_at — materialization happens only at batch confirm. Returns the
 * updated item, or null if it doesn't exist or is already confirmed.
 */
export function setDecision(
  db: DB,
  id: number,
  decision: TriageDecision,
): ExtractionItemView | "not_found" | "already_confirmed" {
  const existing = getExtractionItem(db, id);
  if (!existing) return "not_found";
  if (existing.decidedAt !== null) return "already_confirmed";
  db.prepare(
    "UPDATE extraction_item SET decision = ?, updated_at = ? WHERE id = ?",
  ).run(decision, nowIso(), id);
  return getExtractionItem(db, id)!;
}

/**
 * Apply a decision to every still-undecided (decision 'pending') item of a
 * batch that falls in the given likely-known group. Items the user already
 * decided individually are never overridden. Returns the affected items.
 */
export function bulkDecision(
  db: DB,
  sourceId: number,
  batchNo: number,
  group: TriageGroup,
  decision: TriageDecision,
): { items: ExtractionItemView[]; tally: TriageTally } {
  const now = nowIso();
  const update = db.prepare(
    "UPDATE extraction_item SET decision = ?, updated_at = ? WHERE id = ?",
  );
  const all = listBatchItems(db, sourceId, batchNo);
  const affected: ExtractionItemView[] = [];
  db.transaction(() => {
    for (const it of all) {
      if (it.decision !== "pending") continue; // bulk never overrides a decision
      if (!inGroup(it.likelyKnown, group)) continue;
      update.run(decision, now, it.id);
      affected.push({ ...it, decision });
    }
  })();
  return {
    items: affected,
    tally: tallyOf(listBatchItems(db, sourceId, batchNo)),
  };
}

function findExistingWord(
  db: DB,
  lemmaNormalized: string,
): {
  id: number;
  term: string;
  definitionEn: string | null;
  status: string;
} | null {
  const row = db
    .prepare(
      "SELECT id, term, definition_en AS definitionEn, status FROM word WHERE lemma_normalized = ? AND language = ? ORDER BY id LIMIT 1",
    )
    .get(lemmaNormalized, LANGUAGE) as
    | { id: number; term: string; definitionEn: string | null; status: string }
    | undefined;
  return row ?? null;
}

/**
 * Exact (term, language) lookup, mirroring the UNIQUE(term, language)
 * constraint — catches homographs the lemma lookup misses (same term,
 * different lemma).
 */
function findWordByTerm(
  db: DB,
  term: string,
): {
  id: number;
  term: string;
  definitionEn: string | null;
  status: string;
} | null {
  const row = db
    .prepare(
      "SELECT id, term, definition_en AS definitionEn, status FROM word WHERE term = ? AND language = ? ORDER BY id LIMIT 1",
    )
    .get(term, LANGUAGE) as
    | { id: number; term: string; definitionEn: string | null; status: string }
    | undefined;
  return row ?? null;
}

interface DeckRow {
  id: number;
}

function esDeckId(db: DB): number {
  const deck = db
    .prepare("SELECT id FROM deck WHERE language = ? ORDER BY id LIMIT 1")
    .get(LANGUAGE) as DeckRow | undefined;
  if (!deck) throw new Error("no Spanish deck seeded");
  return deck.id;
}

/** Insert a word row from a candidate and link it back onto the item. */
function materializeWord(
  db: DB,
  item: ExtractionItemView,
  status: "new" | "known",
  deckId: number,
  now: string,
): number {
  const result = db
    .prepare(
      `INSERT INTO word
         (term, term_normalized, lemma, lemma_normalized, language,
          part_of_speech, definition_es, definition_en, example, level,
          status, deck_id, source_id, definition_origin, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'llm', ?, ?)`,
    )
    .run(
      item.term,
      normalize(item.term),
      item.lemma,
      lemmaKey(item),
      LANGUAGE,
      item.partOfSpeech,
      item.definitionEs,
      item.definitionEn,
      item.example,
      item.level,
      status,
      deckId,
      item.sourceId,
      now,
      now,
    );
  const wordId = Number(result.lastInsertRowid);
  db.prepare(
    "UPDATE extraction_item SET word_id = ?, decided_at = ?, updated_at = ? WHERE id = ?",
  ).run(wordId, now, now, item.id);
  return wordId;
}

/**
 * Confirm a batch: in one transaction, materialize a word row for every
 * learn/know decision that does NOT collide with an existing word, record
 * decided_at on skips, and leave collisions unresolved — returned as
 * dedupeHits for a human keep/merge decision. Pending items are left alone.
 *
 * Collisions are checked item by item INSIDE the transaction, against both
 * lemma_normalized and the exact (term, language) key. That way a duplicate
 * within the batch itself (the same word extracted on two pages) collides
 * with the word just materialized for its first occurrence and surfaces as a
 * dedupe hit, and a homograph (same term, different lemma) is caught before
 * it can violate UNIQUE(term, language). Duplicates never 500 and never roll
 * back the rest of the batch.
 */
export function confirmBatch(
  db: DB,
  sourceId: number,
  batchNo: number,
): ConfirmResponse {
  const items = listBatchItems(db, sourceId, batchNo).filter(
    (it) => it.decidedAt === null && it.decision !== "pending",
  );
  const deckId = esDeckId(db);
  const now = nowIso();
  const response: ConfirmResponse = {
    materialized: 0,
    known: 0,
    learn: 0,
    skipped: 0,
    dedupeHits: [],
  };
  const hits: DedupeHit[] = [];

  db.transaction(() => {
    for (const item of items) {
      if (item.decision === "skip") {
        db.prepare(
          "UPDATE extraction_item SET decided_at = ?, updated_at = ? WHERE id = ?",
        ).run(now, now, item.id);
        response.skipped += 1;
        continue;
      }
      const existing =
        findExistingWord(db, lemmaKey(item)) ?? findWordByTerm(db, item.term);
      if (existing) {
        hits.push({ item, existingWord: existing });
        continue;
      }
      const status = item.decision === "know" ? "known" : "new";
      materializeWord(db, item, status, deckId, now);
      response.materialized += 1;
      if (status === "known") response.known += 1;
      else response.learn += 1;
    }
  })();

  response.dedupeHits = hits;
  return response;
}

/**
 * Resolve a single dedupe hit. 'merge' links the candidate to the existing
 * word (no new row); 'keep' materializes a new word anyway. Returns the
 * updated item, or a discriminated failure.
 */
export function resolveDedupe(
  db: DB,
  id: number,
  resolution: "keep" | "merge",
):
  | ExtractionItemView
  | "not_found"
  | "already_confirmed"
  | "not_dedupe"
  | "term_taken" {
  const item = getExtractionItem(db, id);
  if (!item) return "not_found";
  if (item.decidedAt !== null) return "already_confirmed";
  if (item.decision !== "know" && item.decision !== "learn")
    return "not_dedupe";
  // Same lookup order as confirmBatch: lemma match first, then exact term
  // (the homograph case, where only the term collides).
  const existing =
    findExistingWord(db, lemmaKey(item)) ?? findWordByTerm(db, item.term);
  if (!existing) return "not_dedupe";

  const now = nowIso();
  if (resolution === "merge") {
    db.prepare(
      "UPDATE extraction_item SET word_id = ?, decided_at = ?, updated_at = ? WHERE id = ?",
    ).run(existing.id, now, now, id);
    return getExtractionItem(db, id)!;
  }

  // keep: a separate word row. UNIQUE(term, language) still forbids an exact
  // term duplicate — surface that rather than crashing.
  const clash = db
    .prepare("SELECT id FROM word WHERE term = ? AND language = ? LIMIT 1")
    .get(item.term, LANGUAGE) as { id: number } | undefined;
  if (clash) return "term_taken";

  const status = item.decision === "know" ? "known" : "new";
  db.transaction(() => {
    materializeWord(db, item, status, esDeckId(db), now);
  })();
  return getExtractionItem(db, id)!;
}
