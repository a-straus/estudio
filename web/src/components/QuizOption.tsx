import type { ReactNode } from "react";
import "./QuizOption.css";

export type QuizOptionState =
  | "default"
  | "selected"
  | "correct"
  | "incorrect"
  | "disabled";

interface QuizOptionProps {
  children: ReactNode;
  state?: QuizOptionState;
  /** Key ordinal 1–4, rendered at bp-desktop+ only. */
  ordinal?: number;
  /** Cloze options are full sentences in the studied language → serif. */
  cloze?: boolean;
  onClick?: () => void;
}

/** QuizOption — one of 4 answer choices. */
export function QuizOption({
  children,
  state = "default",
  ordinal,
  cloze = false,
  onClick,
}: QuizOptionProps) {
  const interactive = state === "default" || state === "selected";
  const verdict =
    state === "correct"
      ? "Correct"
      : state === "incorrect"
        ? "Your answer"
        : null;

  return (
    <button
      type="button"
      className={[
        "quiz-option",
        `quiz-option--${state}`,
        cloze && "quiz-option--cloze",
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={!interactive}
      onClick={onClick}
    >
      {ordinal !== undefined && (
        <span className="quiz-option__ordinal" aria-hidden="true">
          {ordinal}
        </span>
      )}
      <span className="quiz-option__label">{children}</span>
      {verdict && <span className="quiz-option__verdict">{verdict}</span>}
    </button>
  );
}
