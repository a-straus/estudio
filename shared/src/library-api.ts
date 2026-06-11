// Library/word CRUD API payload types — owned by the library-ui task. Shared by
// the word routes (server) and the Library screen (web). JSON is camelCase.

import type { ReviewDirection, ReviewGrade } from "./srs-api.js";

export type WordStatus = "new" | "learning" | "mature" | "known" | "suspended";

export type DefinitionOrigin = "llm" | "owner";

export type WordLanguage = "es" | "en";

/** How the word list is ordered. */
export type WordSort = "recent" | "alpha";

/** A row in the library list — the compact WordEntry's data plus list meta. */
export interface WordListItem {
  id: number;
  term: string;
  lemma: string | null;
  language: WordLanguage;
  partOfSpeech: string | null;
  definitionEs: string | null;
  definitionEn: string | null;
  example: string | null;
  level: string | null;
  status: WordStatus;
  deckId: number;
  sourceId: number | null;
}

export interface WordListQuery {
  /** Accent-insensitive search over term_normalized / lemma_normalized. */
  q?: string;
  status?: WordStatus;
  partOfSpeech?: string;
  deckId?: number;
  sort?: WordSort;
  limit?: number;
  offset?: number;
}

export interface WordListResponse {
  items: WordListItem[];
  /** Total matching rows, ignoring pagination. */
  total: number;
  limit: number;
  offset: number;
}

/** card_state summary shown on the detail panel. Null when the word has no card. */
export interface CardStateSummary {
  ease: number;
  intervalDays: number;
  dueAt: string;
  reps: number;
}

/** One recent review_log row, newest first. */
export interface ReviewLogEntry {
  id: number;
  ts: string;
  direction: ReviewDirection;
  grade: ReviewGrade;
  easeAfter: number;
  intervalAfter: number;
  origin: "review" | "quiz" | "manual_demotion";
}

/** Full word detail: provenance + card_state + recent reviews. */
export interface WordDetailResponse extends WordListItem {
  definitionOrigin: DefinitionOrigin;
  ownerEditedAt: string | null;
  promptVersion: string | null;
  /** Title of the source the word came from, when it has one. */
  sourceTitle: string | null;
  createdAt: string;
  updatedAt: string;
  cardState: CardStateSummary | null;
  recentReviews: ReviewLogEntry[];
}

/** Manual add. term + language are required; the rest auto-fill via the LLM. */
export interface CreateWordRequest {
  term: string;
  language: WordLanguage;
  lemma?: string;
  partOfSpeech?: string;
  definitionEs?: string;
  definitionEn?: string;
  example?: string;
  level?: string;
  deckId?: number;
  status?: WordStatus;
}

/** Owner edit. Definition-field changes flip definition_origin to 'owner'. */
export interface UpdateWordRequest {
  lemma?: string | null;
  partOfSpeech?: string | null;
  definitionEs?: string | null;
  definitionEn?: string | null;
  example?: string | null;
  level?: string | null;
  status?: WordStatus;
}
