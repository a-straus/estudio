// Shared fetch client for every /api call from the web app. Screen-specific
// modules (reviewApi, triageApi, libraryApi, ingestApi) build on this.

/** Thrown on any non-2xx /api response; message is the server's error message. */
export class ApiError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

export async function api<T>(input: string, init?: RequestInit): Promise<T> {
  // Only a JSON string body gets the JSON content type — FormData uploads
  // must let the browser set their own multipart boundary.
  const jsonBody = typeof init?.body === "string";
  const res = await fetch(input, {
    ...init,
    headers: jsonBody
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
