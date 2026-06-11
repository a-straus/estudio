import type {
  BulkDecisionResponse,
  ConfirmResponse,
  DedupeResolution,
  ExtractionItemView,
  TriageBatchResponse,
  TriageDecision,
  TriageGroup,
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

export function fetchBatch(
  sourceId: number,
  batchNo?: number,
): Promise<TriageBatchResponse> {
  const q = batchNo ? `?batch=${batchNo}` : "";
  return api<TriageBatchResponse>(
    `/api/sources/${sourceId}/extraction-items${q}`,
  );
}

export function patchDecision(
  itemId: number,
  decision: TriageDecision,
): Promise<ExtractionItemView> {
  return api<ExtractionItemView>(`/api/extraction-items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify({ decision }),
  });
}

export function bulkDecide(
  sourceId: number,
  batchNo: number,
  group: TriageGroup,
  decision: TriageDecision,
): Promise<BulkDecisionResponse> {
  return api<BulkDecisionResponse>(
    `/api/sources/${sourceId}/extraction-items/bulk-decision`,
    { method: "POST", body: JSON.stringify({ batchNo, group, decision }) },
  );
}

export function confirmBatch(
  sourceId: number,
  batchNo: number,
): Promise<ConfirmResponse> {
  return api<ConfirmResponse>(
    `/api/sources/${sourceId}/extraction-items/confirm`,
    { method: "POST", body: JSON.stringify({ batchNo }) },
  );
}

export function resolveDedupe(
  itemId: number,
  resolution: DedupeResolution,
): Promise<ExtractionItemView> {
  return api<ExtractionItemView>(
    `/api/extraction-items/${itemId}/resolve-dedupe`,
    { method: "POST", body: JSON.stringify({ resolution }) },
  );
}
