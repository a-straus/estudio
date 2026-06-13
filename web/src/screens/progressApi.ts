import type { ProgressSummary } from "@estudio/shared";
import { api } from "../api";
export { ApiError } from "../api";

/** Fetch the full progress payload for the Progress screen. */
export function fetchProgress(): Promise<ProgressSummary> {
  return api<ProgressSummary>("/api/progress");
}
