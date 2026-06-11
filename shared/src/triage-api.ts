// Triage API payload types — owned by the triage-ui task. Shared by the
// triage routes (server) and the triage screen (web). JSON is camelCase.

export type TriageDecision = "pending" | "know" | "learn" | "skip";

/** Which likely-known group a candidate belongs to (UI grouping + bulk scope). */
export type TriageGroup = "probably_new" | "may_know";

/** Candidates with likely_known >= this are grouped under "you may know these". */
export const MAY_KNOW_THRESHOLD = 0.5;

/** Camel-cased view of an `extraction_item` row. */
export interface ExtractionItemView {
  id: number;
  sourceId: number;
  term: string;
  lemma: string | null;
  partOfSpeech: string | null;
  definitionEs: string | null;
  definitionEn: string | null;
  example: string | null;
  level: string | null;
  likelyKnown: number | null;
  batchNo: number | null;
  decision: TriageDecision;
  decidedAt: string | null;
  /**
   * Pre-confirm: a dedupe hint — an existing word with the same
   * lemma_normalized + language. Post-confirm (decidedAt set): the word row
   * the decision materialized or merged into.
   */
  wordId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface TriageTally {
  know: number;
  learn: number;
  skip: number;
  pending: number;
}

/** Response body of GET /api/sources/:id/extraction-items. */
export interface TriageBatchResponse {
  source: { id: number; title: string | null };
  /** The batch returned (active batch, or the one named by ?batch=). */
  batchNo: number;
  /** Total number of batches for the source (0 when nothing extracted yet). */
  batchCount: number;
  totalInBatch: number;
  sortedInBatch: number;
  items: ExtractionItemView[];
  tally: TriageTally;
}

/** Request body of PATCH /api/extraction-items/:id. */
export interface DecisionRequest {
  decision: TriageDecision;
}

/** Request body of POST /api/sources/:id/extraction-items/bulk-decision. */
export interface BulkDecisionRequest {
  batchNo: number;
  group: TriageGroup;
  decision: TriageDecision;
}

/** Response body of the bulk-decision route. */
export interface BulkDecisionResponse {
  items: ExtractionItemView[];
  tally: TriageTally;
}

/** Request body of POST /api/sources/:id/extraction-items/confirm. */
export interface ConfirmRequest {
  batchNo: number;
}

/** An existing word a confirmed candidate collided with on lemma + language. */
export interface DedupeHit {
  item: ExtractionItemView;
  existingWord: {
    id: number;
    term: string;
    definitionEn: string | null;
    status: string;
  };
}

/** Response body of the confirm route. */
export interface ConfirmResponse {
  /** Word rows created (learn + know, excluding dedupe hits). */
  materialized: number;
  /** Of the materialized, how many got status 'known'. */
  known: number;
  /** Of the materialized, how many got status 'new'. */
  learn: number;
  /** Candidates skipped (no word row). */
  skipped: number;
  /** Learn/know candidates that collided with an existing word — unresolved. */
  dedupeHits: DedupeHit[];
}

export type DedupeResolution = "keep" | "merge";

/** Request body of POST /api/extraction-items/:id/resolve-dedupe. */
export interface ResolveDedupeRequest {
  resolution: DedupeResolution;
}
