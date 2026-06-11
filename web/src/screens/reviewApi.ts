import type {
  DueQueueWithClozeResponse,
  ReviewDirection,
  ReviewGrade,
  SubmitReviewResponse,
} from "@estudio/shared";
import { api } from "../api";

export { ApiError } from "../api";

/**
 * A review submission. `direction: 'cloze'` with a `quizQuestionId` marks a
 * review rendered from a cached cloze quiz_question (review-02 #8); everything
 * else is the existing MC/flip review.
 */
export interface ReviewSubmit {
  wordId: number;
  direction: ReviewDirection | "cloze";
  grade: ReviewGrade;
  quizQuestionId?: number;
}

export function fetchDueQueue(
  deckId: number,
): Promise<DueQueueWithClozeResponse> {
  return api<DueQueueWithClozeResponse>(`/api/decks/${deckId}/due`);
}

export function submitReview(
  req: ReviewSubmit,
): Promise<SubmitReviewResponse> {
  return api<SubmitReviewResponse>(`/api/reviews`, {
    method: "POST",
    body: JSON.stringify(req),
  });
}
