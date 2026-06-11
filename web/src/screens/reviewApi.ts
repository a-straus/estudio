import type {
  DemoteResponse,
  DueQueueResponse,
  SubmitReviewRequest,
  SubmitReviewResponse,
} from "@estudio/shared";

/** Thrown on any non-2xx /api response; message is the server's error message. */
export class ApiError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

async function api<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: init?.body
      ? { "Content-Type": "application/json", ...init?.headers }
      : init?.headers,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let code = "http_error";
    try {
      const body = await res.json();
      if (body?.error) {
        message = body.error.message ?? message;
        code = body.error.code ?? code;
      }
    } catch {
      // non-JSON error body; keep the generic message
    }
    throw new ApiError(message, code);
  }
  return res.json() as Promise<T>;
}

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

export function demoteWord(wordId: number): Promise<DemoteResponse> {
  return api<DemoteResponse>(`/api/words/${wordId}/demote`, {
    method: "POST",
  });
}
