// The /api/overview summary — the single read consumed by both the Home screen
// and the SiteFooter. Pure composition of existing query helpers plus two small
// reads (a mature-word pick and the latest activity job). Reads only; no writes.

import type {
  OverviewActivityJob,
  OverviewFeatured,
  OverviewRecentWord,
  OverviewSummary,
} from "@estudio/shared";
import { nowIso, type DB } from "./db.js";
import { getWordDetail, listWords } from "./word-queries.js";
import {
  countPromotedToday,
  getDueCards,
  getNewWords,
} from "./srs-queries.js";
import { getGrammarHome } from "./grammar-queries.js";
import { lastBackupJobAt } from "../jobs/backup.js";

/** The Spanish deck is the default review deck (id 1). */
const DEFAULT_DECK_ID = 1;

/** Below this mastery a grammar topic counts as "needs practice" (home.md). */
const MASTERY_THRESHOLD = 0.5;

/** Job types that count as an ingestion or seed for the Activity band. */
const ACTIVITY_JOB_TYPES = ["text_ingestion", "pdf_ingestion", "grammar_seed"];

/** The mature word with the soonest due_at — the server's revisit pick. */
function pickMatureRevisit(db: DB, deckId: number): number | null {
  const row = db
    .prepare(
      `SELECT cs.word_id AS id
         FROM card_state cs JOIN word w ON w.id = cs.word_id
        WHERE w.deck_id = ? AND w.status = 'mature'
        ORDER BY cs.due_at ASC, cs.word_id ASC
        LIMIT 1`,
    )
    .get(deckId) as { id: number } | undefined;
  return row?.id ?? null;
}

/** When the featured card was last reviewed (newest review_log ts), or null. */
function lastReviewedAt(db: DB, wordId: number): string | null {
  const row = db
    .prepare(
      "SELECT MAX(ts) AS ts FROM review_log WHERE word_id = ?",
    )
    .get(wordId) as { ts: string | null };
  return row.ts;
}

/** The latest ingestion/seed job, newest-first, or null. */
function latestActivityJob(db: DB): OverviewActivityJob | null {
  const placeholders = ACTIVITY_JOB_TYPES.map(() => "?").join(", ");
  const row = db
    .prepare(
      `SELECT type, status FROM job
        WHERE type IN (${placeholders})
        ORDER BY id DESC LIMIT 1`,
    )
    .get(...ACTIVITY_JOB_TYPES) as
    | { type: string; status: OverviewActivityJob["status"] }
    | undefined;
  return row ? { type: row.type, status: row.status } : null;
}

/** Build the featured-word block: next-due, else a mature revisit, else any word. */
function buildFeatured(db: DB, deckId: number): OverviewFeatured | null {
  const due = getDueCards(db, deckId, nowIso());
  let reason: OverviewFeatured["reason"] = "due";
  let wordId: number | null = null;

  if (due.length > 0) {
    // Soonest due first.
    due.sort((a, b) => a.due_at.localeCompare(b.due_at));
    wordId = due[0]!.word_id;
  } else {
    reason = "mature";
    wordId = pickMatureRevisit(db, deckId);
    if (wordId === null) {
      // No mature card yet: surface a 'new' word so the front door is never
      // empty while the library has any word.
      wordId = getNewWords(db, deckId)[0]?.id ?? null;
    }
  }

  if (wordId === null) {
    // Truly empty deck — fall back to the most recently added word, if any.
    const recent = listWords(db, { sort: "recent", limit: 1 });
    wordId = recent.items[0]?.id ?? null;
    reason = "mature";
  }
  if (wordId === null) return null;

  const detail = getWordDetail(db, wordId);
  if (!detail) return null;

  return {
    word: {
      id: detail.id,
      headword: detail.term,
      lemma: detail.lemma,
      language: detail.language,
      partOfSpeech: detail.partOfSpeech,
      level: detail.level,
      glossEs: detail.definitionEs,
      glossEn: detail.definitionEn,
      example: detail.example,
    },
    reason,
    lastReviewedAt: lastReviewedAt(db, wordId),
  };
}

function buildRecentWords(db: DB): OverviewRecentWord[] {
  return listWords(db, { sort: "recent", limit: 3 }).items.map((w) => ({
    id: w.id,
    headword: w.term,
    lemma: w.lemma,
    level: w.level,
    glossEn: w.definitionEn,
  }));
}

/** Assemble the whole overview payload from existing reads. */
export function getOverviewSummary(db: DB): OverviewSummary {
  const now = nowIso();
  const grammar = getGrammarHome(db);
  const allTopics = grammar.categories.flatMap((c) => c.topics);

  return {
    featured: buildFeatured(db, DEFAULT_DECK_ID),
    review: {
      due: getDueCards(db, DEFAULT_DECK_ID, now).length,
      newToday: countPromotedToday(db, DEFAULT_DECK_ID, now),
    },
    library: {
      total: listWords(db, {}).total,
      mature: listWords(db, { status: "mature" }).total,
    },
    grammar: {
      topics: allTopics.length,
      belowFifty: allTopics.filter((t) => t.mastery < MASTERY_THRESHOLD).length,
      seeded: grammar.seeded,
    },
    // The Suggestion feature is Phase 2 and unbuilt; an empty pool hides the card.
    suggestions: { pool: 0 },
    recentWords: buildRecentWords(db),
    latestJob: latestActivityJob(db),
    lastBackupAt: lastBackupJobAt(db),
  };
}
