import type {
  DueQueueResponse,
  SubmitReviewRequest,
  SubmitReviewResponse,
} from "@estudio/shared";
import { api } from "../api";

export { ApiError } from "../api";

export function fetchDueQueue(deckId: number): Promise<DueQueueResponse> {
  return api<DueQueueResponse>(`/api/decks/${deckId}/due`);
}

export function submitReview(
  req: SubmitReviewRequest,
): Promise<SubmitReviewResponse> {
  return api<SubmitReviewResponse>(`/api/reviews`, {
    method: "POST",
    body: JSON.stringify(req),
  });
}
