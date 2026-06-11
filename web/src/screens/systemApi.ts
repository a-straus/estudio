import type {
  SystemBackupResponse,
  SystemErrorsResponse,
  SystemJobsResponse,
  SystemSpendResponse,
  SystemStatusResponse,
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
