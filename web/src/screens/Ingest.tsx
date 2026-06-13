import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  JobStatus,
  SegmentedControl,
  TextInput,
  type JobState,
} from "../components";
import type { GutenbergEstimateResponse } from "@estudio/shared";
import {
  confirmGutenberg,
  fetchJobs,
  submitAudio,
  submitGutenberg,
  submitText,
  uploadPdf,
  uploadMochi,
  ApiError,
  type MochiImportResponse,
} from "./ingestApi";
import "./Ingest.css";

type Method = "pdf" | "paste" | "audio" | "gutenberg" | "import";

const METHODS = [
  { value: "pdf", label: "Upload PDF" },
  { value: "paste", label: "Paste text" },
  { value: "audio", label: "Lesson audio" },
  { value: "gutenberg", label: "Gutenberg" },
  { value: "import", label: "Import" },
];

/** A submitted ingestion we are tracking to completion. */
interface ActiveJob {
  sourceId: number;
  jobId: number;
  /** "page" (PDF) or "chunk" (text) or "minute" (audio) — the unit named in the stage line. */
  unit: "page" | "chunk" | "minute";
  total: number;
  /** Audio jobs link to /lessons on completion; other jobs link to /triage. */
  isAudio?: boolean;
  /** Upfront cost estimate shown during audio job progress. */
  costEstimateUsd?: number;
}

interface ProgressView {
  state: JobState;
  done: number;
  failed: number;
  /** Total units, from the job's progress JSON when present. */
  total: number | null;
  /** Phase string for audio jobs: "transcribing" | "analyzing" | "done". */
  phase?: string | null;
}

interface IngestProps {
  /** Poll interval for job progress; overridable in tests. */
  pollIntervalMs?: number;
}

function readProgress(progress: unknown): {
  done: number;
  failed: number;
  total: number | null;
  phase: string | null;
} {
  let done = 0;
  let failed = 0;
  let total: number | null = null;
  let phase: string | null = null;
  if (progress && typeof progress === "object") {
    if (
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
      if ("total" in progress && typeof progress.total === "number") {
        total = progress.total;
      }
    }
    if ("phase" in progress && typeof progress.phase === "string") {
      phase = progress.phase;
    }
  }
  return { done, failed, total, phase };
}

export function Ingest({ pollIntervalMs = 1000 }: IngestProps) {
  const [method, setMethod] = useState<Method>("pdf");
  const [pasteText, setPasteText] = useState("");
  const [gutenbergRef, setGutenbergRef] = useState("");
  const [estimate, setEstimate] = useState<GutenbergEstimateResponse | null>(
    null,
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [job, setJob] = useState<ActiveJob | null>(null);
  const [progress, setProgress] = useState<ProgressView | null>(null);
  const [backgrounded, setBackgrounded] = useState(false);
  const [mochiResult, setMochiResult] = useState<MochiImportResponse | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const mochiInputRef = useRef<HTMLInputElement>(null);

  const wordCount =
    pasteText.trim() === "" ? 0 : pasteText.trim().split(/\s+/).length;

  const reset = useCallback(() => {
    setJob(null);
    setProgress(null);
    setBackgrounded(false);
    setFormError(null);
    setEstimate(null);
    setMochiResult(null);
  }, []);

  const onPickMochi = useCallback(async (file: File) => {
    setSubmitting(true);
    setFormError(null);
    setMochiResult(null);
    try {
      const res = await uploadMochi(file);
      setMochiResult(res);
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Couldn't read that file.",
      );
    } finally {
      setSubmitting(false);
    }
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
      setProgress({ state: "queued", done: 0, failed: 0, total: null, phase: null });
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
      setProgress({ state: "queued", done: 0, failed: 0, total: null, phase: null });
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Couldn't read that file.",
      );
    } finally {
      setSubmitting(false);
    }
  }, []);

  const onPickAudio = useCallback(async (file: File) => {
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await submitAudio(file);
      setJob({
        sourceId: res.source.id,
        jobId: res.jobId,
        unit: "minute",
        total: 0,
        isAudio: true,
        costEstimateUsd: res.costEstimateUsd,
      });
      setProgress({ state: "queued", done: 0, failed: 0, total: null, phase: null });
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Couldn't read that audio file.",
      );
    } finally {
      setSubmitting(false);
    }
  }, []);

  // Step 1: fetch the book + get the upfront estimate (no spend yet).
  const onEstimateGutenberg = useCallback(async () => {
    if (gutenbergRef.trim() === "") {
      setFormError("Enter a Gutenberg URL or ID first.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await submitGutenberg({ ref: gutenbergRef.trim() });
      setEstimate(res);
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Couldn't fetch that book.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [gutenbergRef]);

  // Step 2: owner confirms the spend → start the resumable classification job.
  const onConfirmGutenberg = useCallback(async () => {
    if (!estimate) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await confirmGutenberg(estimate.sourceId);
      setJob({
        sourceId: res.sourceId,
        jobId: res.jobId,
        unit: "chunk",
        total: res.pageCount,
        costEstimateUsd: estimate.estimateUsd,
      });
      setProgress({
        state: "queued",
        done: 0,
        failed: 0,
        total: null,
        phase: null,
      });
      setEstimate(null);
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Couldn't start extraction.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [estimate]);

  // Poll job progress until the job reaches a terminal state (or is backgrounded).
  useEffect(() => {
    if (!job || backgrounded) return;
    let active = true;

    const poll = async () => {
      try {
        const jobs = await fetchJobs();
        const view = jobs.find((j) => j.id === job.jobId);
        if (!active || !view) return;
        const { done, failed, total, phase } = readProgress(view.progress);
        setProgress({ state: view.status as JobState, done, failed, total, phase });
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

          {method === "audio" && (
            <div className="ingest__dropzone">
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*,.m4a,.mp3,.wav,.ogg,.webm,.aac,.flac,.opus"
                className="ingest__file-input"
                aria-label="Choose a lesson recording"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onPickAudio(file);
                }}
              />
              <Button
                variant="secondary"
                busy={submitting}
                busyLabel="Uploading…"
                onClick={() => audioInputRef.current?.click()}
              >
                Drop a lesson recording, or browse
              </Button>
              {formError && (
                <p className="ingest__error" role="alert">
                  {formError}
                </p>
              )}
            </div>
          )}

          {method === "gutenberg" && !estimate && (
            <div className="ingest__paste">
              <TextInput
                label="Gutenberg URL or ID"
                value={gutenbergRef}
                onChange={setGutenbergRef}
                placeholder="gutenberg.org/ebooks/10"
                error={formError ?? undefined}
                help="A Project Gutenberg ebook URL or its numeric ID."
              />
              <Button
                variant="primary"
                busy={submitting}
                busyLabel="Fetching…"
                disabled={gutenbergRef.trim() === ""}
                onClick={() => void onEstimateGutenberg()}
              >
                Fetch &amp; estimate
              </Button>
            </div>
          )}

          {method === "gutenberg" && estimate && (
            <div className="ingest__estimate">
              <p className="ingest__estimate-line">
                {estimate.title} · ~{estimate.wordCount.toLocaleString()} unique
                candidate words · est. ${estimate.estimateUsd.toFixed(2)}
              </p>
              {estimate.estimateUsd > 5 && (
                <p className="ingest__note" role="alert">
                  This is a large book. Extracting it will spend about{" "}
                  <strong>${estimate.estimateUsd.toFixed(2)}</strong> in one
                  operation. It won't start until you confirm.
                </p>
              )}
              <div className="ingest__job-actions">
                <Button
                  variant="primary"
                  busy={submitting}
                  busyLabel="Starting…"
                  onClick={() => void onConfirmGutenberg()}
                >
                  Extract words
                </Button>
                <Button variant="quiet" onClick={reset}>
                  Cancel
                </Button>
              </div>
              {formError && (
                <p className="ingest__error" role="alert">
                  {formError}
                </p>
              )}
            </div>
          )}

          {method === "import" && (
            <div className="ingest__dropzone">
              <input
                ref={mochiInputRef}
                type="file"
                accept=".mochi"
                className="ingest__file-input"
                aria-label="Choose a Mochi export"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onPickMochi(file);
                }}
              />
              <Button
                variant="primary"
                busy={submitting}
                busyLabel="Importing…"
                onClick={() => mochiInputRef.current?.click()}
              >
                Choose a Mochi export (.mochi)
              </Button>
              {mochiResult && (
                <p className="ingest__note">
                  {mochiResult.total.toLocaleString()} cards ·{" "}
                  {mochiResult.imported.toLocaleString()} added ·{" "}
                  {mochiResult.duplicates.toLocaleString()} already in your deck
                  {mochiResult.malformed > 0 &&
                    ` · ${mochiResult.malformed.toLocaleString()} malformed`}
                </p>
              )}
              {formError && (
                <p className="ingest__error" role="alert">
                  {formError}
                </p>
              )}
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
          {job.costEstimateUsd !== undefined && (
            <p className="ingest__note">
              {job.isAudio
                ? `est. $${job.costEstimateUsd.toFixed(2)} transcription`
                : `est. $${job.costEstimateUsd.toFixed(2)}`}
            </p>
          )}
          {backgrounded ? (
            <p className="ingest__note">
              This keeps running. Progress is in System.
            </p>
          ) : (
            <JobStatus
              state={progress.state}
              stage={stageLine(job, progress)}
              progress={
                progress.state === "running" && !job.isAudio
                  ? (progress.done + progress.failed) /
                    Math.max(progress.total ?? job.total, 1)
                  : undefined
              }
              onBackground={() => setBackgrounded(true)}
            />
          )}

          {terminal && (
            <div className="ingest__job-actions">
              {job.isAudio ? (
                <a className="btn btn--primary" href="/lessons">
                  View lesson
                </a>
              ) : (
                <a
                  className="btn btn--primary"
                  href={`/triage?source=${job.sourceId}`}
                >
                  Continue to triage
                </a>
              )}
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
  if (job.isAudio) {
    if (progress.state === "queued") return "Queued…";
    if (progress.state === "done") return "Done.";
    if (progress.state === "failed") return "Processing failed.";
    const phase = progress.phase;
    if (phase === "transcribing") return "Transcribing…";
    if (phase === "analyzing") return "Mining the transcript…";
    return "Processing…";
  }
  const noun = job.unit === "page" ? "pages" : "chunks";
  // The job's progress JSON is the authoritative total once it streams; fall
  // back to the count the submit response reported until the first poll lands.
  const total = progress.total ?? job.total;
  if (progress.state === "queued") return "Queued…";
  if (progress.state === "running") {
    const at = Math.min(progress.done + progress.failed + 1, total);
    return `Reading ${job.unit} ${at} of ${total}`;
  }
  if (progress.state === "failed") {
    return `Couldn't read ${progress.failed} ${noun}. ${progress.done} read — continue to triage, or retry.`;
  }
  // done
  return `Read ${progress.done} of ${total} ${noun}.`;
}
