// SRS API payload types — owned by the srs-api-wiring task.
// camelCase JSON over the wire; the query layer maps from snake_case rows.

/** Review prompt direction. `cloze` is quiz-only and never produced here. */
export type ReviewDirection = "w2d" | "d2w";

/** SM-2 grade buttons: fail / good / easy (quality 2 / 4 / 5). */
export type ReviewGrade = "fail" | "good" | "easy";

/** Word status as the SM-2 lifecycle decides it after a review. */
export type SrsCardStatus = "learning" | "mature";

/** One card to study: enough for the UI to render both review directions. */
export interface DueQueueItem {
  wordId: number;
  term: string;
  lemma: string | null;
  partOfSpeech: string | null;
  definitionEs: string | null;
  definitionEn: string | null;
  example: string | null;
  /** Randomly assigned prompt direction for this card. */
  direction: ReviewDirection;
}

/** A deck word outside the queue, offered as a multiple-choice distractor. */
export interface DistractorCandidate {
  wordId: number;
  term: string;
  definitionEn: string | null;
}

export interface DueQueueResponse {
  deckId: number;
  /** Due cards (oldest first) followed by newly promoted cards, in study order. */
  items: DueQueueItem[];
  /**
   * Spare distractors drawn from the rest of the deck, present when the queue
   * alone can't fill 3 distractors. The client falls back to flip cards only
   * when queue + distractors still can't.
   */
  distractors?: DistractorCandidate[];
}

/** The scheduling state returned after grading or demoting a card. */
export interface CardSchedulingState {
  wordId: number;
  ease: number;
  intervalDays: number;
  /** ISO-8601 UTC. */
  dueAt: string;
  reps: number;
  status: SrsCardStatus;
}

export interface SubmitReviewRequest {
  wordId: number;
  direction: ReviewDirection;
  grade: ReviewGrade;
}

export interface SubmitReviewResponse {
  card: CardSchedulingState;
}

/** Manual "I forgot this" demotion takes no body beyond the word in the path. */
export interface DemoteResponse {
  card: CardSchedulingState;
}
