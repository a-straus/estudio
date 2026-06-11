import type {
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
