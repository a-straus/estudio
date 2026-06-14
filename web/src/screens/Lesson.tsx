import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  LessonQuestionView,
  LessonVerdict,
  LessonView,
} from "@estudio/shared";
import {
  Button,
  EmptyState,
  JobStatus,
  QuizOption,
  TextInput,
  Toast,
  type JobState,
  type QuizOptionState,
} from "../components";
import { TappableText } from "../components/TappableText";
import {
  answerLesson,
  ApiError,
  fetchLesson,
  fetchLessonJob,
  generateLesson,
  submitLessonAttempt,
} from "./grammarApi";
import { NoteAffordance } from "./NoteAffordance";
import "./Lesson.css";

interface LessonProps {
  topicId: number;
  /** Poll interval for the generation job; overridable in tests. */
  pollIntervalMs?: number;
}

type Phase = "loading" | "generating" | "reading" | "practice" | "results";

/** The per-question outcome accumulated through Practice, shown in Results. */
export interface LessonOutcome {
  question: LessonQuestionView;
  given: string | null;
  verdict: LessonVerdict;
  correctAnswer: string | null;
  explanation: string;
  feedback: string | null;
}

/** The exact verdict strings shown to the learner. */
const VERDICT_LABEL: Record<LessonVerdict, string> = {
  correct: "Correct.",
  partial: "Partly right.",
  incorrect: "Not quite.",
};

/** Split the explanation into paragraphs on blank lines. */
function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

const STYLE_PROMPT: Record<string, string> = {
  def_match: "Choose the correct answer.",
  fill_in: "Fill in the blank.",
  conjugation: "Give the correct form.",
  free_text: "Write your answer in Spanish.",
};

interface LessonQuizCardProps {
  question: LessonQuestionView;
  index: number;
  total: number;
  onAnswered: (outcome: LessonOutcome) => void;
  onNext: () => void;
}

function LessonQuizCard({
  question,
  index,
  total,
  onAnswered,
  onNext,
}: LessonQuizCardProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [outcome, setOutcome] = useState<LessonOutcome | null>(null);
  const [pending, setPending] = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);

  const isChoice = question.style === "def_match";

  const grade = useCallback(
    async (given: string | null) => {
      if (outcome || pending) return;
      setPending(true);
      setGradeError(null);
      try {
        const res = await answerLesson({ questionId: question.id, given });
        const result: LessonOutcome = {
          question,
          given,
          verdict: res.verdict,
          correctAnswer: res.correctAnswer,
          explanation: res.explanation,
          feedback: res.feedback,
        };
        setOutcome(result);
        onAnswered(result);
      } catch (err) {
        setGradeError(
          err instanceof ApiError
            ? err.message
            : "Couldn't grade that answer. Try again.",
        );
      } finally {
        setPending(false);
      }
    },
    [outcome, pending, question, onAnswered],
  );

  const check = useCallback(() => {
    if (isChoice) {
      if (selected === null) return;
      void grade(question.options![selected]);
    } else {
      if (text.trim() === "") return;
      void grade(text.trim());
    }
  }, [isChoice, selected, text, question.options, grade]);

  const optionState = (i: number): QuizOptionState => {
    if (!outcome) return selected === i ? "selected" : "default";
    if (question.options![i] === outcome.correctAnswer) return "correct";
    if (i === selected && outcome.verdict !== "correct") return "incorrect";
    return "disabled";
  };

  return (
    <div className="lesson-quiz__card">
      <header className="lesson-quiz__bar">
        <span className="lesson-quiz__progress-text">
          Q {index + 1} of {total}
        </span>
        <div className="lesson-quiz__progress-track" aria-hidden="true">
          <div
            className="lesson-quiz__progress-fill"
            style={{
              width: `${(((outcome ? index + 1 : index) / total) * 100).toFixed(2)}%`,
            }}
          />
        </div>
      </header>

      <p className="lesson-quiz__instruction">{STYLE_PROMPT[question.style]}</p>
      <p className="lesson-quiz__prompt">{question.prompt}</p>

      {isChoice ? (
        <div className="lesson-quiz__options" role="group">
          {question.options!.map((opt, i) => (
            <QuizOption
              key={i}
              ordinal={i + 1}
              cloze
              state={optionState(i)}
              onClick={() => {
                if (!outcome) setSelected(i);
              }}
            >
              {opt}
            </QuizOption>
          ))}
        </div>
      ) : (
        <div className="lesson-quiz__answer">
          <TextInput
            label="Your answer"
            value={outcome ? (outcome.given ?? "") : text}
            onChange={setText}
            study
            multiline={question.style === "free_text"}
            disabled={outcome !== null || pending}
            placeholder="Escribe aquí…"
          />
        </div>
      )}

      {outcome && (
        <div className="lesson-quiz__reveal" data-verdict={outcome.verdict}>
          <span className="lesson-quiz__verdict">
            {VERDICT_LABEL[outcome.verdict]}
          </span>
          {outcome.verdict !== "correct" && outcome.correctAnswer && (
            <p className="lesson-quiz__correct">
              answer: <span className="lesson-quiz__correct-text">{outcome.correctAnswer}</span>
            </p>
          )}
          {outcome.feedback && (
            <p className="lesson-quiz__feedback">{outcome.feedback}</p>
          )}
          <Button
            variant="quiet"
            onClick={() => setShowExplanation((v) => !v)}
          >
            {showExplanation ? "Hide explanation" : "Explain why"}
          </Button>
          {showExplanation && (
            <p className="lesson-quiz__explanation">{outcome.explanation}</p>
          )}
        </div>
      )}

      <div className="lesson-quiz__actions">
        {!outcome ? (
          <>
            <Button
              variant="primary"
              disabled={pending || (isChoice ? selected === null : text.trim() === "")}
              onClick={check}
            >
              Check
            </Button>
            <Button
              variant="quiet"
              disabled={pending}
              onClick={() => void grade(null)}
            >
              Don&rsquo;t know
            </Button>
          </>
        ) : (
          <>
            <Button variant="primary" onClick={onNext}>
              {index + 1 >= total ? "See results" : "Next"}
            </Button>
            <NoteAffordance questionId={question.id} />
          </>
        )}
        {gradeError && (
          <span className="lesson-quiz__grade-error">{gradeError}</span>
        )}
      </div>
    </div>
  );
}

export function Lesson({ topicId, pollIntervalMs = 1000 }: LessonProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [lesson, setLesson] = useState<LessonView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [genJobId, setGenJobId] = useState<number | null>(null);
  const [genState, setGenState] = useState<JobState>("queued");
  const [genError, setGenError] = useState<string | null>(null);

  const [index, setIndex] = useState(0);
  const [outcomes, setOutcomes] = useState<LessonOutcome[]>([]);
  const [mastery, setMastery] = useState<{ before: number; after: number } | null>(
    null,
  );
  const [saveError, setSaveError] = useState<string | null>(null);

  const startGenerating = useCallback(async () => {
    setGenError(null);
    setGenState("queued");
    setPhase("generating");
    try {
      const { jobId } = await generateLesson(topicId);
      setGenJobId(jobId);
    } catch {
      setGenError("Couldn't start writing the lesson. Retry.");
    }
  }, [topicId]);

  // First open: load the cached lesson, or kick off generation if none exists.
  const load = useCallback(async () => {
    setLoadError(null);
    setPhase("loading");
    try {
      const { lesson: cached } = await fetchLesson(topicId);
      if (cached) {
        setLesson(cached);
        setPhase("reading");
      } else {
        void startGenerating();
      }
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Couldn't load the lesson.",
      );
    }
  }, [topicId, startGenerating]);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll the generation job; when done, drop into reading.
  useEffect(() => {
    if (genJobId === null) return;
    let active = true;
    const poll = async () => {
      try {
        const res = await fetchLessonJob(genJobId);
        if (!active) return;
        setGenState(res.status as JobState);
        if (res.status === "done") {
          setGenJobId(null);
          if (res.lesson) {
            setLesson(res.lesson);
            setPhase("reading");
          } else {
            setGenError("The lesson didn't finish. Retry.");
          }
        } else if (res.status === "failed") {
          setGenJobId(null);
          setGenError("The lesson didn't finish. Retry.");
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
  }, [genJobId, pollIntervalMs]);

  const startPractice = useCallback(() => {
    setOutcomes([]);
    setIndex(0);
    setMastery(null);
    setSaveError(null);
    setPhase("practice");
  }, []);

  const recordOutcome = useCallback((outcome: LessonOutcome) => {
    setOutcomes((prev) => [...prev, outcome]);
  }, []);

  // Persist the attempt (and its mastery update). The attempt is saved by this
  // single POST, so a failure must be surfaced — never swallowed — and retried.
  const saveAttempt = useCallback(
    (all: LessonOutcome[]) => {
      setSaveError(null);
      return submitLessonAttempt({
        topicId,
        answers: all.map((o) => ({
          questionId: o.question.id,
          given: o.given,
          verdict: o.verdict,
        })),
      })
        .then((res) =>
          setMastery({ before: res.masteryBefore, after: res.mastery }),
        )
        .catch((err) =>
          setSaveError(
            err instanceof ApiError
              ? err.message
              : "Couldn't save your results — mastery wasn't updated.",
          ),
        );
    },
    [topicId],
  );

  const finish = useCallback(
    (all: LessonOutcome[]) => {
      void saveAttempt(all);
      setPhase("results");
    },
    [saveAttempt],
  );

  const advance = useCallback(() => {
    setIndex((i) => {
      const questions = lesson?.questions ?? [];
      if (i + 1 >= questions.length) {
        setOutcomes((all) => {
          finish(all);
          return all;
        });
        return i;
      }
      return i + 1;
    });
  }, [lesson, finish]);

  const score = useMemo(
    () => outcomes.filter((o) => o.verdict === "correct").length,
    [outcomes],
  );

  const backToGrammar = () => window.location.assign("/grammar");

  // ---- Load error ----
  if (loadError) {
    return (
      <main className="lesson">
        <EmptyState message={`${loadError} Reload, or check System for details.`}>
          <Button variant="secondary" onClick={() => void load()}>
            Reload
          </Button>
        </EmptyState>
      </main>
    );
  }

  // ---- Loading / generating ----
  if (phase === "loading" || phase === "generating") {
    return (
      <main className="lesson">
        <button type="button" className="lesson__back" onClick={backToGrammar}>
          ← Grammar
        </button>
        {genError ? (
          <JobStatus
            state="failed"
            stage={genError}
            onRetry={() => void startGenerating()}
          />
        ) : phase === "generating" ? (
          <JobStatus state={genState} stage="Writing the lesson… ~40s" />
        ) : (
          <p className="lesson__status">Loading…</p>
        )}
      </main>
    );
  }

  if (!lesson) return null;

  // ---- Results ----
  if (phase === "results") {
    return (
      <main className="lesson lesson--results">
        <button type="button" className="lesson__back" onClick={backToGrammar}>
          ← Grammar
        </button>
        <p className="lesson__score">
          {score} of {outcomes.length}
        </p>
        {mastery && (
          <p className="lesson__mastery">
            Mastery {Math.round(mastery.before * 100)}% →{" "}
            <strong>{Math.round(mastery.after * 100)}%</strong>
          </p>
        )}
        <ul className="lesson__results-list">
          {outcomes.map((o, i) => (
            <li
              key={`${o.question.id}-${i}`}
              className="lesson-result"
              data-verdict={o.verdict}
            >
              <div className="lesson-result__head">
                <span className="lesson-result__prompt">{o.question.prompt}</span>
                <span
                  className="lesson-result__mark"
                  aria-label={VERDICT_LABEL[o.verdict]}
                >
                  {o.verdict === "correct" ? "✓" : o.verdict === "partial" ? "~" : "✗"}
                </span>
              </div>
              {o.verdict !== "correct" && o.correctAnswer && (
                <p className="lesson-result__correct">answer: {o.correctAnswer}</p>
              )}
              <p className="lesson-result__explanation">{o.explanation}</p>
            </li>
          ))}
        </ul>
        <div className="lesson__results-actions">
          <Button variant="quiet" onClick={startPractice}>
            Practice again
          </Button>
          <Button variant="primary" onClick={backToGrammar}>
            Done
          </Button>
        </div>
        {saveError && (
          <Toast
            variant="error"
            action={{
              label: "Retry save",
              onClick: () => void saveAttempt(outcomes),
            }}
            onDismiss={() => setSaveError(null)}
          >
            {saveError}
          </Toast>
        )}
      </main>
    );
  }

  // ---- Practice ----
  if (phase === "practice") {
    const questions = lesson.questions;
    if (questions.length === 0) {
      return (
        <main className="lesson">
          <EmptyState message="This lesson has no quiz questions yet.">
            <Button variant="secondary" onClick={() => setPhase("reading")}>
              Back to the lesson
            </Button>
          </EmptyState>
        </main>
      );
    }
    const current = questions[index];
    return (
      <main className="lesson lesson--practice">
        {current && (
          <LessonQuizCard
            key={`${current.id}-${index}`}
            question={current}
            index={index}
            total={questions.length}
            onAnswered={recordOutcome}
            onNext={advance}
          />
        )}
      </main>
    );
  }

  // ---- Reading ----
  return (
    <main className="lesson lesson--reading">
      <button type="button" className="lesson__back" onClick={backToGrammar}>
        ← Grammar
      </button>
      <article className="lesson__reading">
        <h1 className="lesson__title">{lesson.topicName}</h1>
        <p className="lesson__tap-hint">Tap a word to add it</p>
        {paragraphs(lesson.explanation).map((p, i) => (
          <p key={i} className="lesson__body">
            <TappableText text={p} language="en" />
          </p>
        ))}
        {lesson.examples.length > 0 && (
          <ul className="lesson__examples">
            {lesson.examples.map((ex, i) => (
              <li key={i} className="lesson__example">
                <span className="lesson__example-es">
                  <TappableText text={ex.es} language="es" />
                </span>
                <span className="lesson__example-en">
                  <TappableText text={ex.en} language="en" />
                </span>
              </li>
            ))}
          </ul>
        )}
      </article>
      <div className="lesson__cta">
        <Button variant="primary" onClick={startPractice}>
          Take the quiz
        </Button>
      </div>
    </main>
  );
}
