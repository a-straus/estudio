// Overview API payload — the one summary source shared by the Home screen and
// the SiteFooter (one fetch, shared). Read-only: GET /api/overview aggregates
// existing tables; it writes nothing and triggers no LLM calls.

import type { JobStatus } from "./types.js";

/** The featured word's dictionary fields — enough for a full WordEntry. */
export interface OverviewFeaturedWord {
  id: number;
  headword: string;
  lemma: string | null;
  language: string | null;
  partOfSpeech: string | null;
  level: string | null;
  glossEs: string | null;
  glossEn: string | null;
  example: string | null;
}

/** The home centerpiece: the day's word and why it was picked. */
export interface OverviewFeatured {
  word: OverviewFeaturedWord;
  /** "due" → the next-due card; "mature" → a mature word worth revisiting. */
  reason: "due" | "mature";
  /** ISO-8601 timestamp the card was last seen/reviewed, or null. */
  lastReviewedAt: string | null;
}

/** A compact recent-activity row (latest decided/added words). */
export interface OverviewRecentWord {
  id: number;
  headword: string;
  lemma: string | null;
  level: string | null;
  glossEn: string | null;
}

/** The latest ingestion/seed job, for the Activity band's JobStatus line. */
export interface OverviewActivityJob {
  type: string;
  status: JobStatus;
}

/** GET /api/overview — the shared home + footer summary. */
export interface OverviewSummary {
  /** The day's featured word; null only when the library is truly empty. */
  featured: OverviewFeatured | null;
  /** Review deck 1 (the Spanish default): due + new-today counts. */
  review: { due: number; newToday: number };
  /** Library totals (mature = SM-2 maturity, word.status 'mature'). */
  library: { total: number; mature: number };
  /** Grammar curriculum state. */
  grammar: { topics: number; belowFifty: number; seeded: boolean };
  /** Suggestion pool size (Phase 2; always 0 today → the card hides). */
  suggestions: { pool: number };
  /** Up to 3 latest decided/added words for compact rows. */
  recentWords: OverviewRecentWord[];
  /** Latest running/recent ingestion or seed job, or null. */
  latestJob: OverviewActivityJob | null;
  /** ISO-8601 timestamp of the last backup, or null. */
  lastBackupAt: string | null;
}
