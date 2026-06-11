import { Button } from "./Button";
import "./JobStatus.css";

export type JobState = "running" | "queued" | "done" | "failed";

interface JobStatusProps {
  state: JobState;
  /** Stage line, e.g. "Reading chapter 41 of 135"; failed: what happened and the next action. */
  stage: string;
  /** Progress 0–1 (running). */
  progress?: number;
  /** Cost ticker, e.g. "$0.31 so far". */
  cost?: string;
  /** Done: how long it took, appended to the stage line. */
  duration?: string;
  onCancel?: () => void;
  onBackground?: () => void;
  onRetry?: () => void;
}

/** JobStatus — the machine reporting on itself. All mono. */
export function JobStatus({
  state,
  stage,
  progress,
  cost,
  duration,
  onCancel,
  onBackground,
  onRetry,
}: JobStatusProps) {
  const showCancel = state === "running" && onCancel;
  const showBackground = state === "running" && onBackground;
  const showRetry = state === "failed" && onRetry;

  return (
    <div className={`job-status job-status--${state}`}>
      <span
        className={`job-status__dot job-status__dot--${state}`}
        aria-hidden="true"
      />
      <div className="job-status__main">
        <p className="job-status__stage">
          {stage}
          {state === "done" && duration ? ` · ${duration}` : ""}
        </p>
        {state === "running" && progress !== undefined && (
          <div
            className="job-status__track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
          >
            <div
              className="job-status__fill"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        )}
        {cost && <p className="job-status__cost">{cost}</p>}
        {(showCancel || showBackground || showRetry) && (
          <div className="job-status__actions">
            {showRetry && (
              <Button variant="quiet" onClick={onRetry}>
                Retry
              </Button>
            )}
            {showCancel && (
              <Button variant="quiet" onClick={onCancel}>
                Cancel
              </Button>
            )}
            {showBackground && (
              <Button variant="quiet" onClick={onBackground}>
                Run in background
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
