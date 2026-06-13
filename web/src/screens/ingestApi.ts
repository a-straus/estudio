import type {
  AudioUploadResponse,
  GutenbergConfirmResponse,
  GutenbergEstimateResponse,
  GutenbergIngestRequest,
  JobView,
  PdfUploadResponse,
  TextIngestRequest,
  TextIngestResponse,
} from "@estudio/shared";
import { api } from "../api";

export { ApiError } from "../api";

export function submitText(
  req: TextIngestRequest,
): Promise<TextIngestResponse> {
  return api<TextIngestResponse>("/api/sources/text", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export function uploadPdf(
  file: File,
  title?: string,
): Promise<PdfUploadResponse> {
  const form = new FormData();
  form.append("file", file);
  if (title) form.append("title", title);
  return api<PdfUploadResponse>("/api/sources/pdf", {
    method: "POST",
    body: form,
  });
}

export function fetchJobs(): Promise<JobView[]> {
  return api<JobView[]>("/api/jobs");
}

/** Fetch a Gutenberg book and get the upfront cost estimate (no job yet). */
export function submitGutenberg(
  req: GutenbergIngestRequest,
): Promise<GutenbergEstimateResponse> {
  return api<GutenbergEstimateResponse>("/api/sources/gutenberg", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

/** Owner-confirmed: start the resumable classification job. */
export function confirmGutenberg(
  sourceId: number,
): Promise<GutenbergConfirmResponse> {
  return api<GutenbergConfirmResponse>(
    `/api/sources/gutenberg/${sourceId}/confirm`,
    { method: "POST" },
  );
}

export function submitAudio(file: File): Promise<AudioUploadResponse> {
  const form = new FormData();
  form.append("file", file);
  return api<AudioUploadResponse>("/api/sources/audio", {
    method: "POST",
    body: form,
  });
}
