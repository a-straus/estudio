import { useState } from "react";
import type { OverviewFeatured, OverviewSummary } from "@estudio/shared";
import {
  Button,
  EmptyState,
  HomeHero,
  JobStatus,
  OverviewCard,
  Toast,
  WordEntry,
  type JobState,
  type OverviewState,
} from "../components";
import { monthDay } from "../format";
import { useIsPhone } from "../hooks/useIsPhone";
import "./Home.css";

const EM_DASH = "—";

/** Plain pathname navigation — the app routes on window.location, not a router. */
function go(href: string): void {
  window.location.assign(href);
}

/** The provenance line under the hero entry (home.md). */
function provenance(f: OverviewFeatured): string {
  if (f.reason === "due") return "from your library · due today";
  return f.lastReviewedAt
    ? `mature · last seen ${monthDay(f.lastReviewedAt)}`
    : "mature · worth revisiting";
}

const JOB_STATE: Record<string, JobState> = {
  running: "running",
  queued: "queued",
  done: "done",
  failed: "failed",
  cancelled: "failed",
};

const JOB_LABEL: Record<string, string> = {
  text_ingestion: "Ingesting text",
  pdf_ingestion: "Ingesting a PDF",
  grammar_seed: "Seeding your curriculum",
};

function renderHero(state: OverviewState, isPhone: boolean) {
  // Loading: em-dash headword reserves the hero height (no layout shift).
  if (state.loading) return <HomeHero headword={EM_DASH} />;

  const f = state.summary?.featured;
  if (!f) {
    return (
      <EmptyState message="Your dictionary is empty. Add a PDF or paste text to begin.">
        {!isPhone && (
          <Button variant="secondary" onClick={() => go("/ingest")}>
            Ingest a source
          </Button>
        )}
      </EmptyState>
    );
  }

  const due = state.summary!.review.due;
  const action =
    due > 0
      ? { label: "Start review", href: "/review?autostart=1", sentence: `${due} due today` }
      : {
          label: "Start a quiz",
          href: "/quiz",
          sentence: "nothing due — keep it warm",
        };

  return (
    <HomeHero
      headword={f.word.headword}
      subhead={
        <>
          <WordEntry
            size="full"
            headword={f.word.headword}
            lemma={f.word.lemma ?? undefined}
            language={f.word.language ?? undefined}
            partOfSpeech={f.word.partOfSpeech ?? undefined}
            level={f.word.level ?? undefined}
            glossEs={f.word.glossEs ?? undefined}
            glossEn={f.word.glossEn ?? undefined}
            example={f.word.example ?? undefined}
          />
          <span className="home__provenance">{provenance(f)}</span>
        </>
      }
      primaryAction={
        <>
          <Button onClick={() => go(action.href)}>{action.label}</Button>
          <span className="home__due-sentence">{action.sentence}</span>
        </>
      }
    />
  );
}

interface CardSpec {
  title: string;
  href: string;
  stat?: string;
  blurb: string;
  zero?: boolean;
}

/** The overview grid cards, in the home.md order. Suggestions hides at pool 0. */
function cardSpecs(
  summary: OverviewSummary | undefined,
  loading: boolean,
  isPhone: boolean,
): CardSpec[] {
  const dash = loading ? EM_DASH : undefined;
  const s = summary;
  const hasWords = (s?.library.total ?? 0) > 0;

  const cards: CardSpec[] = [
    hasWords || loading
      ? {
          title: "Review",
          href: "/review",
          stat: dash ?? `${s!.review.due} due · ${s!.review.newToday} new today`,
          blurb: "",
        }
      : {
          title: "Review",
          href: "/review",
          blurb: "Ingest words to start reviewing",
          zero: true,
        },
    {
      title: "Quiz",
      href: "/quiz",
      blurb: "Test yourself · def-match, cloze, or mixed",
    },
    hasWords || loading
      ? {
          title: "Library",
          href: "/library",
          stat: dash ?? `${s!.library.total} words · ${s!.library.mature} mature`,
          blurb: "",
        }
      : {
          title: "Library",
          href: "/library",
          blurb: "No words yet — ingest a PDF to begin",
          zero: true,
        },
    s && !s.grammar.seeded && !loading
      ? {
          title: "Grammar",
          href: "/grammar",
          blurb: "Seed your curriculum to start lessons",
          zero: true,
        }
      : {
          title: "Grammar",
          href: "/grammar",
          stat:
            dash ??
            `${s!.grammar.topics} topics · ${s!.grammar.belowFifty} below 50% mastery`,
          blurb: "",
        },
    ...(!isPhone
      ? [{ title: "Ingest", href: "/ingest", blurb: "Add a PDF or paste text" }]
      : []),
  ];

  // Suggestions: shown only when the pool is non-empty (Phase 2 → hidden now).
  if ((s?.suggestions.pool ?? 0) > 0) {
    cards.push({
      title: "Suggestions",
      href: "/suggestions",
      stat: `${s!.suggestions.pool} words`,
      blurb: "picked for you",
    });
  }

  return cards;
}

function renderActivity(summary: OverviewSummary | undefined, isPhone: boolean) {
  if (!summary) return null;
  const { recentWords, latestJob } = summary;

  if (recentWords.length === 0 && !latestJob) {
    return (
      <EmptyState message="Nothing studied yet. Ingest your first source.">
        {!isPhone && (
          <Button variant="secondary" onClick={() => go("/ingest")}>
            Ingest a source
          </Button>
        )}
      </EmptyState>
    );
  }

  return (
    <>
      {recentWords.length > 0 && (
        <div className="home__recent">
          <p className="home__recent-label">Recently</p>
          {recentWords.map((w) => (
            <a key={w.id} href="/library" className="home__recent-row">
              <WordEntry
                size="compact"
                headword={w.headword}
                lemma={w.lemma ?? undefined}
                level={w.level ?? undefined}
                glossEn={w.glossEn ?? undefined}
              />
            </a>
          ))}
        </div>
      )}
      {latestJob && (
        <JobStatus
          state={JOB_STATE[latestJob.status] ?? "queued"}
          stage={JOB_LABEL[latestJob.type] ?? latestJob.type}
        />
      )}
    </>
  );
}

/**
 * Home — the `/` overview (home.md). A navigable front door, not a working
 * screen: one featured word, the day's work as sentences, a path into each
 * area. Read-only — it triggers no LLM calls and writes nothing. The overview
 * summary is fetched once by AppShell and shared with the footer.
 */
export function Home({ overview }: { overview: OverviewState }) {
  const { summary, loading, error } = overview;
  const [dismissed, setDismissed] = useState(false);
  const isPhone = useIsPhone();

  return (
    <div className="home">
      <section className="home__band home__band--hero">
        {renderHero(overview, isPhone)}
      </section>

      <section className="home__band home__grid" aria-label="Areas">
        {cardSpecs(summary, loading, isPhone).map((c) => (
          <OverviewCard
            key={c.title}
            title={c.title}
            href={c.href}
            stat={c.stat}
            blurb={c.blurb}
            zero={c.zero}
          />
        ))}
      </section>

      <section className="home__band home__activity">
        {renderActivity(summary, isPhone)}
      </section>

      {error && !dismissed && (
        <Toast variant="error" onDismiss={() => setDismissed(true)}>
          Couldn’t load your overview — counts may be out of date.
        </Toast>
      )}
    </div>
  );
}
