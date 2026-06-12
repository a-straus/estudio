import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ClozeReviewItem,
  DefinitionDisplay,
  DistractorCandidate,
  DueQueueItem,
  ReviewDirection,
  ReviewFormat,
  ReviewGrade,
} from "@estudio/shared";
import { normalize } from "@estudio/shared";
import {
  Button,
  ClozeStem,
  EmptyState,
  QuizOption,
  ReviewCard,
  SegmentedControl,
  Toast,
  WordEntry,
  type QuizOptionState,
} from "../components";
import { fetchDueQueue, submitReview } from "./reviewApi";
import { getSettings, putSettings } from "./systemApi";
import "./Review.css";

interface ReviewProps {
  deckId: number;
}

interface ToastState {
  text: string;
  variant: "info" | "error";
}

/** A built multiple-choice option set, or null when the queue can't fill one. */
interface OptionSet {
  options: string[];
  correctIndex: number;
}

const CHOICE_PROMPT: Record<ReviewDirection, string> = {
  w2d: "Choose the definition.",
  d2w: "Choose the word.",
};

const FLIP_PROMPT: Record<ReviewDirection, string> = {
  w2d: "Recall the definition.",
  d2w: "Recall the word.",
};

/** In-place Fisher–Yates; rng is injectable for deterministic tests. */
function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Derive 4 MC options from the definitions/terms of OTHER queued words, padded
 * with deck distractors the server ships when the queue is small. Returns null
 * only when queue + distractors can't fill 3 distinct distractors — the caller
 * falls back to flip. Distractor choice and option order are shuffled per
 * build so the correct slot is never memorizable.
 */
export function buildChoiceOptions(
  card: DueQueueItem,
  queue: DueQueueItem[],
  direction: ReviewDirection,
  distractors: DistractorCandidate[] = [],
  rng: () => number = Math.random,
): OptionSet | null {
  const correct = direction === "w2d" ? card.definitionEn : card.term;
  if (!correct) return null;

  const seen = new Set<string>([correct]);
  const pool: string[] = [];
  const add = (candidate: string | null) => {
    if (candidate && !seen.has(candidate)) {
      seen.add(candidate);
      pool.push(candidate);
    }
  };
  for (const c of queue) {
    if (c.wordId !== card.wordId)
      add(direction === "w2d" ? c.definitionEn : c.term);
  }
  for (const d of distractors) {
    if (d.wordId !== card.wordId)
      add(direction === "w2d" ? d.definitionEn : d.term);
  }
  if (pool.length < 3) return null;

  const options = [correct, ...shuffle(pool, rng).slice(0, 3)];
  shuffle(options, rng);
  return { options, correctIndex: options.indexOf(correct) };
}

function CardFront({ card }: { card: DueQueueItem }) {
  if (card.direction === "w2d") {
    return (
      <WordEntry
        size="hero"
        headword={card.term}
        lemma={card.lemma ?? undefined}
        language="ES"
        partOfSpeech={card.partOfSpeech ?? undefined}
      />
    );
  }
  // d2w: the definition is the question; the app is asking, so it's app voice.
  return (
    <p className="review__cue">{card.definitionEn ?? card.definitionEs}</p>
  );
}

// `reveal` honors the owner's "Definitions on reveal" preference (System →
// Preferences). Quiz's results reveal renders English-only (compact WordEntry),
// so the preference has no effect there; only Review's full reveal is gated.
function CardReveal({
  card,
  reveal,
}: {
  card: DueQueueItem;
  reveal: DefinitionDisplay;
}) {
  return (
    <WordEntry
      size="full"
      reveal={reveal}
      headword={card.term}
      lemma={card.lemma ?? undefined}
      language="ES"
      partOfSpeech={card.partOfSpeech ?? undefined}
      glossEs={card.definitionEs ?? undefined}
      glossEn={card.definitionEn ?? undefined}
      example={card.example ?? undefined}
    />
  );
}

interface CardProps {
  card: DueQueueItem;
  queue: DueQueueItem[];
  distractors: DistractorCandidate[];
  reveal: DefinitionDisplay;
  onGrade: (card: DueQueueItem, grade: ReviewGrade) => void;
  onNext: () => void;
}

function Card({
  card,
  queue,
  distractors,
  reveal,
  onGrade,
  onNext,
}: CardProps) {
  const optionSet = useMemo(
    () => buildChoiceOptions(card, queue, card.direction, distractors),
    [card, queue, distractors],
  );
  const mode = optionSet ? "choice" : "flip";

  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [wasCorrect, setWasCorrect] = useState(false);
  const [flipped, setFlipped] = useState(false);

  // Pick-one: grade the moment an option is chosen (mirrors Quiz.tsx select()).
  const select = useCallback(
    (i: number) => {
      if (!optionSet || answered) return;
      setSelected(i);
      const correct = i === optionSet.correctIndex;
      setWasCorrect(correct);
      setAnswered(true);
      onGrade(card, correct ? "good" : "fail");
    },
    [optionSet, answered, card, onGrade],
  );

  const dontKnow = useCallback(() => {
    if (answered) return;
    setSelected(null);
    setWasCorrect(false);
    setAnswered(true);
    onGrade(card, "fail");
  }, [answered, card, onGrade]);

  const selfGrade = useCallback(
    (grade: ReviewGrade) => {
      onGrade(card, grade);
      onNext();
    },
    [card, onGrade, onNext],
  );

  // Keyboard map (D5): 1–4 pick (and grade); Enter advances once answered; Space flip; D don't know.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (mode === "flip") {
        if (e.key === " " && !flipped) {
          e.preventDefault();
          setFlipped(true);
        }
        return;
      }
      if (answered) {
        if (e.key === "Enter") onNext();
        return;
      }
      if (optionSet && /^[1-4]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        if (idx < optionSet.options.length) select(idx);
      } else if (e.key.toLowerCase() === "d") {
        dontKnow();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mode, flipped, answered, optionSet, select, dontKnow, onNext]);

  const optionState = (i: number): QuizOptionState => {
    if (!answered) return selected === i ? "selected" : "default";
    if (i === optionSet!.correctIndex) return "correct";
    if (i === selected) return "incorrect";
    return "disabled";
  };

  if (mode === "flip") {
    return (
      <div className="review__card-region">
        <ReviewCard
          mode="flip"
          direction={card.direction === "w2d" ? "wordToDef" : "defToWord"}
          prompt={FLIP_PROMPT[card.direction]}
          flipped={flipped}
          onFlip={() => setFlipped(true)}
          back={<CardReveal card={card} reveal={reveal} />}
        >
          <CardFront card={card} />
        </ReviewCard>
        <div className="review__actions">
          {!flipped ? (
            <Button variant="primary" onClick={() => setFlipped(true)}>
              Flip to check
            </Button>
          ) : (
            <div className="review__grades">
              <Button variant="secondary" onClick={() => selfGrade("fail")}>
                Didn&rsquo;t know
              </Button>
              <Button variant="secondary" onClick={() => selfGrade("good")}>
                Knew it
              </Button>
              <Button variant="primary" onClick={() => selfGrade("easy")}>
                Easy
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="review__card-region">
      <ReviewCard
        mode="choice"
        direction={card.direction === "w2d" ? "wordToDef" : "defToWord"}
        prompt={CHOICE_PROMPT[card.direction]}
      >
        <CardFront card={card} />
      </ReviewCard>

      <div className="review__options" role="group">
        {optionSet!.options.map((opt, i) => (
          <QuizOption
            key={i}
            ordinal={i + 1}
            cloze={card.direction === "d2w"}
            state={optionState(i)}
            onClick={() => select(i)}
          >
            {opt}
          </QuizOption>
        ))}
      </div>

      {answered && (
        <div className="review__reveal">
          <CardReveal card={card} reveal={reveal} />
        </div>
      )}

      <div className="review__actions">
        {!answered ? (
          <Button variant="quiet" onClick={dontKnow}>
            Don&rsquo;t know
          </Button>
        ) : (
          <>
            <span
              className="review__verdict"
              data-correct={wasCorrect ? "yes" : "no"}
            >
              {wasCorrect ? "Correct." : "Not quite."}
            </span>
            <Button variant="primary" onClick={onNext}>
              Next
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

interface YesNoCardProps {
  card: DueQueueItem;
  reveal: DefinitionDisplay;
  onGrade: (card: DueQueueItem, grade: ReviewGrade) => void;
  onNext: () => void;
}

/**
 * Yes/No (binary) review card (§3.2b). Shows the question side only; tap to
 * reveal both sides split by a hairline; two self-grade Buttons map to SM-2
 * fail / good. No distractor pool needed — renders for every due word.
 */
function YesNoCard({ card, reveal, onGrade, onNext }: YesNoCardProps) {
  const [revealed, setRevealed] = useState(false);

  const selfGrade = useCallback(
    (grade: ReviewGrade) => {
      onGrade(card, grade);
      onNext();
    },
    [card, onGrade, onNext],
  );

  // Keyboard (§3.2b): Space/Enter reveals; once revealed 1/N = fail, 2/Y = knew.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (!revealed) {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          setRevealed(true);
        }
      } else {
        if (e.key === "1" || e.key === "n" || e.key === "N") selfGrade("fail");
        else if (e.key === "2" || e.key === "y" || e.key === "Y")
          selfGrade("good");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [revealed, selfGrade]);

  return (
    <div className="review__card-region">
      <ReviewCard
        mode="yesno"
        direction={card.direction === "w2d" ? "wordToDef" : "defToWord"}
        prompt="Do you know it?"
        yesnoRevealed={revealed}
        onReveal={() => setRevealed(true)}
        back={<CardReveal card={card} reveal={reveal} />}
      >
        <CardFront card={card} />
      </ReviewCard>
      {!revealed && (
        <p className="review__tap-hint">Tap to reveal</p>
      )}
      <div className="review__actions">
        {revealed ? (
          <div className="review__grades">
            <Button variant="secondary" onClick={() => selfGrade("fail")}>
              Didn&rsquo;t know
            </Button>
            <Button variant="primary" onClick={() => selfGrade("good")}>
              Knew it
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface ClozeCardProps {
  card: DueQueueItem;
  cloze: ClozeReviewItem;
  reveal: DefinitionDisplay;
  onGrade: (card: DueQueueItem, grade: ReviewGrade, questionId: number) => void;
  onNext: () => void;
}

/**
 * A due word rendered from its cached cloze quiz_question (review-02 #8).
 * Grades client-side like the MC cards; the reveal offers "Explain why" backed
 * by the cached explanation. Submitting logs direction 'cloze' + the question id.
 */
function ClozeCard({ card, cloze, reveal, onGrade, onNext }: ClozeCardProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [wasCorrect, setWasCorrect] = useState(false);
  const [explain, setExplain] = useState(false);

  // Pick-one: grade the moment an option is chosen (mirrors Quiz.tsx select()).
  const select = useCallback(
    (i: number) => {
      if (answered) return;
      setSelected(i);
      const correct =
        normalize(cloze.options[i]) === normalize(cloze.correct);
      setWasCorrect(correct);
      setAnswered(true);
      onGrade(card, correct ? "good" : "fail", cloze.questionId);
    },
    [answered, cloze, card, onGrade],
  );

  const dontKnow = useCallback(() => {
    if (answered) return;
    setSelected(null);
    setWasCorrect(false);
    setAnswered(true);
    onGrade(card, "fail", cloze.questionId);
  }, [answered, cloze.questionId, card, onGrade]);

  // Keyboard: 1–4 pick (and grade); Enter advances once answered; D don't know.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (answered) {
        if (e.key === "Enter") onNext();
        return;
      }
      if (/^[1-4]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        if (idx < cloze.options.length) select(idx);
      } else if (e.key.toLowerCase() === "d") {
        dontKnow();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [answered, cloze.options.length, select, dontKnow, onNext]);

  const optionState = (i: number): QuizOptionState => {
    if (!answered) return selected === i ? "selected" : "default";
    if (normalize(cloze.options[i]) === normalize(cloze.correct))
      return "correct";
    if (i === selected) return "incorrect";
    return "disabled";
  };

  return (
    <div className="review__card-region">
      <ReviewCard
        mode="choice"
        direction="cloze"
        prompt="Complete the sentence."
      >
        <ClozeStem before={cloze.stemBefore} after={cloze.stemAfter} />
      </ReviewCard>

      <div className="review__options" role="group">
        {cloze.options.map((opt, i) => (
          <QuizOption
            key={i}
            ordinal={i + 1}
            cloze
            state={optionState(i)}
            onClick={() => select(i)}
          >
            {opt}
          </QuizOption>
        ))}
      </div>

      {answered && (
        <div className="review__reveal">
          <CardReveal card={card} reveal={reveal} />
          <Button variant="quiet" onClick={() => setExplain((v) => !v)}>
            Explain why
          </Button>
          {explain && (
            <p className="review__explanation">{cloze.explanation}</p>
          )}
        </div>
      )}

      <div className="review__actions">
        {!answered ? (
          <Button variant="quiet" onClick={dontKnow}>
            Don&rsquo;t know
          </Button>
        ) : (
          <>
            <span
              className="review__verdict"
              data-correct={wasCorrect ? "yes" : "no"}
            >
              {wasCorrect ? "Correct." : "Not quite."}
            </span>
            <Button variant="primary" onClick={onNext}>
              Next
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

type ReviewPhase = "loading" | "landing" | "active" | "finished";

export function Review({ deckId }: ReviewProps) {
  const [phase, setPhase] = useState<ReviewPhase>("loading");
  const [loadError, setLoadError] = useState(false);
  const [queue, setQueue] = useState<DueQueueItem[]>([]);
  const [distractors, setDistractors] = useState<DistractorCandidate[]>([]);
  const [clozeByWord, setClozeByWord] = useState<Map<number, ClozeReviewItem>>(
    new Map(),
  );
  const [index, setIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [missed, setMissed] = useState<DueQueueItem[]>([]);
  const [toast, setToast] = useState<ToastState | null>(null);
  // "Definitions on reveal" preference; defaults to "both" until/if it loads.
  const [reveal, setReveal] = useState<DefinitionDisplay>("both");
  // Review format preference; defaults to "mc" until/if it loads.
  const [reviewFormat, setReviewFormat] = useState<ReviewFormat>("mc");

  useEffect(() => {
    getSettings().then(
      (r) => {
        setReveal(r.settings.definitionDisplay);
        setReviewFormat(r.settings.reviewFormat);
      },
      () => {
        /* fall back to the defaults — a missing preference isn't fatal */
      },
    );
  }, []);

  const load = useCallback(async () => {
    setPhase("loading");
    setLoadError(false);
    try {
      const data = await fetchDueQueue(deckId);
      setQueue(data.items);
      setDistractors(data.distractors ?? []);
      setClozeByWord(
        new Map((data.clozeReviews ?? []).map((c) => [c.wordId, c])),
      );
      setIndex(0);
      setCorrectCount(0);
      setMissed([]);
      const autostart = new URLSearchParams(window.location.search).has(
        "autostart",
      );
      setPhase(
        data.items.length > 0 && autostart ? "active" : "landing",
      );
    } catch {
      setLoadError(true);
      setPhase("landing");
    }
  }, [deckId]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = queue.length;
  const current = queue[index];

  const advance = useCallback(() => {
    setIndex((i) => {
      if (i + 1 >= queue.length) {
        setPhase("finished");
        return i;
      }
      return i + 1;
    });
  }, [queue.length]);

  const onSaveError = useCallback((err: unknown) => {
    setToast({
      text: err instanceof Error ? err.message : "Couldn't save that review.",
      variant: "error",
    });
  }, []);

  const tally = useCallback((card: DueQueueItem, grade: ReviewGrade) => {
    if (grade === "fail") setMissed((m) => [...m, card]);
    else setCorrectCount((c) => c + 1);
  }, []);

  const handleGrade = useCallback(
    (card: DueQueueItem, grade: ReviewGrade) => {
      tally(card, grade);
      submitReview({
        wordId: card.wordId,
        direction: card.direction,
        grade,
      }).catch(onSaveError);
    },
    [tally, onSaveError],
  );

  // review-02 #8: a cloze-rendered review logs direction 'cloze' + the question id.
  const handleClozeGrade = useCallback(
    (card: DueQueueItem, grade: ReviewGrade, questionId: number) => {
      tally(card, grade);
      submitReview({
        wordId: card.wordId,
        direction: "cloze",
        grade,
        quizQuestionId: questionId,
      }).catch(onSaveError);
    },
    [tally, onSaveError],
  );

  // Returns to landing instead of "/" — user stays in chrome context.
  const endSession = useCallback(() => {
    setPhase("landing");
    // Reload queue state so due count reflects any grading that happened.
    void load();
  }, [load]);

  const reviewMissed = useCallback(() => {
    setQueue(missed);
    setIndex(0);
    setCorrectCount(0);
    setMissed([]);
    setPhase("active");
  }, [missed]);

  // End session on Esc (progress saved server-side as each card is graded).
  useEffect(() => {
    if (phase !== "active") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") endSession();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [phase, endSession]);

  if (phase === "loading") {
    return (
      <div className="review__landing">
        <p className="review__status">Loading…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="review__landing">
        <EmptyState message="Couldn't load your decks. Reload, or check System for details.">
          <Button variant="secondary" onClick={() => void load()}>
            Reload
          </Button>
        </EmptyState>
      </div>
    );
  }

  if (phase === "landing") {
    if (total === 0) {
      return (
        <div className="review__landing">
          <EmptyState message="Nothing due. Ingest something new?">
            <Button
              variant="quiet"
              onClick={() => window.location.assign("/ingest")}
            >
              Ingest
            </Button>
          </EmptyState>
        </div>
      );
    }
    return (
      <div className="review__landing">
        <p className="review__due-count">
          {total} {total === 1 ? "card" : "cards"} due today
        </p>
        <SegmentedControl
          label="Review format"
          options={[
            { value: "mc", label: "Multiple choice" },
            { value: "yesno", label: "Yes-No" },
          ]}
          value={reviewFormat}
          onChange={(v) => {
            const fmt = v as ReviewFormat;
            setReviewFormat(fmt);
            putSettings({ reviewFormat: fmt }).catch(() => {
              /* optimistic — silently fall back on failure */
            });
          }}
        />
        <Button variant="primary" onClick={() => setPhase("active")}>
          Start review
        </Button>
      </div>
    );
  }

  if (phase === "finished") {
    const reviewed = correctCount + missed.length;
    return (
      <div className="review__landing review__landing--summary">
        <p className="review__summary-count">
          {reviewed} {reviewed === 1 ? "card" : "cards"} · {correctCount}{" "}
          correct
        </p>
        {missed.length > 0 && (
          <div className="review__missed">
            {missed.map((m, i) => (
              <WordEntry
                key={`${m.wordId}-${i}`}
                size="compact"
                headword={m.term}
                glossEn={m.definitionEn ?? undefined}
              />
            ))}
          </div>
        )}
        <div className="review__summary-actions">
          {missed.length > 0 && (
            <Button variant="quiet" onClick={reviewMissed}>
              Review the {missed.length} missed again
            </Button>
          )}
          <Button variant="primary" onClick={() => window.location.assign("/")}>
            Done
          </Button>
        </div>
        {toast && (
          <Toast variant={toast.variant} onDismiss={() => setToast(null)}>
            {toast.text}
          </Toast>
        )}
      </div>
    );
  }

  // Active run — full-bleed takeover (same mechanism as quiz--play)
  return (
    <main className="review review--active">
      <header className="review__bar">
        <button
          type="button"
          className="review__close"
          aria-label="End session"
          onClick={endSession}
        >
          ×
        </button>
        <span className="review__progress-text">
          {index + 1} of {total}
        </span>
        <div className="review__progress-track" aria-hidden="true">
          <div
            className="review__progress-fill"
            style={{ width: `${(index / total) * 100}%` }}
          />
        </div>
      </header>

      {current &&
        (clozeByWord.has(current.wordId) ? (
          <ClozeCard
            key={`cloze-${current.wordId}-${index}`}
            card={current}
            cloze={clozeByWord.get(current.wordId)!}
            reveal={reveal}
            onGrade={handleClozeGrade}
            onNext={advance}
          />
        ) : reviewFormat === "yesno" ? (
          <YesNoCard
            key={`yesno-${current.wordId}-${index}`}
            card={current}
            reveal={reveal}
            onGrade={handleGrade}
            onNext={advance}
          />
        ) : (
          <Card
            key={`${current.wordId}-${index}`}
            card={current}
            queue={queue}
            distractors={distractors}
            reveal={reveal}
            onGrade={handleGrade}
            onNext={advance}
          />
        ))}

      {toast && (
        <Toast variant={toast.variant} onDismiss={() => setToast(null)}>
          {toast.text}
        </Toast>
      )}
    </main>
  );
}
