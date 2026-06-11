import type {
  BulkDecisionResponse,
  ConfirmResponse,
  DedupeResolution,
  ExtractionItemView,
  TriageBatchResponse,
  TriageDecision,
  TriageGroup,
} from "@estudio/shared";
import { api } from "../api";

export { ApiError } from "../api";

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
