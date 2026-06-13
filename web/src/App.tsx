import { AppShell, EmptyState } from "./components";
import { Grammar } from "./screens/Grammar";
import { Home } from "./screens/Home";
import { Placement } from "./screens/Placement";
import { Lesson } from "./screens/Lesson";
import { Ingest } from "./screens/Ingest";
import { Library } from "./screens/Library";
import { Quiz } from "./screens/Quiz";
import { Review } from "./screens/Review";
import { System } from "./screens/System";
import { Triage } from "./screens/Triage";
import { Ask } from "./screens/Ask";
import { Suggestions } from "./screens/Suggestions";
import { Lessons } from "./screens/Lessons";
import { Notes } from "./screens/Notes";
import { Progress } from "./screens/Progress";
import { applyTheme, readTheme } from "./theme";
import { useIsPhone } from "./hooks/useIsPhone";

// Apply the persisted theme before first paint, for every screen (including the
// session screens, which carry no footer toggle of their own).
applyTheme(readTheme());

// Minimal routing: the app routes on window.location.pathname (no react-router).
// Session screens (Review, Triage, Quiz play) take the full screen with no
// chrome; every other screen is wrapped in the shared AppShell.
function readSourceId(): number | null {
  const { pathname, search } = window.location;
  if (!pathname.startsWith("/triage")) return null;
  const raw = new URLSearchParams(search).get("source");
  const id = raw ? Number(raw) : NaN;
  return Number.isInteger(id) && id > 0 ? id : null;
}

// /review?deck=<id> studies a deck's due queue; the Spanish deck (id 1) is the
// default when no deck is named.
function readReviewDeckId(): number | null {
  const { pathname, search } = window.location;
  if (!pathname.startsWith("/review")) return null;
  const raw = new URLSearchParams(search).get("deck");
  const id = raw ? Number(raw) : 1;
  return Number.isInteger(id) && id > 0 ? id : 1;
}

// /grammar/topics/:id/lesson opens a topic's lesson (generated on first open).
function readLessonTopicId(): number | null {
  const match = window.location.pathname.match(
    /^\/grammar\/topics\/(\d+)\/lesson/,
  );
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function App() {
  const isPhone = useIsPhone();

  // --- Session screens: full-screen takeover, no SiteHeader/SiteFooter. ---
  const sourceId = readSourceId();
  if (sourceId !== null) {
    return <Triage sourceId={sourceId} />;
  }

  const deckId = readReviewDeckId();

  // --- Non-session screens: wrapped in the shared AppShell chrome. ---
  if (deckId !== null) {
    return (
      <AppShell title="Review" activeHref="/review">
        {() => <Review deckId={deckId} />}
      </AppShell>
    );
  }

  if (window.location.pathname.startsWith("/library")) {
    return (
      <AppShell title="Library" activeHref="/library">
        {() => <Library />}
      </AppShell>
    );
  }

  if (window.location.pathname.startsWith("/ingest")) {
    return (
      <AppShell title="Ingest" activeHref="/ingest">
        {() =>
          isPhone ? (
            <EmptyState message="Ingest is desktop-only. Adding sources — PDFs, pasted text, books — works best on a laptop. Open this page on your computer; you'll review the kept words here on your phone." />
          ) : (
            <Ingest />
          )
        }
      </AppShell>
    );
  }

  const lessonTopicId = readLessonTopicId();
  if (lessonTopicId !== null) {
    return (
      <AppShell title="Lesson" activeHref="/grammar">
        {() => <Lesson topicId={lessonTopicId} />}
      </AppShell>
    );
  }

  if (window.location.pathname.startsWith("/grammar")) {
    return (
      <AppShell title="Grammar" activeHref="/grammar">
        {() => <Grammar />}
      </AppShell>
    );
  }

  // Quiz is one component for both config and play. Config shows the chrome;
  // the play phase visually takes over per shell.md's session rule (Quiz owns
  // that internally — we don't refactor it here).
  if (window.location.pathname.startsWith("/quiz")) {
    return (
      <AppShell title="Quiz" activeHref="/quiz">
        {() => <Quiz />}
      </AppShell>
    );
  }

  if (window.location.pathname.startsWith("/progress")) {
    return (
      <AppShell title="Progress" activeHref="/progress">
        {() => <Progress />}
      </AppShell>
    );
  }

  if (window.location.pathname.startsWith("/system")) {
    return (
      <AppShell title="System" activeHref="/system">
        {() => <System />}
      </AppShell>
    );
  }

  if (window.location.pathname.startsWith("/placement")) {
    return (
      <AppShell title="English level" activeHref="/system">
        {() => <Placement />}
      </AppShell>
    );
  }

  // --- Phase-2 stub routes (pre-partitioned). Each screen is a stub the
  // owning task fills in; the route wiring here is the orchestrator's, so the
  // three workers stay file-disjoint from App.tsx. ---
  if (window.location.pathname.startsWith("/ask")) {
    return (
      <AppShell title="Ask" activeHref="/ask">
        {() => <Ask />}
      </AppShell>
    );
  }

  if (window.location.pathname.startsWith("/suggestions")) {
    return (
      <AppShell title="Suggestions" activeHref="/suggestions">
        {() => <Suggestions />}
      </AppShell>
    );
  }

  if (window.location.pathname.startsWith("/lessons")) {
    return (
      <AppShell title="Lessons" activeHref="/lessons">
        {() => <Lessons />}
      </AppShell>
    );
  }

  if (window.location.pathname.startsWith("/notes")) {
    return (
      <AppShell title="Notes" activeHref="/notes">
        {() => <Notes />}
      </AppShell>
    );
  }

  // --- Home (`/`): the navigable overview front door. ---
  return (
    <AppShell title="Home" activeHref="/">
      {(overview) => <Home overview={overview} />}
    </AppShell>
  );
}
