/** Shared request/response types for the English placement assessment API. */

export type PlacementBand = "B2" | "C1" | "C2" | "rare-archaic";

export interface PlacementWord {
  term: string;
  lemma: string;
  part_of_speech: string;
  definition_en: string;
  band: PlacementBand;
}

/** Per-band answer record sent from the client to the server. */
export interface BandAnswers {
  band: PlacementBand;
  words: PlacementWord[];
  knownTerms: string[];
}

/** POST /api/placement/next — request body. */
export interface PlacementNextRequest {
  /** Answers for each band completed so far, in order. Empty on first call. */
  completedBands: BandAnswers[];
}

/** POST /api/placement/next — response body. */
export type PlacementNextResponse =
  | { done: false; band: PlacementBand; words: PlacementWord[] }
  | { done: true; level: PlacementBand };

/** POST /api/placement/complete — request body. */
export interface PlacementCompleteRequest {
  level: PlacementBand;
  knownWords: PlacementWord[];
}

/** POST /api/placement/complete — response body. */
export interface PlacementCompleteResponse {
  level: PlacementBand;
  seeded: number;
}

/** GET /api/placement/status — response body. */
export interface PlacementStatusResponse {
  calibrated: boolean;
  level?: PlacementBand;
  seeded?: number;
}
