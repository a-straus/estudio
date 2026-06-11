import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  QuizAttemptAnswer,
  QuizDirectionOption,
  QuizQuestionView,
  QuizStyleOption,
} from "@estudio/shared";
import {
  Button,
  ClozeStem,
  EmptyState,
  JobStatus,
  QuizOption,
  ReviewCard,
  SegmentedControl,
  WordEntry,
  type JobState,
  type QuizOptionState,
  type ReviewCardDirection,
} from "../components";
import {
  answerQuiz,
  ApiError,
  fetchQuizQuestions,
  generateQuiz,
  submitAttempt,
} from "./quizApi";
import "./Quiz.css";

interface QuizProps {
  /** Poll interval for the generation job; overridable in tests. */
  pollIntervalMs?: number;
}

type Phase = "setup" | "loading" | "play" | "results";

/** Setup "Deck" maps to a deck id. */
const DECK_OPTIONS = [
  { value: "1", label: "Spanish" },
  { value: "2", label: "English" },
];
const LENGTH_OPTIONS = [
  { value: "10", label: "10" },
  { value: "20", label: "20" },
  { value: "40", label: "40" },
];
const STYLE_OPTIONS = [
  { value: "def_match", label: "Multiple choice" },
  { value: "cloze", label: "Cloze" },
  { value: "mixed", label: "Mixed" },
];
const DIRECTION_OPTIONS = [
  { value: "w2d", label: "Word → definition" },
  { value: "d2w", label: "Definition → word" },
  { value: "mixed", label: "Mixed" },
];

const PROMPT: Record<string, string> = {
  w2d: "Choose the definition.",
  d2w: "Choose the word.",
  cloze: "Fill in the blank.",
};

const CARD_DIRECTION: Record<string, ReviewCardDirection> = {
  w2d: "wordToDef",
  d2w: "defToWord",
  cloze: "cloze",
};

/** Per-question outcome accumulated through Play, rendered in Results. */
export interface QuizOutcome {
  question: QuizQuestionView;
  given: string | null;
  correct: boolean;
  correctAnswer: string;
  explanation: string;
}

function deckIdFor(value: string): number {
  return Number(value);
}

/** Options that are studied-language text (Spanish) render serif. */
function isSerif(q: QuizQuestionView): boolean {
  return q.style === "cloze" || q.direction === "d2w";
}

function QuestionFront({ q }: { q: QuizQuestionView }) {
  if (q.style === "cloze") {
    return <ClozeStem before={q.stemBefore ?? ""} after={q.stemAfter ?? ""} />;
  }
  if (q.direction === "w2d") {
    return (
      <WordEntry
        size="hero"
        headword={q.term}
        lemma={q.lemma ?? undefined}
        language="ES"
        partOfSpeech={q.partOfSpeech ?? undefined}
      />
    );
  }
  // d2w: the definition is the question.
  return <p className="quiz__cue">{q.cue}</p>;
}

interface QuizCardProps {
  question: QuizQuestionView;
  onAnswered: (outcome: QuizOutcome) => void;
  onExplained: (questionId: number, explanation: string) => void;
  onNext: () => void;
}

function QuizCard({
  question,
  onAnswered,
  onExplained,
  onNext,
}: QuizCardProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<QuizOutcome | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explain, setExplain] = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const serif = isSerif(question);

  // Pick-one: color the moment an option is chosen (graded locally against the
  // served answer), then persist the result and fetch the explanation in the
  // background — the visual feedback never waits on the network.
  const select = useCallback(
    (i: number) => {
      if (outcome) return;
      const given = question.options[i];
      const correct = given === question.answer;
      const result: QuizOutcome = {
        question,
        given,
        correct,
        correctAnswer: question.answer,
        explanation: "",
      };
      setSelected(i);
      setOutcome(result);
      setExplain(!correct); // auto-expand the explanation on a wrong answer
      onAnswered(result);
      answerQuiz({
        questionId: question.id,
        given,
        direction: question.direction,
      })
        .then((res) => {
          setExplanation(res.explanation);
          onExplained(question.id, res.explanation);
        })
        .catch((err) => {
          setGradeError(
            err instanceof ApiError
              ? err.message
              : "Couldn't save that answer. Your score still counts.",
          );
        });
    },
    [outcome, question, onAnswered, onExplained],
  );

  const optionState = (i: number): QuizOptionState => {
    if (!outcome) return selected === i ? "selected" : "default";
    if (question.options[i] === outcome.correctAnswer) return "correct";
    if (i === selected) return "incorrect";
    return "disabled";
  };

  // Keyboard: 1–4 pick (and grade); Enter advances once answered.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (outcome) {
        if (e.key === "Enter") onNext();
        return;
      }
      if (/^[1-4]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        if (idx < question.options.length) select(idx);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [outcome, question.options.length, select, onNext]);

  return (
    <div className="review__card-region">
      <ReviewCard
        mode="choice"
        direction={CARD_DIRECTION[question.direction]}
        prompt={PROMPT[question.direction]}
      >
        <QuestionFront q={question} />
      </ReviewCard>

      <div className="review__options" role="group">
        {question.options.map((opt, i) => (
          <QuizOption
            key={i}
            ordinal={i + 1}
            cloze={serif}
            state={optionState(i)}
            onClick={() => select(i)}
          >
            {opt}
          </QuizOption>
        ))}
      </div>

      {outcome && !outcome.correct && (
        <div className="review__reveal">
          <Button variant="quiet" onClick={() => setExplain((v) => !v)}>
            Explain why
          </Button>
          {explain && explanation && (
            <p className="review__explanation">{explanation}</p>
          )}
        </div>
      )}

      <div className="review__actions">
        {outcome && (
          <>
            <span
              className="review__verdict"
              data-correct={outcome.correct ? "yes" : "no"}
            >
              {outcome.correct ? "Correct." : "Not quite."}
            </span>
            <Button variant="primary" onClick={onNext}>
              Next
            </Button>
          </>
        )}
        {gradeError && <span className="quiz__grade-error">{gradeError}</span>}
      </div>
    </div>
  );
}

function ResultRow({ outcome }: { outcome: QuizOutcome }) {
  const [explain, setExplain] = useState(false);
  const { question, given, correct, correctAnswer } = outcome;
  return (
    <li
      className="quiz-result"
      data-correct={correct ? "yes" : "no"}
    >
      <div className="quiz-result__entry">
        <WordEntry
          size="compact"
          headword={question.term}
          glossEn={question.definitionEn ?? undefined}
        />
        <span
          className="quiz-result__mark"
          aria-label={correct ? "Correct" : "Incorrect"}
        >
          {correct ? "✓" : "✗"}
        </span>
      </div>
      <div className="quiz-result__answers">
        {!correct && (
          <>
            <span className="quiz-result__yours">
              yours: {given ?? "—"}
            </span>
            <span className="quiz-result__correct">
              correct: {correctAnswer}
            </span>
          </>
        )}
        <Button variant="quiet" onClick={() => setExplain((v) => !v)}>
          Explain why
        </Button>
        {explain && (
          <p className="quiz-result__explanation">{outcome.explanation}</p>
        )}
      </div>
    </li>
  );
}

export function Quiz({ pollIntervalMs = 1000 }: QuizProps) {
  const [phase, setPhase] = useState<Phase>("setup");
  const [deck, setDeck] = useState("1");
  const [length, setLength] = useState("10");
  const [style, setStyle] = useState("mixed");
  const [direction, setDirection] = useState("mixed");

  const [jobId, setJobId] = useState<number | null>(null);
  const [genState, setGenState] = useState<JobState | null>(null);
  const [genStep, setGenStep] = useState(0);
  const [genTotal, setGenTotal] = useState(0);
  const [genError, setGenError] = useState<string | null>(null);
  const [emptyDeck, setEmptyDeck] = useState(false);

  const [questions, setQuestions] = useState<QuizQuestionView[]>([]);
  const [index, setIndex] = useState(0);
  const [outcomes, setOutcomes] = useState<QuizOutcome[]>([]);
  const [attemptError, setAttemptError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setGenError(null);
    setEmptyDeck(false);
    setOutcomes([]);
    setIndex(0);
    setGenStep(0);
    setGenTotal(0);
    setGenState("queued");
    setPhase("loading");
    try {
      const { jobId: id } = await generateQuiz({
        deckId: deckIdFor(deck),
        length: Number(length),
        style: style as QuizStyleOption,
        direction: direction as QuizDirectionOption,
      });
      setJobId(id);
    } catch (err) {
      setGenState(null);
      if (err instanceof ApiError && err.code === "no_eligible_words") {
        setEmptyDeck(true);
        setPhase("setup");
        return;
      }
      setGenError("Couldn't write questions. Try a shorter quiz, or retry.");
    }
  }, [deck, length, style, direction]);

  // Poll the generation job, then load the question set.
  useEffect(() => {
    if (jobId === null) return;
    let active = true;
    const poll = async () => {
      try {
        const res = await fetchQuizQuestions(jobId);
        if (!active) return;
        setGenState(res.status as JobState);
        if (res.progress) {
          setGenStep(res.progress.step);
          setGenTotal(res.progress.total);
        }
        if (res.status === "done") {
          setJobId(null);
          if (res.questions.length === 0) {
            setGenError(
              "Couldn't write questions. Try a shorter quiz, or retry.",
            );
            return;
          }
          setQuestions(res.questions);
          setIndex(0);
          setPhase("play");
        } else if (res.status === "failed") {
          setJobId(null);
          setGenError(
            "Couldn't write questions. Try a shorter quiz, or retry.",
          );
        }
      } catch {
        // transient poll failure: keep the last state and retry
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), pollIntervalMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [jobId, pollIntervalMs]);

  const recordOutcome = useCallback((outcome: QuizOutcome) => {
    setOutcomes((prev) => [...prev, outcome]);
  }, []);

  // The explanation arrives async after the local grade; patch it into the
  // recorded outcome so the Results reveal has it too.
  const recordExplanation = useCallback(
    (questionId: number, explanation: string) => {
      setOutcomes((prev) =>
        prev.map((o) =>
          o.question.id === questionId ? { ...o, explanation } : o,
        ),
      );
    },
    [],
  );

  const finish = useCallback(
    (all: QuizOutcome[]) => {
      const answers: QuizAttemptAnswer[] = all.map((o) => ({
        questionId: o.question.id,
        given: o.given,
        correct: o.correct,
      }));
      // Persist the attempt; the session is already saved per-answer, so a
      // failure here only loses the aggregate record — but surface it anyway.
      setAttemptError(null);
      submitAttempt({
        deckId: deckIdFor(deck),
        style: style as QuizStyleOption,
        direction: direction as QuizDirectionOption,
        answers,
      }).catch((err) => {
        setAttemptError(
          err instanceof ApiError
            ? err.message
            : "Couldn't save the attempt summary.",
        );
      });
      setPhase("results");
    },
    [deck, style, direction],
  );

  const advance = useCallback(() => {
    setIndex((i) => {
      if (i + 1 >= questions.length) {
        setOutcomes((all) => {
          finish(all);
          return all;
        });
        return i;
      }
      return i + 1;
    });
  }, [questions.length, finish]);

  const score = useMemo(
    () => outcomes.filter((o) => o.correct).length,
    [outcomes],
  );
  const missed = useMemo(
    () => outcomes.filter((o) => !o.correct).map((o) => o.question),
    [outcomes],
  );

  const retakeMissed = useCallback(() => {
    setQuestions(missed);
    setOutcomes([]);
    setIndex(0);
    setAttemptError(null);
    setPhase("play");
  }, [missed]);

  // ---- Setup ----
  if (phase === "setup") {
    return (
      <main className="quiz">
        <h1 className="quiz__title">Quiz</h1>
        <div className="quiz__setup">
          <SegmentedControl
            label="Deck"
            options={DECK_OPTIONS}
            value={deck}
            onChange={setDeck}
          />
          <SegmentedControl
            label="Length"
            options={LENGTH_OPTIONS}
            value={length}
            onChange={setLength}
          />
          <SegmentedControl
            label="Style"
            options={STYLE_OPTIONS}
            value={style}
            onChange={setStyle}
          />
          <SegmentedControl
            label="Direction"
            options={DIRECTION_OPTIONS}
            value={direction}
            onChange={setDirection}
          />

          {emptyDeck ? (
            <EmptyState message="No words yet. Ingest something first.">
              <Button
                variant="quiet"
                onClick={() => window.location.assign("/ingest")}
              >
                Ingest
              </Button>
            </EmptyState>
          ) : (
            <Button
              variant="primary"
              disabled={emptyDeck}
              onClick={() => void start()}
            >
              Start quiz
            </Button>
          )}

          {genError && (
            <JobStatus
              state="failed"
              stage={genError}
              onRetry={() => void start()}
            />
          )}
        </div>
      </main>
    );
  }

  // ---- Loading (generating questions) ----
  if (phase === "loading") {
    return (
      <main className="quiz">
        <h1 className="quiz__title">Quiz</h1>
        <div className="quiz__setup">
          {genError ? (
            <JobStatus
              state="failed"
              stage={genError}
              onRetry={() => void start()}
            />
          ) : (
            <JobStatus
              state={(genState ?? "queued") as JobState}
              stage={
                genTotal > 0
                  ? `Writing questions… ${genStep} of ${genTotal}`
                  : "Writing questions…"
              }
              progress={genTotal > 0 ? genStep / genTotal : undefined}
            />
          )}
        </div>
      </main>
    );
  }

  // ---- Results ----
  if (phase === "results") {
    return (
      <main className="quiz quiz--results">
        <p className="quiz__score">
          {score} of {outcomes.length}
        </p>
        <ul className="quiz__results-list">
          {outcomes.map((o, i) => (
            <ResultRow key={`${o.question.id}-${i}`} outcome={o} />
          ))}
        </ul>
        {attemptError && (
          <span className="quiz__grade-error">{attemptError}</span>
        )}
        <div className="quiz__results-actions">
          {missed.length > 0 && (
            <Button variant="quiet" onClick={retakeMissed}>
              Retake missed
            </Button>
          )}
          <Button variant="primary" onClick={() => window.location.assign("/")}>
            Done
          </Button>
        </div>
      </main>
    );
  }

  // ---- Play ----
  const total = questions.length;
  const current = questions[index];
  return (
    <main className="quiz quiz--play">
      <header className="review__bar">
        <span className="review__progress-text">
          Q {index + 1} of {total}
        </span>
        <div className="review__progress-track" aria-hidden="true">
          <div
            className="review__progress-fill"
            style={{ width: `${(outcomes.length / total) * 100}%` }}
          />
        </div>
      </header>

      {current && (
        <QuizCard
          key={`${current.id}-${index}`}
          question={current}
          onAnswered={recordOutcome}
          onExplained={recordExplanation}
          onNext={advance}
        />
      )}
    </main>
  );
}
