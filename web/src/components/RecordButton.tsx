import "./RecordButton.css";

export type RecordButtonState = "idle" | "recording" | "denied" | "transcribing";

interface RecordButtonProps {
  state?: RecordButtonState;
  /** Elapsed seconds (only shown in recording state). */
  elapsedSeconds?: number;
  onClick?: () => void;
}

const MAX_SECONDS = 120;
const COUNTDOWN_START = 15;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * RecordButton — mic affordance beside the composer (components.md).
 * MediaRecorder wiring is a separate task (voice-questions); this renders
 * the states per the design but does not capture audio.
 */
export function RecordButton({
  state = "idle",
  elapsedSeconds = 0,
  onClick,
}: RecordButtonProps) {
  const isRecording = state === "recording";
  const isDisabled = state === "transcribing";
  const remaining = MAX_SECONDS - elapsedSeconds;
  const isWarning = isRecording && remaining <= COUNTDOWN_START;

  const btnClass = [
    "record-btn",
    isRecording ? "record-btn--recording" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={btnClass}
      disabled={isDisabled}
      onClick={onClick}
      aria-label={
        isRecording
          ? "Stop recording"
          : state === "denied"
            ? "Microphone blocked"
            : "Record voice question"
      }
      title={
        state === "denied"
          ? "Microphone blocked. Allow it in the browser, or type instead."
          : undefined
      }
    >
      {isRecording ? (
        <span className="record-btn__recording-inner">
          <span className="record-btn__dot" aria-hidden="true" />
          <span
            className={
              "record-btn__timer" +
              (isWarning ? " record-btn__timer--warning" : "")
            }
          >
            {isWarning
              ? formatTime(remaining)
              : formatTime(elapsedSeconds)}
          </span>
        </span>
      ) : (
        <span aria-hidden="true">🎙</span>
      )}
    </button>
  );
}
