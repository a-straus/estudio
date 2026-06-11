import type {
  CreateWordRequest,
  UpdateWordRequest,
  WordDetailResponse,
  WordListQuery,
  WordListResponse,
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
  if (res.status === 204) return undefined as T;
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

export function fetchWords(query: WordListQuery): Promise<WordListResponse> {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.status) params.set("status", query.status);
  if (query.partOfSpeech) params.set("partOfSpeech", query.partOfSpeech);
  if (query.deckId !== undefined) params.set("deckId", String(query.deckId));
  if (query.sort) params.set("sort", query.sort);
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.offset !== undefined) params.set("offset", String(query.offset));
  const qs = params.toString();
  return api<WordListResponse>(`/api/words${qs ? `?${qs}` : ""}`);
}

export function fetchWord(id: number): Promise<WordDetailResponse> {
  return api<WordDetailResponse>(`/api/words/${id}`);
}

export function createWord(
  body: CreateWordRequest,
): Promise<WordDetailResponse> {
  return api<WordDetailResponse>("/api/words", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateWord(
  id: number,
  body: UpdateWordRequest,
): Promise<WordDetailResponse> {
  return api<WordDetailResponse>(`/api/words/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteWord(id: number): Promise<void> {
  return api<void>(`/api/words/${id}`, { method: "DELETE" });
}

/** "I forgot this" — reuses the SRS manual-demotion route. */
export function demoteWord(id: number): Promise<unknown> {
  return api<unknown>(`/api/words/${id}/demote`, { method: "POST" });
}
