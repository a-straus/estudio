import { useCallback, useEffect, useState } from "react";
import type {
  LessonInsightView,
  LessonListItem,
  LessonRecordingView,
  CorrectionPayload,
  StruggleSentencePayload,
  FlaggedWordPayload,
  TopicCoveredPayload,
} from "@estudio/shared";
import { Button, EmptyState, JobStatus, WordEntry } from "../components";
import { InsightRow } from "../components/InsightRow";
import { ApiError, fetchLesson, fetchLessons } from "./lessonsApi";
import { monthDay } from "../format";
import "./Lessons.css";

const MAX_SECTION = 10;

function triageLabel(w: LessonInsightView): string {
  const s = w.wordStatus;
  if (!s) return "IN TRIAGE";
  if (s === "mature" || s === "known") return "KNOWN";
  return "LEARNING";
}

function summaryLine(row: LessonListItem): string {
  const parts: string[] = [];
  if (row.flaggedWordCount > 0)
    parts.push(`${row.flaggedWordCount} flagged`);
  if (row.correctionCount > 0)
    parts.push(`${row.correctionCount} corrections`);
  if (row.topicCount > 0)
    parts.push(`${row.topicCount} topics`);
  return parts.join(" · ");
}

function titleLine(row: LessonListItem): string {
  const date = monthDay(row.createdAt);
  const dur = row.durationMinutes !== null ? ` · ${Math.round(row.durationMinutes)} min` : "";
  return `Lesson · ${date}${dur}`;
}

function jobStageLine(row: LessonListItem): string {
  if (row.jobStatus === "failed") {
    return row.jobError ?? "Processing failed.";
  }
  const phase = row.jobPhase;
  if (phase === "transcribing") return "Transcribing…";
  if (phase === "analyzing") return "Mining the transcript…";
  return "Processing…";
}

function isProcessing(row: LessonListItem): boolean {
  return row.jobStatus === "queued" || row.jobStatus === "running";
}

function isFailed(row: LessonListItem): boolean {
  return row.jobStatus === "failed";
}

function isReady(row: LessonListItem): boolean {
  return row.jobStatus === "done";
}

// ─── Detail sections ─────────────────────────────────────────────────────────

interface TranscriptBlockProps {
  transcript: string | null;
}

function TranscriptBlock({ transcript }: TranscriptBlockProps) {
  const [open, setOpen] = useState(false);
  if (!transcript) return null;
  return (
    <div className="lessons__transcript-block">
      <Button variant="quiet" onClick={() => setOpen((v) => !v)}>
        {open ? "Hide transcript" : "Show transcript"}
      </Button>
      {open && (
        <div className="lessons__transcript">{transcript}</div>
      )}
    </div>
  );
}

interface FlaggedWordsSectionProps {
  words: LessonInsightView[];
}

function FlaggedWordsSection({ words }: FlaggedWordsSectionProps) {
  const [expanded, setExpanded] = useState(false);
  if (words.length === 0) return null;
  const visible = expanded ? words : words.slice(0, MAX_SECTION);
  const remaining = words.length - MAX_SECTION;
  return (
    <section className="lessons__section">
      <h2 className="lessons__section-header">FLAGGED WORDS</h2>
      <div className="lessons__entries">
        {visible.map((w) => {
          const p = w.payload as FlaggedWordPayload;
          return (
            <div key={w.id} className="lessons__flagged-row">
              <WordEntry
                size="compact"
                headword={p.term}
                lemma={p.lemma ?? undefined}
                partOfSpeech={p.partOfSpeech ?? undefined}
                glossEn={p.definitionEn ?? undefined}
              />
              <span className="lessons__triage-stamp">{triageLabel(w)}</span>
            </div>
          );
        })}
      </div>
      {!expanded && remaining > 0 && (
        <Button variant="quiet" onClick={() => setExpanded(true)}>
          All {words.length} →
        </Button>
      )}
    </section>
  );
}

interface CorrectionsSectionProps {
  corrections: LessonInsightView[];
}

function CorrectionsSection({ corrections }: CorrectionsSectionProps) {
  const [expanded, setExpanded] = useState(false);
  if (corrections.length === 0) return null;
  const visible = expanded ? corrections : corrections.slice(0, MAX_SECTION);
  const remaining = corrections.length - MAX_SECTION;
  return (
    <section className="lessons__section">
      <h2 className="lessons__section-header">CORRECTIONS</h2>
      <div className="lessons__insight-list">
        {visible.map((c) => (
          <InsightRow
            key={c.id}
            kind="correction"
            payload={c.payload as CorrectionPayload}
          />
        ))}
      </div>
      {!expanded && remaining > 0 && (
        <Button variant="quiet" onClick={() => setExpanded(true)}>
          All {corrections.length} →
        </Button>
      )}
    </section>
  );
}

interface StruggleSectionProps {
  struggles: LessonInsightView[];
}

function StruggleSection({ struggles }: StruggleSectionProps) {
  const [expanded, setExpanded] = useState(false);
  if (struggles.length === 0) return null;
  const visible = expanded ? struggles : struggles.slice(0, MAX_SECTION);
  const remaining = struggles.length - MAX_SECTION;
  return (
    <section className="lessons__section">
      <h2 className="lessons__section-header">STRUGGLE SENTENCES</h2>
      <div className="lessons__insight-list">
        {visible.map((s) => (
          <InsightRow
            key={s.id}
            kind="struggle"
            payload={s.payload as StruggleSentencePayload}
          />
        ))}
      </div>
      {!expanded && remaining > 0 && (
        <Button variant="quiet" onClick={() => setExpanded(true)}>
          All {struggles.length} →
        </Button>
      )}
    </section>
  );
}

interface TopicsSectionProps {
  topics: LessonInsightView[];
}

function TopicsSection({ topics }: TopicsSectionProps) {
  const [expanded, setExpanded] = useState(false);
  if (topics.length === 0) return null;
  const visible = expanded ? topics : topics.slice(0, MAX_SECTION);
  const remaining = topics.length - MAX_SECTION;
  return (
    <section className="lessons__section">
      <h2 className="lessons__section-header">TOPICS COVERED</h2>
      <div className="lessons__topic-list">
        {visible.map((t) => {
          const p = t.payload as TopicCoveredPayload;
          const href = t.topicId
            ? `/grammar/topics/${t.topicId}/lesson`
            : undefined;
          return (
            <div key={t.id} className="lessons__topic-row">
              <span className="lessons__topic-name">{p.name}</span>
              {href && (
                <Button variant="quiet" onClick={() => { window.location.href = href; }}>
                  Open topic
                </Button>
              )}
            </div>
          );
        })}
      </div>
      {!expanded && remaining > 0 && (
        <Button variant="quiet" onClick={() => setExpanded(true)}>
          All {topics.length} →
        </Button>
      )}
    </section>
  );
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

interface DetailPanelProps {
  detail: LessonRecordingView;
}

function DetailPanel({ detail }: DetailPanelProps) {
  return (
    <div className="lessons__detail">
      <FlaggedWordsSection words={detail.insights.flaggedWords} />
      <CorrectionsSection corrections={detail.insights.corrections} />
      <StruggleSection struggles={detail.insights.struggleSentences} />
      <TopicsSection topics={detail.insights.topicsCovered} />
      <TranscriptBlock transcript={detail.source.transcript} />
    </div>
  );
}

// ─── Mobile detail view ───────────────────────────────────────────────────────

interface MobileDetailViewProps {
  row: LessonListItem;
  detail: LessonRecordingView | null;
  loading: boolean;
  error: string | null;
  onBack: () => void;
}

function MobileDetailView({
  row,
  detail,
  loading,
  error,
  onBack,
}: MobileDetailViewProps) {
  return (
    <div className="lessons__mobile-detail">
      <button className="lessons__back-btn" onClick={onBack} type="button">
        ← {titleLine(row)}
      </button>
      {loading && <p className="lessons__loading">Loading…</p>}
      {error && <p className="lessons__error" role="alert">{error}</p>}
      {detail && <DetailPanel detail={detail} />}
    </div>
  );
}

// ─── List row ─────────────────────────────────────────────────────────────────

interface ListRowProps {
  row: LessonListItem;
  selected: boolean;
  onSelect: () => void;
  desktopDetailOpen: boolean;
  desktopDetail: LessonRecordingView | null;
  desktopLoading: boolean;
  desktopError: string | null;
}

function ListRow({
  row,
  selected,
  onSelect,
  desktopDetailOpen,
  desktopDetail,
  desktopLoading,
  desktopError,
}: ListRowProps) {
  const processing = isProcessing(row);
  const failed = isFailed(row);
  const ready = isReady(row);
  const summary = summaryLine(row);

  return (
    <>
      <button
        className={`lessons__row${selected && desktopDetailOpen ? " lessons__row--selected" : ""}`}
        onClick={onSelect}
        type="button"
        disabled={!ready && !processing && !failed}
      >
        <span className="lessons__row-title">{titleLine(row)}</span>
        {processing && (
          <span className="lessons__row-status">
            <JobStatus
              state={row.jobStatus === "running" ? "running" : "queued"}
              stage={jobStageLine(row)}
            />
          </span>
        )}
        {failed && (
          <span className="lessons__row-status">
            <JobStatus
              state="failed"
              stage={jobStageLine(row)}
            />
          </span>
        )}
        {ready && summary && (
          <span className="lessons__row-meta">{summary}</span>
        )}
      </button>
      {/* Desktop accordion: detail opens inline below the row */}
      {desktopDetailOpen && (
        <div className="lessons__accordion">
          {desktopLoading && <p className="lessons__loading">Loading…</p>}
          {desktopError && (
            <p className="lessons__error" role="alert">{desktopError}</p>
          )}
          {desktopDetail && <DetailPanel detail={desktopDetail} />}
        </div>
      )}
    </>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function Lessons() {
  const [lessons, setLessons] = useState<LessonListItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<LessonRecordingView | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [mobileMode, setMobileMode] = useState<"list" | "detail">("list");

  useEffect(() => {
    fetchLessons()
      .then(setLessons)
      .catch((err) => {
        setLoadError(
          err instanceof ApiError ? err.message : "Couldn't load lessons.",
        );
      });
  }, []);

  const loadDetail = useCallback((sourceId: number) => {
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    fetchLesson(sourceId)
      .then((d) => {
        setDetail(d);
        setDetailLoading(false);
      })
      .catch((err) => {
        setDetailError(
          err instanceof ApiError ? err.message : "Couldn't load lesson.",
        );
        setDetailLoading(false);
      });
  }, []);

  const handleSelect = useCallback(
    (row: LessonListItem) => {
      if (!isReady(row)) return;
      const isMobile = window.matchMedia("(max-width: 959px)").matches;
      if (isMobile) {
        setSelectedId(row.sourceId);
        setMobileMode("detail");
        loadDetail(row.sourceId);
      } else {
        if (selectedId === row.sourceId) {
          // Toggle off
          setSelectedId(null);
          setDetail(null);
        } else {
          setSelectedId(row.sourceId);
          loadDetail(row.sourceId);
        }
      }
    },
    [selectedId, loadDetail],
  );

  const handleBack = useCallback(() => {
    setMobileMode("list");
    setSelectedId(null);
    setDetail(null);
  }, []);

  if (loadError) {
    return (
      <main className="lessons">
        <h1 className="lessons__title">Lessons</h1>
        <p className="lessons__error" role="alert">{loadError}</p>
      </main>
    );
  }

  if (lessons === null) {
    return (
      <main className="lessons">
        <h1 className="lessons__title">Lessons</h1>
        <p className="lessons__loading">Loading…</p>
      </main>
    );
  }

  if (lessons.length === 0) {
    return (
      <main className="lessons">
        <h1 className="lessons__title">Lessons</h1>
        <EmptyState message="No lessons yet. Upload a recording from Ingest.">
          <Button variant="quiet" onClick={() => { window.location.href = "/ingest"; }}>
            Go to Ingest
          </Button>
        </EmptyState>
      </main>
    );
  }

  const selectedRow = lessons.find((r) => r.sourceId === selectedId) ?? null;

  // Mobile: show detail view when one is selected
  if (mobileMode === "detail" && selectedRow) {
    return (
      <main className="lessons">
        <MobileDetailView
          row={selectedRow}
          detail={detail}
          loading={detailLoading}
          error={detailError}
          onBack={handleBack}
        />
      </main>
    );
  }

  return (
    <main className="lessons">
      <h1 className="lessons__title">Lessons</h1>
      <div className="lessons__list">
        {lessons.map((row) => (
          <ListRow
            key={row.sourceId}
            row={row}
            selected={selectedId === row.sourceId}
            onSelect={() => handleSelect(row)}
            desktopDetailOpen={selectedId === row.sourceId}
            desktopDetail={selectedId === row.sourceId ? detail : null}
            desktopLoading={selectedId === row.sourceId && detailLoading}
            desktopError={selectedId === row.sourceId ? detailError : null}
          />
        ))}
      </div>
    </main>
  );
}
