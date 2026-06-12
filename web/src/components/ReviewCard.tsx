import type { KeyboardEvent, ReactNode } from "react";
import "./ReviewCard.css";

export type ReviewCardMode = "choice" | "flip" | "yesno";
export type ReviewCardDirection = "wordToDef" | "defToWord" | "cloze";

interface ReviewCardProps {
  mode?: ReviewCardMode;
  direction?: ReviewCardDirection;
  /** Prompt line, e.g. "Choose the definition." Pinned at the top. */
  prompt: string;
  /** Front content: a `WordEntry size=hero` or a `ClozeStem`. */
  children: ReactNode;
  /** Flip/yesno mode: back face content (definition line(s) + example). */
  back?: ReactNode;
  /** Flip mode: which face shows. */
  flipped?: boolean;
  /** Flip mode: tap card or Space/Enter to flip. */
  onFlip?: () => void;
  /** Yesno mode: whether the answer side is revealed. */
  yesnoRevealed?: boolean;
  /** Yesno mode: tap card to reveal. */
  onReveal?: () => void;
}

/**
 * ReviewCard — the active question frame in Review and Quiz. Flip is an
 * opacity cross-fade, no 3D rotation. Verdicts live on options/actions,
 * not on the card.
 */
export function ReviewCard({
  mode = "choice",
  direction,
  prompt,
  children,
  back,
  flipped = false,
  onFlip,
  yesnoRevealed = false,
  onReveal,
}: ReviewCardProps) {
  const flippable = mode === "flip" && onFlip !== undefined;

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (mode === "flip") onFlip?.();
      else if (mode === "yesno") onReveal?.();
    }
  };

  // Yesno: the whole card section is the tap target (before reveal).
  const yesnoCardProps =
    mode === "yesno" && !yesnoRevealed && onReveal !== undefined
      ? {
          role: "button" as const,
          tabIndex: 0,
          onClick: onReveal,
          onKeyDown: handleKeyDown,
        }
      : {};

  return (
    <section className="review-card" data-direction={direction} {...yesnoCardProps}>
      <p className="review-card__prompt">{prompt}</p>
      <div
        className="review-card__body"
        {...(flippable
          ? {
              role: "button",
              tabIndex: 0,
              onClick: onFlip,
              onKeyDown: handleKeyDown,
            }
          : {})}
      >
        {mode === "flip" ? (
          <div className="review-card__faces">
            <div
              className={
                "review-card__face" +
                (flipped ? " review-card__face--hidden" : "")
              }
              aria-hidden={flipped}
            >
              {children}
            </div>
            <div
              className={
                "review-card__face" +
                (flipped ? "" : " review-card__face--hidden")
              }
              aria-hidden={!flipped}
            >
              {back}
            </div>
          </div>
        ) : mode === "yesno" ? (
          <div className="review-card__yesno">
            {children}
            {yesnoRevealed && (
              <div className="review-card__yesno-reveal">
                <hr className="review-card__rule" />
                {back}
              </div>
            )}
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

interface ClozeStemProps {
  /** Sentence text before the blank. */
  before: string;
  /** Sentence text after the blank. */
  after: string;
}

/** The cloze stem: studied-language sentence with the blank as 5 underscores. */
export function ClozeStem({ before, after }: ClozeStemProps) {
  return (
    <p className="cloze-stem">
      {before}{" "}
      <span className="cloze-stem__blank" aria-label="blank">
        _____
      </span>{" "}
      {after}
    </p>
  );
}
