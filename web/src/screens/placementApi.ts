import type {
  PlacementCompleteRequest,
  PlacementCompleteResponse,
  PlacementNextRequest,
  PlacementNextResponse,
  PlacementStatusResponse,
} from "@estudio/shared";
import { api } from "../api";

export { ApiError } from "../api";

export function fetchPlacementStatus(): Promise<PlacementStatusResponse> {
  return api<PlacementStatusResponse>("/api/placement/status");
}

export function fetchNextBand(
  req: PlacementNextRequest,
): Promise<PlacementNextResponse> {
  return api<PlacementNextResponse>("/api/placement/next", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export function completePlacement(
  req: PlacementCompleteRequest,
): Promise<PlacementCompleteResponse> {
  return api<PlacementCompleteResponse>("/api/placement/complete", {
    method: "POST",
    body: JSON.stringify(req),
  });
}
