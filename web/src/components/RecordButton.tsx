import { useCallback, useEffect, useRef, useState } from "react";
import "./RecordButton.css";

export type RecordButtonState = "idle" | "recording" | "denied" | "transcribing";

interface RecordButtonProps {
  /** External state override — used by tests and the parent's transcribing state. */
  state?: RecordButtonState;
  /** External elapsed seconds override — used by tests. */
  elapsedSeconds?: number;
  /** Legacy click handler (presentational use). */
  onClick?: () => void;
  /** When provided, RecordButton manages its own MediaRecorder and calls this with the Blob. */
  onRecorded?: (audio: Blob) => void;
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
 * When onRecorded is provided, manages its own MediaRecorder + timer internally.
 * The state/elapsedSeconds props override the internal state (used by tests).
 */
export function RecordButton({
  state: stateProp,
  elapsedSeconds: elapsedProp,
  onClick,
  onRecorded,
}: RecordButtonProps) {
  const [internalState, setInternalState] = useState<"idle" | "recording" | "denied">("idle");
  const [internalElapsed, setInternalElapsed] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobEvent["data"][]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const handleClick = useCallback(async () => {
    if (onClick) { onClick(); return; }
    if (!onRecorded) return;

    if (internalState === "recording") {
      stopRecording();
      return;
    }

    if (internalState === "denied") return;

    // Guard: MediaRecorder/getUserMedia are browser-only
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setInternalState("denied");
      return;
    }

    chunksRef.current = [];
    const recorder = new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const mimeType = recorder.mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type: mimeType });
      chunksRef.current = [];
      setInternalElapsed(0);
      setInternalState("idle");
      onRecorded(blob);
    };

    recorder.start();
    setInternalState("recording");
    setInternalElapsed(0);

    let elapsed = 0;
    timerRef.current = setInterval(() => {
      elapsed += 1;
      setInternalElapsed(elapsed);
      if (elapsed >= MAX_SECONDS) {
        stopRecording();
      }
    }, 1000);
  }, [internalState, onClick, onRecorded, stopRecording]);

  // External props override internal state (used by tests and parent-driven transcribing)
  const state: RecordButtonState = stateProp ?? internalState;
  const elapsedSeconds = elapsedProp ?? internalElapsed;

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
      onClick={() => void handleClick()}
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
