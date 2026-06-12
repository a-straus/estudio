import type { OverviewSummary } from "@estudio/shared";
import { api } from "../api";
export { ApiError } from "../api";

/** The single summary read shared by Home and the SiteFooter. */
export function fetchOverview(): Promise<OverviewSummary> {
  return api<OverviewSummary>("/api/overview");
}
