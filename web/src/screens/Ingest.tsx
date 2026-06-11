import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  JobStatus,
  SegmentedControl,
  TextInput,
  type JobState,
} from "../components";
import { fetchJobs, submitText, uploadPdf, ApiError } from "./ingestApi";
import "./Ingest.css";

type Method = "pdf" | "paste" | "gutenberg" | "import";

const METHODS = [
  { value: "pdf", label: "Upload PDF" },
  { value: "paste", label: "Paste text" },
  { value: "gutenberg", label: "Gutenberg" },
  { value: "import", label: "Import" },
];

/** A submitted ingestion we are tracking to completion. */
interface ActiveJob {
  sourceId: number;
  jobId: number;
  /** "page" (PDF) or "chunk" (text) — the unit named in the stage line. */
  unit: "page" | "chunk";
  total: number;
}

interface ProgressView {
  state: JobState;
  done: number;
  failed: number;
}

interface IngestProps {
  /** Poll interval for job progress; overridable in tests. */
  pollIntervalMs?: number;
}

function readProgress(progress: unknown): { done: number; failed: number } {
  let done = 0;
  let failed = 0;
  if (
    progress &&
    typeof progress === "object" &&
    "pages" in progress &&
    progress.pages &&
    typeof progress.pages === "object"
  ) {
    for (const outcome of Object.values(
      progress.pages as Record<string, string>,
    )) {
      if (outcome === "done") done += 1;
      else if (outcome === "failed") failed += 1;
    }
  }
  return { done, failed };
}

export function Ingest({ pollIntervalMs = 1000 }: IngestProps) {
  const [method, setMethod] = useState<Method>("pdf");
  const [pasteText, setPasteText] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [job, setJob] = useState<ActiveJob | null>(null);
  const [progress, setProgress] = useState<ProgressView | null>(null);
  const [backgrounded, setBackgrounded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const wordCount =
    pasteText.trim() === "" ? 0 : pasteText.trim().split(/\s+/).length;

  const reset = useCallback(() => {
    setJob(null);
    setProgress(null);
    setBackgrounded(false);
    setFormError(null);
  }, []);

  const onSubmitText = useCallback(async () => {
    if (pasteText.trim() === "") {
      setFormError("Paste some text first.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await submitText({ text: pasteText });
      setJob({
        sourceId: res.sourceId,
        jobId: res.jobId,
        unit: "chunk",
        total: res.pageCount,
      });
      setProgress({ state: "queued", done: 0, failed: 0 });
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Couldn't start extraction.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [pasteText]);

  const onPickFile = useCallback(async (file: File) => {
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await uploadPdf(file);
      setJob({
        sourceId: res.source.id,
        jobId: res.jobId,
        unit: "page",
        total: res.pageCount,
      });
      setProgress({ state: "queued", done: 0, failed: 0 });
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Couldn't read that file.",
      );
    } finally {
      setSubmitting(false);
    }
  }, []);

  // Poll job progress until the job reaches a terminal state (or is backgrounded).
  useEffect(() => {
    if (!job || backgrounded) return;
    let active = true;

    const poll = async () => {
      try {
        const jobs = await fetchJobs();
        const view = jobs.find((j) => j.id === job.jobId);
        if (!active || !view) return;
        const { done, failed } = readProgress(view.progress);
        setProgress({ state: view.status as JobState, done, failed });
      } catch {
        // Transient poll failure: keep the last known progress and retry.
      }
    };

    void poll();
    const timer = setInterval(() => void poll(), pollIntervalMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [job, backgrounded, pollIntervalMs]);

  const terminal = progress?.state === "done" || progress?.state === "failed";

  return (
    <main className="ingest">
      <h1 className="ingest__title">Ingest</h1>

      <SegmentedControl
        label="Ingest method"
        options={METHODS}
        value={method}
        onChange={(v) => {
          setMethod(v as Method);
          reset();
        }}
      />

      {!job && (
        <section className="ingest__panel">
          {method === "pdf" && (
            <div className="ingest__dropzone">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="ingest__file-input"
                aria-label="Choose a PDF scan"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onPickFile(file);
                }}
              />
              <Button
                variant="secondary"
                busy={submitting}
                busyLabel="Reading…"
                onClick={() => fileInputRef.current?.click()}
              >
                Drop a PDF scan here, or browse
              </Button>
            </div>
          )}

          {method === "paste" && (
            <div className="ingest__paste">
              <TextInput
                label="Paste text"
                multiline
                value={pasteText}
                onChange={setPasteText}
                placeholder="Paste Spanish or English text…"
                error={formError ?? undefined}
                help={`${wordCount.toLocaleString()} words · language auto-detected`}
              />
              <Button
                variant="primary"
                busy={submitting}
                busyLabel="Starting…"
                disabled={pasteText.trim() === ""}
                onClick={() => void onSubmitText()}
              >
                Extract words
              </Button>
            </div>
          )}

          {(method === "gutenberg" || method === "import") && (
            <div className="ingest__coming-soon">
              <TextInput
                label={
                  method === "gutenberg"
                    ? "Gutenberg URL or ID"
                    : "Mochi export"
                }
                value=""
                onChange={() => {}}
                disabled
                placeholder={
                  method === "gutenberg"
                    ? "gutenberg.org/ebooks/2701"
                    : "mochi-export.json"
                }
              />
              <p className="ingest__note">Coming soon.</p>
            </div>
          )}

          {method === "pdf" && formError && (
            <p className="ingest__error" role="alert">
              {formError}
            </p>
          )}
        </section>
      )}

      {job && progress && (
        <section className="ingest__job">
          {backgrounded ? (
            <p className="ingest__note">
              This keeps running. Progress is in System.
            </p>
          ) : (
            <JobStatus
              state={progress.state}
              stage={stageLine(job, progress)}
              progress={
                progress.state === "running"
                  ? (progress.done + progress.failed) / Math.max(job.total, 1)
                  : undefined
              }
              onBackground={() => setBackgrounded(true)}
            />
          )}

          {terminal && (
            <div className="ingest__job-actions">
              <a
                className="btn btn--primary"
                href={`/triage?source=${job.sourceId}`}
              >
                Continue to triage
              </a>
              <Button variant="quiet" onClick={reset}>
                Ingest more
              </Button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function stageLine(job: ActiveJob, progress: ProgressView): string {
  const noun = job.unit === "page" ? "pages" : "chunks";
  if (progress.state === "queued") return "Queued…";
  if (progress.state === "running") {
    const at = Math.min(progress.done + progress.failed + 1, job.total);
    return `Reading ${job.unit} ${at} of ${job.total}`;
  }
  if (progress.state === "failed") {
    return `Couldn't read ${progress.failed} ${noun}. ${progress.done} read — continue to triage, or retry.`;
  }
  // done
  return `Done · ${progress.done} of ${job.total} ${noun} read.`;
}
