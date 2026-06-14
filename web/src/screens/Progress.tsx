import { useCallback, useEffect, useState } from "react";
import type { ProgressMasteryTopic, ProgressSummary } from "@estudio/shared";
import { EmptyState, ProgressStat } from "../components";
import { fetchProgress } from "./progressApi";
import "./Progress.css";

const EM_DASH = "—";
const COVERAGE_THRESHOLD = 6;
const COVERAGE_VISIBLE = 5;

// ---- chart helpers ----

function PillTrack({ pct }: { pct: number }) {
  const filled = Math.min(5, Math.round(pct / 20));
  return (
    <span className="progress__pills" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={
            "progress__pill" + (i < filled ? " progress__pill--filled" : "")
          }
        />
      ))}
    </span>
  );
}

function ForecastBars({
  forecast,
}: {
  forecast: ProgressSummary["dueForecast"];
}) {
  const max = Math.max(...forecast.map((f) => f.count), 0);
  return (
    <div className="progress__forecast">
      <div
        className="progress__bars"
        role="img"
        aria-label="Due, next 14 days"
      >
        {forecast.map((day, idx) => {
          const h =
            max === 0 ? 0 : Math.max(2, Math.round((day.count / max) * 48));
          return (
            <div
              key={day.date}
              className={
                "progress__bar" + (idx === 0 ? " progress__bar--today" : "")
              }
              style={{ height: `${h}px` }}
            />
          );
        })}
      </div>
      {max > 0 && <p className="progress__chart-annotation">{max}</p>}
    </div>
  );
}

function AccuracyLine({ sessions }: { sessions: number[] }) {
  const W = 200,
    H = 48,
    M = 4;
  const hasLine = sessions.length >= 2;
  const pts = hasLine
    ? sessions
        .map((pct, i) => {
          const x = (i / (sessions.length - 1)) * W;
          const y = H - M - (pct / 100) * (H - 2 * M);
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ")
    : "";

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      preserveAspectRatio="none"
      className="progress__accuracy-chart"
      aria-hidden="true"
    >
      <line
        x1={0}
        y1={H - 1}
        x2={W}
        y2={H - 1}
        stroke="var(--color-rule)"
        strokeWidth={1}
      />
      {hasLine && (
        <polyline
          points={pts}
          fill="none"
          stroke="var(--color-ink-soft)"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

// ---- error state ----

function SectionError({ onRetry }: { onRetry: () => void }) {
  return (
    <p className="progress__error">
      {"Couldn't compute. "}
      <button className="progress__retry" onClick={onRetry}>
        Retry.
      </button>
    </p>
  );
}

// ---- grammar mastery heatmap ----

function MasteryHeatmap({ topics }: { topics: ProgressMasteryTopic[] }) {
  // Group flat array by category, preserving order
  const groups: { category: string; topics: ProgressMasteryTopic[] }[] = [];
  for (const topic of topics) {
    const last = groups[groups.length - 1];
    if (last && last.category === topic.category) {
      last.topics.push(topic);
    } else {
      groups.push({ category: topic.category, topics: [topic] });
    }
  }

  return (
    <div className="progress__mastery">
      {groups.map((group) => (
        <div key={group.category} className="progress__mastery-group">
          <span className="progress__mastery-category">{group.category}</span>
          <div className="progress__mastery-cells">
            {group.topics.map((topic) => (
              <div
                key={topic.topicId}
                className="progress__mastery-cell"
                title={topic.name}
                aria-label={topic.name}
              >
                <div
                  className="progress__mastery-fill"
                  style={{ opacity: Math.max(0.12, topic.mastery) }}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="progress__mastery-legend">Less practiced → more</p>
    </div>
  );
}

// ---- main component ----

/**
 * Progress — honest mastery view: status counts, due forecast, quiz accuracy,
 * and per-source book coverage. Ordinary full-chrome screen (no session takeover).
 */
export function Progress() {
  const [data, setData] = useState<ProgressSummary | Error | undefined>(
    undefined,
  );
  const [showAllCoverage, setShowAllCoverage] = useState(false);

  const load = useCallback(() => {
    setData(undefined);
    fetchProgress().then(setData, (err: unknown) => {
      setData(err instanceof Error ? err : new Error("Failed to load."));
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loading = data === undefined;
  const error = data instanceof Error ? data : null;
  const summary = !loading && !error ? (data as ProgressSummary) : null;

  const isEmptyLibrary =
    summary !== null &&
    summary.counts.new === 0 &&
    summary.counts.learning === 0 &&
    summary.counts.mature === 0;

  const coverage = summary?.coverage ?? [];
  const showOverflow = !showAllCoverage && coverage.length > COVERAGE_THRESHOLD;
  const visibleCoverage = showOverflow
    ? coverage.slice(0, COVERAGE_VISIBLE)
    : coverage;

  return (
    <main className="progress">
      <h1 className="progress__title">Progress</h1>

      {/* 1. Status counts — three ProgressStats in a horizontal row */}
      <div className="progress__counts">
        <ProgressStat
          count={loading ? null : (summary?.counts.new ?? 0)}
          unit="new"
        />
        <ProgressStat
          count={loading ? null : (summary?.counts.learning ?? 0)}
          unit="learning"
        />
        <ProgressStat
          count={loading ? null : (summary?.counts.mature ?? 0)}
          unit="mature"
        />
      </div>

      {isEmptyLibrary && (
        <EmptyState message="No words yet. Add a PDF or paste text to begin." />
      )}

      {/* 2 + 3. Charts — stack on mobile, two-up at bp-desktop */}
      <div className="progress__charts">
        {/* Due forecast */}
        <section className="progress__section" aria-label="Due forecast">
          <h2 className="progress__section-title">Due, next 14 days</h2>
          {loading && <p className="progress__loading">{EM_DASH}</p>}
          {error && <SectionError onRetry={load} />}
          {summary && <ForecastBars forecast={summary.dueForecast} />}
        </section>

        {/* Quiz accuracy */}
        <section className="progress__section" aria-label="Quiz accuracy">
          <h2 className="progress__section-title">Quiz accuracy</h2>
          {loading && <p className="progress__loading">{EM_DASH}</p>}
          {error && <SectionError onRetry={load} />}
          {summary && (
            <>
              <AccuracyLine sessions={summary.quizAccuracy.sessions} />
              <p className="progress__accuracy-sentence">
                {"Last 20 sessions · "}
                {summary.quizAccuracy.average !== null
                  ? `${summary.quizAccuracy.average}% average`
                  : `${EM_DASH} average`}
              </p>
            </>
          )}
        </section>
      </div>

      {/* 4. Book coverage */}
      <section className="progress__section" aria-label="Book coverage">
        <h2 className="progress__section-title">Book coverage</h2>
        {loading && <p className="progress__loading">{EM_DASH}</p>}
        {error && <SectionError onRetry={load} />}
        {summary && coverage.length === 0 && (
          <p className="progress__muted">No sources yet.</p>
        )}
        {summary && coverage.length > 0 && (
          <>
            <ul className="progress__coverage">
              {visibleCoverage.map((row) => (
                <li key={row.sourceId} className="progress__coverage-row">
                  <span className="progress__coverage-title">{row.title}</span>
                  <span className="progress__coverage-meta">
                    <PillTrack pct={row.triagedPct} />
                    <span>
                      {row.triagedPct >= 100 ? "done" : `${row.triagedPct}%`}
                      {" · "}
                      {row.wordsKept} kept
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            {showOverflow && (
              <button
                className="progress__show-all"
                onClick={() => setShowAllCoverage(true)}
              >
                All sources →
              </button>
            )}
          </>
        )}
      </section>

      {/* 5. Grammar mastery heatmap */}
      <section className="progress__section" aria-label="Grammar mastery">
        <h2 className="progress__section-title">Grammar mastery</h2>
        {loading && <p className="progress__loading">{EM_DASH}</p>}
        {error && <SectionError onRetry={load} />}
        {summary && summary.grammarMastery.length === 0 && (
          <p className="progress__muted">
            No grammar topics yet — seed the curriculum on Grammar.
          </p>
        )}
        {summary && summary.grammarMastery.length > 0 && (
          <MasteryHeatmap topics={summary.grammarMastery} />
        )}
      </section>

      {/* 6. Footer link to System */}
      <a href="/system" className="progress__footer-link">
        Spend, jobs &amp; backups →
      </a>
    </main>
  );
}
