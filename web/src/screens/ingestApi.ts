import type {
  JobView,
  PdfUploadResponse,
  TextIngestRequest,
  TextIngestResponse,
} from "@estudio/shared";

/** Thrown on any non-2xx /api response; message is the server's error message. */
export class ApiError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

async function readError(res: Response): Promise<ApiError> {
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
  return new ApiError(message, code);
}

export async function submitText(
  req: TextIngestRequest,
): Promise<TextIngestResponse> {
  const res = await fetch("/api/sources/text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw await readError(res);
  return res.json() as Promise<TextIngestResponse>;
}

export async function uploadPdf(
  file: File,
  title?: string,
): Promise<PdfUploadResponse> {
  const form = new FormData();
  form.append("file", file);
  if (title) form.append("title", title);
  const res = await fetch("/api/sources/pdf", { method: "POST", body: form });
  if (!res.ok) throw await readError(res);
  return res.json() as Promise<PdfUploadResponse>;
}

export async function fetchJobs(): Promise<JobView[]> {
  const res = await fetch("/api/jobs");
  if (!res.ok) throw await readError(res);
  return res.json() as Promise<JobView[]>;
}
