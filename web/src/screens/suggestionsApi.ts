import type {
  SuggestionDecisionRequest,
  SuggestionDecisionResponse,
  SuggestionNextResponse,
} from "@estudio/shared";
import { api } from "../api";
export { ApiError } from "../api";

export function fetchNextSuggestion(): Promise<SuggestionNextResponse> {
  return api<SuggestionNextResponse>("/api/suggestions/next");
}

export function recordDecision(
  id: number,
  action: "add" | "skip",
): Promise<SuggestionDecisionResponse> {
  return api<SuggestionDecisionResponse>(
    `/api/suggestions/${id}/decision`,
    {
      method: "POST",
      body: JSON.stringify({ action } satisfies SuggestionDecisionRequest),
    },
  );
}
