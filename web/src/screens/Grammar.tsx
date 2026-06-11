import { useCallback, useEffect, useState } from "react";
import type { GrammarCategoryView, GrammarTopicView } from "@estudio/shared";
import { Button, EmptyState, JobStatus, type JobState } from "../components";
import { ApiError, fetchGrammar, fetchJobs, seedGrammar } from "./grammarApi";
import "./Grammar.css";

interface GrammarProps {
  /** Poll interval for the seeding job; overridable in tests. */
  pollIntervalMs?: number;
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

function TopicRow({ topic }: { topic: GrammarTopicView }) {
  return (
    <li className="grammar__topic">
      <span className="grammar__topic-name">{topic.name}</span>
      <span className="grammar__topic-meta">{masteryLabel(topic)}</span>
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
      <h1 className="grammar__title">Grammar</h1>

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
              stage="Building your grammar curriculum… ~30s"
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
                  <TopicRow key={`pq-${t.id}`} topic={t} />
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

          <p className="grammar__coming-soon">Lessons coming soon.</p>
        </>
      )}
    </main>
  );
}
