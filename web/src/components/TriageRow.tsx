import { Button } from "./Button";
import { WordEntry } from "./WordEntry";
import type { WordEntryData } from "./WordEntry";
import "./TriageRow.css";

export type TriageRowState = "upcoming" | "current" | "decided" | "error";
export type TriageDecision = "know" | "learn" | "skip";

interface TriageRowProps {
  word: WordEntryData;
  state: TriageRowState;
  /** Upcoming: the definition is still generating. */
  defining?: boolean;
  /** Decided: which decision was made. */
  decision?: TriageDecision;
  onKnow?: () => void;
  onLearn?: () => void;
  onSkip?: () => void;
  /** Error: retry the failed definition. */
  onRetry?: () => void;
}

const STAMP: Record<TriageDecision, string> = {
  know: "Know",
  learn: "Learn",
  skip: "Skip",
};

/** TriageRow — one extracted word in the triage list. */
export function TriageRow({
  word,
  state,
  defining = false,
  decision,
  onKnow,
  onLearn,
  onSkip,
  onRetry,
}: TriageRowProps) {
  if (state === "current") {
    return (
      <div className="triage-row triage-row--current">
        <WordEntry size="full" {...word} />
        {/* DOM order is the mobile order (Learn first, full-width);
            desktop reorders to Know / Learn / Skip via flex order. */}
        <div className="triage-row__actions">
          <Button
            variant="primary"
            className="triage-row__action triage-row__action--learn"
            onClick={onLearn}
          >
            Learn
            <span className="triage-row__key-hint" aria-hidden="true">
              L
            </span>
          </Button>
          <Button
            variant="secondary"
            className="triage-row__action triage-row__action--know"
            onClick={onKnow}
          >
            Know
            <span className="triage-row__key-hint" aria-hidden="true">
              K
            </span>
          </Button>
          <Button
            variant="quiet"
            className="triage-row__action triage-row__action--skip"
            onClick={onSkip}
          >
            Skip
            <span className="triage-row__key-hint" aria-hidden="true">
              S
            </span>
          </Button>
        </div>
      </div>
    );
  }

  if (state === "decided") {
    return (
      <div
        className={
          "triage-row triage-row--decided" +
          (decision ? ` triage-row--${decision}` : "")
        }
      >
        <WordEntry size="compact" {...word} />
        {decision && (
          <span className={`triage-row__stamp triage-row__stamp--${decision}`}>
            {STAMP[decision]}
          </span>
        )}
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="triage-row triage-row--error">
        <WordEntry
          size="compact"
          {...word}
          glossEs={undefined}
          glossEn={undefined}
        />
        <span className="triage-row__error-line">
          definition failed — write one in Library, or{" "}
          <Button
            variant="quiet"
            className="triage-row__retry"
            onClick={onRetry}
          >
            retry
          </Button>
        </span>
      </div>
    );
  }

  // upcoming
  return (
    <div className="triage-row triage-row--upcoming">
      {defining ? (
        <>
          <WordEntry
            size="compact"
            {...word}
            glossEs={undefined}
            glossEn={undefined}
          />
          <span className="triage-row__defining">defining…</span>
        </>
      ) : (
        <WordEntry size="compact" {...word} />
      )}
    </div>
  );
}
