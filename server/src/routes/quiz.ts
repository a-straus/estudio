import type { Express, Request, Response } from "express";
import {
  normalize,
  type QuizAnswerResponse,
  type QuizAttemptResponse,
  type QuizDirectionOption,
  type QuizFlagResponse,
  type QuizGenerateResponse,
  type QuizProgress,
  type QuizQuestionsResponse,
  type QuizQuestionView,
  type QuizRenderDirection,
  type QuizStyleOption,
} from "@estudio/shared";
import type { DB } from "../db/db.js";
import { deckExists } from "../db/srs-queries.js";
import {
  countEligibleQuizWords,
  flagQuizQuestion,
  getQuizJob,
  getQuizQuestion,
  getQuizQuestionsByIds,
  insertQuizAttempt,
  recordQuizMiss,
  type QuizQuestionRow,
} from "../db/quiz-queries.js";
import { enqueueQuizGen } from "../jobs/quizGen.js";
import type { JobQueue } from "../jobs/queue.js";

const STYLES: QuizStyleOption[] = ["def_match", "cloze", "mixed"];
const DIRECTIONS: QuizDirectionOption[] = ["w2d", "d2w", "mixed"];

function error(res: Response, status: number, message: string, code: string) {
  res.status(status).json({ error: { message, code } });
}

function renderDirection(q: QuizQuestionRow): QuizRenderDirection {
  return q.payload.style === "cloze" ? "cloze" : q.payload.direction;
}

function toQuestionView(q: QuizQuestionRow): QuizQuestionView {
  return {
    id: q.id,
    wordId: q.wordId,
    style: q.style,
    direction: renderDirection(q),
    cue: q.payload.style === "def_match" ? q.payload.cue : null,
    stemBefore: q.payload.style === "cloze" ? q.payload.stemBefore : null,
    stemAfter: q.payload.style === "cloze" ? q.payload.stemAfter : null,
    options: q.payload.options,
    term: q.term,
    lemma: q.lemma,
    partOfSpeech: q.partOfSpeech,
    definitionEs: q.definitionEs,
    definitionEn: q.definitionEn,
    example: q.example,
  };
}

/** Grade a given answer against the stored, authoritative correct value. */
function grade(q: QuizQuestionRow, given: string | null): boolean {
  if (given === null) return false; // "Don't know"
  if (q.payload.style === "cloze") {
    return normalize(given) === normalize(q.payload.correct);
  }
  return given === q.payload.correct;
}

/**
 * Quiz routes: generate (enqueues quiz_gen), poll/serve the question set,
 * grade a single answer (server-authoritative; a miss writes the SRS failure),
 * persist an attempt, and flag a bad question. Registered in app.ts; needs the
 * queue for generation.
 */
export function registerQuizRoutes(
  app: Express,
  db: DB,
  queue?: JobQueue,
): void {
  // 1. Kick off generation.
  app.post("/api/quiz/generate", (req: Request, res: Response) => {
    if (!queue) {
      error(res, 503, "Quiz generation is unavailable: no job queue.", "queue_unavailable");
      return;
    }
    const body = req.body ?? {};
    const deckId = body.deckId;
    const length = body.length;
    const style = body.style;
    const direction = body.direction;

    if (!Number.isInteger(deckId) || !deckExists(db, deckId)) {
      error(res, 404, "Deck not found", "not_found");
      return;
    }
    if (!Number.isInteger(length) || length <= 0) {
      error(res, 400, "length must be a positive integer", "invalid_length");
      return;
    }
    if (!STYLES.includes(style)) {
      error(res, 400, "invalid style", "invalid_style");
      return;
    }
    if (!DIRECTIONS.includes(direction)) {
      error(res, 400, "invalid direction", "invalid_direction");
      return;
    }
    if (countEligibleQuizWords(db, deckId) === 0) {
      error(
        res,
        422,
        "This deck has no words to quiz yet. Ingest something first.",
        "no_eligible_words",
      );
      return;
    }

    const jobId = enqueueQuizGen(queue, { deckId, length, style, direction });
    const response: QuizGenerateResponse = { jobId };
    res.status(202).json(response);
  });

  // 2. Poll generation / fetch the finished question set.
  app.get("/api/quiz/:jobId/questions", (req: Request, res: Response) => {
    const jobId = Number(req.params.jobId);
    const job = Number.isInteger(jobId) ? getQuizJob(db, jobId) : null;
    if (!job) {
      error(res, 404, "Quiz job not found", "not_found");
      return;
    }

    const progress =
      job.progress &&
      typeof job.progress === "object" &&
      "total" in job.progress
        ? (job.progress as QuizProgress)
        : null;

    let questions: QuizQuestionView[] = [];
    if (job.status === "done") {
      const result = job.progress as { questionIds?: number[] } | null;
      const ids = Array.isArray(result?.questionIds) ? result!.questionIds : [];
      questions = getQuizQuestionsByIds(db, ids).map(toQuestionView);
    }

    const response: QuizQuestionsResponse = {
      status: job.status,
      // While running the row carries {step,total}; when done it carries the
      // result {step,total,questionIds} — both expose the step/total shape.
      progress: progress
        ? { step: progress.step, total: progress.total }
        : null,
      error: job.error,
      questions,
    };
    res.json(response);
  });

  // 3. Grade one answer; a miss writes the SRS failure and pulls the card due now.
  app.post("/api/quiz/answer", (req: Request, res: Response) => {
    const body = req.body ?? {};
    const questionId = body.questionId;
    const given: string | null =
      typeof body.given === "string" ? body.given : null;

    if (!Number.isInteger(questionId)) {
      error(res, 400, "questionId must be an integer", "invalid_question_id");
      return;
    }
    const q = getQuizQuestion(db, questionId);
    if (!q) {
      error(res, 404, "Question not found", "not_found");
      return;
    }

    const correct = grade(q, given);
    if (!correct && q.wordId !== null) {
      recordQuizMiss(db, {
        wordId: q.wordId,
        direction: renderDirection(q),
        quizQuestionId: q.style === "cloze" ? q.id : null,
      });
    }

    const response: QuizAnswerResponse = {
      correct,
      correctAnswer: q.payload.correct,
      explanation: q.explanation,
    };
    res.json(response);
  });

  // 4. Persist a completed attempt.
  app.post("/api/quiz/attempt", (req: Request, res: Response) => {
    const body = req.body ?? {};
    const deckId = body.deckId;
    const style = body.style;
    const direction = body.direction;
    const answers = body.answers;

    if (!Number.isInteger(deckId) || !deckExists(db, deckId)) {
      error(res, 404, "Deck not found", "not_found");
      return;
    }
    if (!STYLES.includes(style)) {
      error(res, 400, "invalid style", "invalid_style");
      return;
    }
    if (!DIRECTIONS.includes(direction)) {
      error(res, 400, "invalid direction", "invalid_direction");
      return;
    }
    if (!Array.isArray(answers)) {
      error(res, 400, "answers must be an array", "invalid_answers");
      return;
    }

    // quiz_attempt.direction only stores w2d/d2w; a mixed/cloze quiz is NULL.
    const storedDirection =
      direction === "w2d" || direction === "d2w" ? direction : null;
    const id = insertQuizAttempt(db, {
      deckId,
      style,
      direction: storedDirection,
      answers,
    });
    const response: QuizAttemptResponse = { id };
    res.status(201).json(response);
  });

  // 5. Flag a bad question (excluded from future serving, never deleted).
  app.post("/api/quiz/questions/:id/flag", (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || !flagQuizQuestion(db, id)) {
      error(res, 404, "Question not found", "not_found");
      return;
    }
    const response: QuizFlagResponse = { id, flagged: true };
    res.json(response);
  });
}
