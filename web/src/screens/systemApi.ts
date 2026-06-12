import type {
  GetSettingsResponse,
  PutSettingsRequest,
  PutSettingsResponse,
  SystemBackupResponse,
  SystemErrorsResponse,
  SystemJobsResponse,
  SystemSpendResponse,
  SystemStatusResponse,
} from "@estudio/shared";
import { api } from "../api";
export { ApiError } from "../api";

export function fetchErrors(): Promise<SystemErrorsResponse> {
  return api<SystemErrorsResponse>("/api/system/errors");
}

export function fetchJobs(): Promise<SystemJobsResponse> {
  return api<SystemJobsResponse>("/api/system/jobs");
}

export function fetchSpend(): Promise<SystemSpendResponse> {
  return api<SystemSpendResponse>("/api/system/spend");
}

export function fetchStatus(): Promise<SystemStatusResponse> {
  return api<SystemStatusResponse>("/api/system/status");
}

export function triggerBackup(): Promise<SystemBackupResponse> {
  return api<SystemBackupResponse>("/api/system/backup", { method: "POST" });
}

export function getSettings(): Promise<GetSettingsResponse> {
  return api<GetSettingsResponse>("/api/settings");
}

export function putSettings(
  patch: PutSettingsRequest,
): Promise<PutSettingsResponse> {
  return api<PutSettingsResponse>("/api/settings", {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}
