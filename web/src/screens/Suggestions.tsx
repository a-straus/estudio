import { useCallback, useEffect, useRef, useState } from "react";
import type { SuggestionTally, SuggestionView } from "@estudio/shared";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { Toast } from "../components/Toast";
import { WordEntry } from "../components/WordEntry";
import { ApiError, fetchNextSuggestion, recordDecision } from "./suggestionsApi";
import "./Suggestions.css";

interface ToastState {
  text: string;
  variant: "info" | "error";
}

type ScreenStatus = "loading" | "idle" | "deciding" | "empty" | "error";

const FADE_MS = 200; // matches --motion-base

function formatTally(tally: SuggestionTally): string {
  return [
    `${tally.suggested} suggested`,
    `${tally.added} added`,
    `${tally.skipped} skipped`,
  ].join(" · ");
}

function addToastText(view: SuggestionView): string {
  if (view.type === "word") {
    return `${view.headword} · added to Spanish deck`;
  }
  return `${view.name} · added to practice queue`;
}

export function Suggestions() {
  const [status, setStatus] = useState<ScreenStatus>("loading");
  const [suggestion, setSuggestion] = useState<SuggestionView | null>(null);
  const [tally, setTally] = useState<SuggestionTally | null>(null);
  const [fading, setFading] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const decidingRef = useRef(false);

  const loadNext = useCallback(async () => {
    setStatus("loading");
    try {
      const data = await fetchNextSuggestion();
      setTally(data.tally);
      if (!data.suggestion) {
        setSuggestion(null);
        setStatus("empty");
      } else {
        setSuggestion(data.suggestion);
        setStatus("idle");
      }
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void loadNext();
  }, [loadNext]);

  const advance = useCallback(
    async (action: "add" | "skip") => {
      if (!suggestion || decidingRef.current) return;
      decidingRef.current = true;
      setStatus("deciding");

      try {
        await recordDecision(suggestion.id, action);
      } catch (err) {
        const msg =
          err instanceof ApiError ? err.message : "Couldn't record decision.";
        setToast({ text: `${msg} Try again.`, variant: "error" });
        decidingRef.current = false;
        setStatus("idle");
        return;
      }

      if (action === "add") {
        setToast({ text: addToastText(suggestion), variant: "info" });
      }

      // Fade out, then load next.
      setFading(true);
      setTimeout(() => {
        setFading(false);
        decidingRef.current = false;
        void loadNext();
      }, FADE_MS);
    },
    [suggestion, loadNext],
  );

  // Keyboard: A = add, S = skip (desktop).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLButtonElement ||
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.key === "a" || e.key === "A") void advance("add");
      if (e.key === "s" || e.key === "S") void advance("skip");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance]);

  const busy = status === "deciding" || status === "loading";

  // Empty state
  if (status === "empty") {
    return (
      <div className="suggestions">
        {tally && (
          <p className="suggestions__tally">{formatTally(tally)}</p>
        )}
        <EmptyState message="Nothing left to suggest right now. Review what you've added, or ingest something new.">
          <Button variant="quiet" onClick={() => { window.location.href = "/"; }}>
            Go to Today
          </Button>
        </EmptyState>
      </div>
    );
  }

  // Error state
  if (status === "error") {
    return (
      <div className="suggestions">
        {tally && (
          <p className="suggestions__tally">{formatTally(tally)}</p>
        )}
        <p className="suggestions__error">
          Couldn't pick a suggestion. Try again.
        </p>
        <Button variant="quiet" onClick={() => void loadNext()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="suggestions">
      {tally && (
        <p className="suggestions__tally" data-testid="tally">
          {formatTally(tally)}
        </p>
      )}

      <div
        className={
          "suggestion-card" + (fading ? " suggestion-card--fading" : "")
        }
        data-testid="suggestion-card"
      >
        {status === "loading" || (!suggestion && !fading) ? (
          <p className="suggestion-card__choosing">Choosing the next one…</p>
        ) : suggestion?.type === "word" ? (
          <>
            <WordEntry
              size="full"
              headword={suggestion.headword}
              lemma={suggestion.lemma ?? undefined}
              language={suggestion.language.toUpperCase()}
              partOfSpeech={suggestion.partOfSpeech ?? undefined}
              level={suggestion.level ?? undefined}
              glossEs={suggestion.glossEs ?? undefined}
              glossEn={suggestion.glossEn ?? undefined}
              example={suggestion.example ?? undefined}
            />
            <p className="suggestion-card__reason">
              SUGGESTED · {suggestion.reason}
            </p>
          </>
        ) : suggestion?.type === "grammar_topic" ? (
          <>
            <p className="suggestion-card__topic-title">{suggestion.name}</p>
            <p className="suggestion-card__topic-preview">{suggestion.preview}</p>
            <p className="suggestion-card__reason">
              SUGGESTED · {suggestion.reason}
            </p>
          </>
        ) : (
          <p className="suggestion-card__choosing">Choosing the next one…</p>
        )}
      </div>

      <div className="suggestions__actions">
        <Button
          variant="primary"
          disabled={busy || !suggestion}
          onClick={() => void advance("add")}
          data-testid="add-btn"
        >
          Add
          <span className="suggestions__key-hint">A</span>
        </Button>
        <Button
          variant="secondary"
          disabled={busy || !suggestion}
          onClick={() => void advance("skip")}
          data-testid="skip-btn"
        >
          Skip
          <span className="suggestions__key-hint">S</span>
        </Button>
      </div>

      {toast && (
        <Toast
          variant={toast.variant}
          onDismiss={() => setToast(null)}
        >
          {toast.text}
        </Toast>
      )}
    </div>
  );
}
