import { useCallback, useEffect, useState } from "react";
import type { GrammarCategoryView, GrammarTopicView } from "@estudio/shared";
import { Button, EmptyState, JobStatus, type JobState } from "../components";
import { ApiError, fetchGrammar, fetchJobs, seedGrammar } from "./grammarApi";
import "./Grammar.css";

interface GrammarProps {
  /** Poll interval for the seeding job; overridable in tests. */
  pollIntervalMs?: number;
}

/** Coarse curriculum-build progress the seed job streams onto its job row. */
interface SeedProgress {
  phase: "generating" | "writing";
  categories: number;
  topics: number;
}

function readSeedProgress(progress: unknown): SeedProgress | null {
  if (
    progress &&
    typeof progress === "object" &&
    "phase" in progress &&
    (progress.phase === "generating" || progress.phase === "writing")
  ) {
    const p = progress as Record<string, unknown>;
    return {
      phase: progress.phase,
      categories: typeof p.categories === "number" ? p.categories : 0,
      topics: typeof p.topics === "number" ? p.topics : 0,
    };
  }
  return null;
}

/** The stage line under the seeding spinner; counts appear once they stream. */
function seedStageLine(progress: SeedProgress | null): string {
  if (progress?.phase === "writing") {
    const cats = `${progress.categories} ${progress.categories === 1 ? "category" : "categories"}`;
    const tops = `${progress.topics} ${progress.topics === 1 ? "topic" : "topics"}`;
    return `Writing ${cats} · ${tops}…`;
  }
  return "Building your grammar curriculum… ~30s";
}

/**
 * Row meta in the machine voice: "quizzed twice · seen in 2 lessons · 80%", or
 * "unread" when the topic has no quizzes, no lesson sightings, and zero mastery.
 */
function masteryLabel(t: GrammarTopicView): string {
  const parts: string[] = [];
  if (t.quizCount === 1) parts.push("quizzed once");
  else if (t.quizCount === 2) parts.push("quizzed twice");
  else if (t.quizCount > 2) parts.push(`quizzed ${t.quizCount}×`);
  if (t.seenInLessons > 0) {
    parts.push(
      `seen in ${t.seenInLessons} ${t.seenInLessons === 1 ? "lesson" : "lessons"}`,
    );
  }
  if (t.mastery > 0) parts.push(`${Math.round(t.mastery * 100)}%`);
  return parts.length > 0 ? parts.join(" · ") : "unread";
}

/** Tapping a topic opens its lesson (generated on first open, cached after). */
function lessonHref(topic: GrammarTopicView): string {
  return `/grammar/topics/${topic.id}/lesson`;
}

function TopicRow({ topic }: { topic: GrammarTopicView }) {
  return (
    <li className="grammar__topic">
      <a className="grammar__topic-link" href={lessonHref(topic)}>
        <span className="grammar__topic-name">{topic.name}</span>
        <span className="grammar__topic-meta">{masteryLabel(topic)}</span>
      </a>
    </li>
  );
}

function PracticeRow({ topic }: { topic: GrammarTopicView }) {
  return (
    <li className="grammar__topic">
      <a className="grammar__topic-link" href={lessonHref(topic)}>
        <span className="grammar__topic-name">{topic.name}</span>
        <span className="grammar__topic-meta">{masteryLabel(topic)}</span>
      </a>
      <Button
        variant="quiet"
        onClick={() => window.location.assign(lessonHref(topic))}
      >
        Review
      </Button>
    </li>
  );
}

export function Grammar({ pollIntervalMs = 1000 }: GrammarProps) {
  const [seeded, setSeeded] = useState<boolean | null>(null);
  const [categories, setCategories] = useState<GrammarCategoryView[]>([]);
  const [practiceQueue, setPracticeQueue] = useState<GrammarTopicView[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [seedJobId, setSeedJobId] = useState<number | null>(null);
  const [seedState, setSeedState] = useState<JobState | null>(null);
  const [seedProgress, setSeedProgress] = useState<SeedProgress | null>(null);
  const [seedError, setSeedError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const home = await fetchGrammar();
      setSeeded(home.seeded);
      setCategories(home.categories);
      setPracticeQueue(home.practiceQueue);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Couldn't load the curriculum.",
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startSeeding = useCallback(async () => {
    setSeedError(null);
    setSeedProgress(null);
    setSeedState("queued");
    try {
      const { jobId } = await seedGrammar();
      setSeedJobId(jobId);
    } catch (err) {
      setSeedState(null);
      setSeedError(
        err instanceof ApiError
          ? err.message
          : "Couldn't start seeding the curriculum.",
      );
      if (err instanceof ApiError && err.code === "already_seeded") {
        void load(); // someone else seeded it; show what's there
      }
    }
  }, [load]);

  // Poll the seeding job until it reaches a terminal state, then reload.
  useEffect(() => {
    if (seedJobId === null) return;
    let active = true;

    const poll = async () => {
      try {
        const jobs = await fetchJobs();
        const view = jobs.find((j) => j.id === seedJobId);
        if (!active || !view) return;
        setSeedState(view.status as JobState);
        setSeedProgress(readSeedProgress(view.progress));
        if (view.status === "done") {
          setSeedJobId(null);
          void load();
        } else if (view.status === "failed") {
          setSeedJobId(null);
          setSeedError("The curriculum didn't finish generating. Retry.");
        }
      } catch {
        // Transient poll failure: keep the last known state and retry.
      }
    };

    void poll();
    const timer = setInterval(() => void poll(), pollIntervalMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [seedJobId, pollIntervalMs, load]);

  const seeding = seedState === "queued" || seedState === "running";

  return (
    <main className="grammar">
      {loadError ? (
        <EmptyState
          message={`${loadError} Reload, or check System for details.`}
        >
          <Button variant="secondary" onClick={() => void load()}>
            Reload
          </Button>
        </EmptyState>
      ) : seeded === null ? (
        <p className="grammar__status">Loading…</p>
      ) : !seeded ? (
        <div className="grammar__empty">
          {seeding ? (
            <JobStatus
              state={seedState as JobState}
              stage={seedStageLine(seedProgress)}
            />
          ) : (
            <EmptyState message="No grammar curriculum yet. Seed it to get a B1–C1 set of topics.">
              <Button variant="secondary" onClick={() => void startSeeding()}>
                Seed the curriculum
              </Button>
            </EmptyState>
          )}
          {seedError && (
            <JobStatus
              state="failed"
              stage={seedError}
              onRetry={() => void startSeeding()}
            />
          )}
        </div>
      ) : (
        <>
          {practiceQueue.length > 0 && (
            <section className="grammar__practice" aria-label="Practice next">
              <h2 className="grammar__section-header">PRACTICE NEXT</h2>
              <ul className="grammar__topics">
                {practiceQueue.map((t) => (
                  <PracticeRow key={`pq-${t.id}`} topic={t} />
                ))}
              </ul>
            </section>
          )}

          {categories.map((cat) => (
            <section
              key={cat.id}
              className="grammar__category"
              aria-label={cat.name}
            >
              <h2 className="grammar__category-name">{cat.name}</h2>
              <ul className="grammar__topics">
                {cat.topics.map((t) => (
                  <TopicRow key={t.id} topic={t} />
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </main>
  );
}
