import type { Express, Request, Response } from "express";
import {
  normalize,
  type GrammarSeedResponse,
  type LessonAnswerResponse,
  type LessonAttemptAnswer,
  type LessonAttemptResponse,
  type LessonGenerateResponse,
  type LessonJobResponse,
  type LessonQuestionView,
  type LessonResponse,
  type LessonVerdict,
  type LessonView,
} from "@estudio/shared";
import type { DB } from "../db/db.js";
import {
  countGrammarCategories,
  getGrammarHome,
  getGrammarTopic,
  getLatestLesson,
  getLessonById,
  getLessonJob,
  getLessonQuestion,
  getLessonQuestions,
  insertLessonAttempt,
  updateTopicMastery,
  type LessonQuestionRow,
  type LessonRow,
} from "../db/grammar-queries.js";
import { enqueueGrammarSeed } from "../jobs/grammarSeed.js";
import { enqueueLessonGen, JOB_TYPE_LESSON_GEN } from "../jobs/lessonGen.js";
import type { JobQueue } from "../jobs/queue.js";
import type { LlmService } from "../llm/service.js";
import { logger } from "../logger.js";

function error(res: Response, status: number, message: string, code: string) {
  res.status(status).json({ error: { message, code } });
}

function toQuestionView(q: LessonQuestionRow): LessonQuestionView {
  return {
    id: q.id,
    style: q.style,
    prompt: q.payload.prompt,
    options: q.payload.options ?? null,
  };
}

function toLessonView(
  db: DB,
  lesson: LessonRow & { topicName: string },
): LessonView {
  return {
    id: lesson.id,
    topicId: lesson.topicId,
    topicName: lesson.topicName,
    explanation: lesson.content.explanation,
    examples: lesson.content.examples,
    questions: getLessonQuestions(db, lesson.id).map(toQuestionView),
  };
}

interface GradingVerdict {
  verdict: LessonVerdict;
  feedback: string;
}

function parseGrading(text: string): GradingVerdict {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "")
    .trim();
  const start = trimmed.search(/[{[]/);
  if (start === -1) throw new Error(`no JSON in grading response: ${text.slice(0, 200)}`);
  const parsed = JSON.parse(trimmed.slice(start)) as Record<string, unknown>;
  if (
    parsed.verdict !== "correct" &&
    parsed.verdict !== "partial" &&
    parsed.verdict !== "incorrect"
  ) {
    throw new Error(`grading response has no verdict: ${text.slice(0, 200)}`);
  }
  const feedback =
    typeof parsed.feedback === "string" ? parsed.feedback.trim() : "";
  return { verdict: parsed.verdict, feedback };
}

/**
 * Grade one lesson-quiz answer against the stored, authoritative payload:
 * - def_match: local exact-option match.
 * - fill_in / conjugation: exact/normalized match first; near-misses fall back
 *   to LLM judgment.
 * - free_text: always LLM-graded against the model answer.
 * "Don't know" (given === null) is always incorrect and makes no LLM call.
 */
export async function gradeLessonAnswer(
  llm: LlmService | undefined,
  q: LessonQuestionRow,
  given: string | null,
): Promise<{ verdict: LessonVerdict; correctAnswer: string | null; feedback: string | null }> {
  const { payload } = q;

  if (payload.style === "def_match") {
    return {
      verdict: given !== null && given === payload.correct ? "correct" : "incorrect",
      correctAnswer: payload.correct ?? null,
      feedback: null,
    };
  }

  const reference =
    payload.style === "free_text"
      ? (payload.sample ?? null)
      : (payload.correct ?? null);

  if (given === null) {
    return { verdict: "incorrect", correctAnswer: reference, feedback: null };
  }

  // fill_in / conjugation accept an exact/normalized match without an LLM call.
  if (
    (payload.style === "fill_in" || payload.style === "conjugation") &&
    payload.correct !== undefined &&
    normalize(given) === normalize(payload.correct)
  ) {
    return { verdict: "correct", correctAnswer: reference, feedback: null };
  }

  // Near-miss (fill_in/conjugation) or any free_text: LLM judgment.
  if (!llm) {
    // No grader available: fall back to a strict local verdict rather than 500.
    return { verdict: "incorrect", correctAnswer: reference, feedback: null };
  }
  const raw = await llm.complete("quiz_grading", {
    prompt: payload.prompt,
    expected: reference ?? "(no reference answer)",
    given,
  });
  const verdict = parseGrading(raw);
  return {
    verdict: verdict.verdict,
    correctAnswer: reference,
    feedback: verdict.feedback || null,
  };
}

/**
 * Grammar routes: the curriculum home + seeding (unchanged), plus the lesson
 * layer — generate a lesson (job), serve the cached lesson + quiz set, grade a
 * single answer (synchronous; single grading calls are <2s), and record a
 * completed attempt which updates topic mastery via an EMA.
 */
export function registerGrammarRoutes(
  app: Express,
  db: DB,
  queue?: JobQueue,
  llm?: LlmService,
): void {
  app.get("/api/grammar", (_req: Request, res: Response) => {
    res.json(getGrammarHome(db));
  });

  app.post("/api/grammar/seed", (_req: Request, res: Response) => {
    if (!queue) {
      error(res, 503, "Seeding is unavailable: no job queue.", "queue_unavailable");
      return;
    }
    if (countGrammarCategories(db) > 0) {
      error(res, 409, "The grammar curriculum is already seeded.", "already_seeded");
      return;
    }
    const jobId = enqueueGrammarSeed(queue);
    const body: GrammarSeedResponse = { jobId };
    res.status(202).json(body);
  });

  // Serve the latest cached lesson for a topic (null when none generated yet).
  app.get("/api/grammar/topics/:id/lesson", (req: Request, res: Response) => {
    const topicId = Number(req.params.id);
    if (!Number.isInteger(topicId) || !getGrammarTopic(db, topicId)) {
      error(res, 404, "Topic not found", "not_found");
      return;
    }
    const latest = getLatestLesson(db, topicId);
    let lesson: LessonView | null = null;
    if (latest) {
      const withName = getLessonById(db, latest.id);
      if (withName) lesson = toLessonView(db, withName);
    }
    const body: LessonResponse = { lesson };
    res.json(body);
  });

  // Enqueue lesson generation (first open or an explicit regenerate). Always a
  // new lesson row; the old one is kept (lessons are cached forever).
  app.post("/api/grammar/topics/:id/lesson", (req: Request, res: Response) => {
    if (!queue) {
      error(res, 503, "Lesson generation is unavailable: no job queue.", "queue_unavailable");
      return;
    }
    const topicId = Number(req.params.id);
    if (!Number.isInteger(topicId) || !getGrammarTopic(db, topicId)) {
      error(res, 404, "Topic not found", "not_found");
      return;
    }
    const jobId = enqueueLessonGen(queue, topicId);
    const body: LessonGenerateResponse = { jobId };
    res.status(202).json(body);
  });

  // Poll a lesson_gen job; when done, return the generated lesson + quiz set.
  app.get("/api/grammar/lessons/:jobId", (req: Request, res: Response) => {
    const jobId = Number(req.params.jobId);
    const job = Number.isInteger(jobId) ? getLessonJob(db, jobId) : null;
    if (!job || job.type !== JOB_TYPE_LESSON_GEN) {
      error(res, 404, "Lesson job not found", "not_found");
      return;
    }
    let lesson: LessonView | null = null;
    if (job.status === "done") {
      const result = job.progress as { lessonId?: number } | null;
      if (result?.lessonId) {
        const withName = getLessonById(db, result.lessonId);
        if (withName) lesson = toLessonView(db, withName);
      }
    }
    const body: LessonJobResponse = {
      status: job.status,
      error: job.error,
      lesson,
    };
    res.json(body);
  });

  // Grade one lesson-quiz answer (server-authoritative).
  app.post("/api/grammar/answer", (req: Request, res: Response) => {
    const body = req.body ?? {};
    const questionId = body.questionId;
    const given: string | null = typeof body.given === "string" ? body.given : null;

    if (!Number.isInteger(questionId)) {
      error(res, 400, "questionId must be an integer", "invalid_question_id");
      return;
    }
    const q = getLessonQuestion(db, questionId);
    if (!q) {
      error(res, 404, "Question not found", "not_found");
      return;
    }

    void gradeLessonAnswer(llm, q, given)
      .then((graded) => {
        const response: LessonAnswerResponse = {
          verdict: graded.verdict,
          correctAnswer: graded.correctAnswer,
          explanation: q.explanation,
          feedback: graded.feedback,
        };
        res.json(response);
      })
      .catch((err: unknown) => {
        logger.error("request", "lesson grading failed", {
          questionId,
          err: err instanceof Error ? err : new Error(String(err)),
        });
        error(res, 502, "Couldn't grade that answer. Try again.", "grading_failed");
      });
  });

  // Record a completed lesson-quiz attempt; update topic mastery via the EMA.
  app.post("/api/grammar/attempt", (req: Request, res: Response) => {
    const body = req.body ?? {};
    const topicId = body.topicId;
    const answers: LessonAttemptAnswer[] = body.answers;

    if (!Number.isInteger(topicId) || !getGrammarTopic(db, topicId)) {
      error(res, 404, "Topic not found", "not_found");
      return;
    }
    if (!Array.isArray(answers) || answers.length === 0) {
      error(res, 400, "answers must be a non-empty array", "invalid_answers");
      return;
    }

    // A correct answer weighs 1, a partial 0.5, an incorrect 0 in the EMA.
    const verdictWeight = (v: LessonVerdict): number =>
      v === "correct" ? 1 : v === "partial" ? 0.5 : 0;
    const score =
      answers.reduce((sum, a) => sum + verdictWeight(a.verdict), 0) /
      answers.length;

    // quiz_attempt.style stores one concrete style; a lesson quiz mixes styles,
    // so we record the first question's style — the per-question detail lives in
    // the answers JSON.
    const firstStyle =
      getLessonQuestion(db, answers[0]!.questionId)?.style ?? "free_text";

    const id = insertLessonAttempt(db, {
      topicId,
      style: firstStyle,
      answers,
    });
    const { masteryBefore, mastery } = updateTopicMastery(db, topicId, score);

    const response: LessonAttemptResponse = { id, masteryBefore, mastery };
    res.status(201).json(response);
  });
}
