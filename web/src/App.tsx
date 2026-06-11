import "./App.css";
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

export function App() {
  const sourceId = readSourceId();
  if (sourceId !== null) {
    return <Triage sourceId={sourceId} />;
  }

  return (
    <main className="app-shell">
      <h1 className="app-shell__title">Estudio</h1>
      <p className="app-shell__note">
        Open <code>/triage?source=&lt;id&gt;</code> to sort an extraction.
      </p>
    </main>
  );
}
