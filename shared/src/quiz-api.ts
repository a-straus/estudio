// Quiz API payload types — owned by the quiz-engine-ui task.
// camelCase JSON over the wire; the query layer maps from snake_case rows.

import type { DueQueueResponse } from "./srs-api.js";

/** Style chosen in Setup. `mixed` interleaves def_match + cloze. */
export type QuizStyleOption = "def_match" | "cloze" | "mixed";

/** Direction chosen in Setup. `mixed` interleaves both per question. */
export type QuizDirectionOption = "w2d" | "d2w" | "mixed";

/** The concrete style stored on a generated question. */
export type QuizQuestionStyle = "def_match" | "cloze";

/** How a question renders: def_match carries w2d/d2w; cloze is always `cloze`. */
export type QuizRenderDirection = "w2d" | "d2w" | "cloze";

export interface QuizGenerateRequest {
  deckId: number;
  length: number;
  style: QuizStyleOption;
  direction: QuizDirectionOption;
}

export interface QuizGenerateResponse {
  jobId: number;
}

/** One generated question as served to the client — never includes the answer. */
export interface QuizQuestionView {
  /** quiz_question.id */
  id: number;
  wordId: number;
  style: QuizQuestionStyle;
  direction: QuizRenderDirection;
  /** def_match cue: a term for w2d, a definition for d2w. Null for cloze. */
  cue: string | null;
  /** cloze: sentence text before the blank. Null for def_match. */
  stemBefore: string | null;
  /** cloze: sentence text after the blank. Null for def_match. */
  stemAfter: string | null;
  /** The answer options, already shuffled. */
  options: string[];
  // Word fields, for the results list.
  term: string;
  lemma: string | null;
  partOfSpeech: string | null;
  definitionEs: string | null;
  definitionEn: string | null;
  example: string | null;
}

export type QuizJobStatus = "queued" | "running" | "done" | "failed";

/** Generation progress, e.g. "Writing questions… 12 of 20". */
export interface QuizProgress {
  step: number;
  total: number;
}

export interface QuizQuestionsResponse {
  status: QuizJobStatus;
  progress: QuizProgress | null;
  error: string | null;
  /** Populated only when status === 'done'. */
  questions: QuizQuestionView[];
}

export interface QuizAnswerRequest {
  questionId: number;
  /** The chosen option text, or null for "Don't know". */
  given: string | null;
  direction: QuizRenderDirection;
}

export interface QuizAnswerResponse {
  correct: boolean;
  /** The correct option/fill, for the reveal. */
  correctAnswer: string;
  /** The eagerly-generated explanation, cached with the question. */
  explanation: string;
}

export interface QuizAttemptAnswer {
  questionId: number;
  given: string | null;
  correct: boolean;
}

export interface QuizAttemptRequest {
  deckId: number;
  style: QuizStyleOption;
  direction: QuizDirectionOption;
  answers: QuizAttemptAnswer[];
}

export interface QuizAttemptResponse {
  id: number;
}

export interface QuizFlagResponse {
  id: number;
  flagged: true;
}

/**
 * A cached cloze question mixed into the review due queue (review-02 #8).
 * Review grades it client-side, like its multiple-choice cards.
 */
export interface ClozeReviewItem {
  wordId: number;
  questionId: number;
  stemBefore: string;
  stemAfter: string;
  options: string[];
  correct: string;
  explanation: string;
}

/** GET /api/decks/:id/due, extended with optional cloze-rendered reviews. */
export interface DueQueueWithClozeResponse extends DueQueueResponse {
  clozeReviews?: ClozeReviewItem[];
}
