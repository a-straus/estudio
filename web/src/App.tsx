import "./App.css";
import { Grammar } from "./screens/Grammar";
import { Ingest } from "./screens/Ingest";
import { Library } from "./screens/Library";
import { Quiz } from "./screens/Quiz";
import { Review } from "./screens/Review";
import { System } from "./screens/System";
import { Triage } from "./screens/Triage";

// Minimal routing until the full app shell lands: the triage screen is reached
// at /triage?source=<id> (linked from Today/Ingest in later tasks). Anything
// else shows the placeholder shell.
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

export function App() {
  const sourceId = readSourceId();
  if (sourceId !== null) {
    return <Triage sourceId={sourceId} />;
  }

  const deckId = readReviewDeckId();
  if (deckId !== null) {
    return <Review deckId={deckId} />;
  }

  if (window.location.pathname.startsWith("/library")) {
    return <Library />;
  }

  if (window.location.pathname.startsWith("/ingest")) {
    return <Ingest />;
  }

  if (window.location.pathname.startsWith("/grammar")) {
    return <Grammar />;
  }

  if (window.location.pathname.startsWith("/quiz")) {
    return <Quiz />;
  }

  if (window.location.pathname.startsWith("/system")) {
    return <System />;
  }

  return (
    <main className="app-shell">
      <h1 className="app-shell__title">Estudio</h1>
      <p className="app-shell__note">
        Open <code>/triage?source=&lt;id&gt;</code> to sort an extraction, or{" "}
        <code>/review</code> to study what&rsquo;s due.
      </p>
    </main>
  );
}
