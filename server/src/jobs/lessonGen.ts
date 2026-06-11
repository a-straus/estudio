import type { LessonExample, LessonQuestionStyle } from "@estudio/shared";
import { type DB } from "../db/db.js";
import {
  getGrammarTopic,
  insertLesson,
  insertLessonQuestion,
  type LessonContent,
  type LessonQuestionPayload,
} from "../db/grammar-queries.js";
import { loadPrompt } from "../llm/prompts.js";
import { logger } from "../logger.js";
import type { LlmService } from "../llm/service.js";
import type { JobQueue } from "./queue.js";

export const JOB_TYPE_LESSON_GEN = "lesson_gen";

const STYLES: LessonQuestionStyle[] = [
  "def_match",
  "fill_in",
  "conjugation",
  "free_text",
];

export interface LessonGenPayload {
  topicId: number;
}

export interface LessonGenResult {
  lessonId: number;
  questionIds: number[];
}

export function enqueueLessonGen(queue: JobQueue, topicId: number): number {
  return queue.enqueue(JOB_TYPE_LESSON_GEN, { topicId });
}

/**
 * Tolerate a markdown code fence / surrounding prose around the model's JSON.
 * Same shape the other generation jobs use.
 */
function extractJson(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "")
    .trim();
  const start = trimmed.search(/[{[]/);
  if (start === -1)
    throw new Error(`no JSON in LLM response: ${text.slice(0, 200)}`);
  return JSON.parse(trimmed.slice(start));
}

interface ParsedQuestion {
  style: LessonQuestionStyle;
  payload: LessonQuestionPayload;
  explanation: string;
}

interface ParsedLesson {
  content: LessonContent;
  questions: ParsedQuestion[];
}

function parseExamples(raw: unknown): LessonExample[] {
  if (!Array.isArray(raw)) return [];
  const out: LessonExample[] = [];
  for (const e of raw) {
    const ex = e as Record<string, unknown>;
    if (
      typeof ex.es === "string" &&
      ex.es.trim() !== "" &&
      typeof ex.en === "string" &&
      ex.en.trim() !== ""
    ) {
      out.push({ es: ex.es, en: ex.en });
    }
  }
  return out;
}

function parseQuestion(raw: unknown, i: number): ParsedQuestion {
  const q = raw as Record<string, unknown>;
  const style = q.style as LessonQuestionStyle;
  if (!STYLES.includes(style)) {
    throw new Error(`lesson question ${i} has invalid style "${String(q.style)}"`);
  }
  if (typeof q.prompt !== "string" || q.prompt.trim() === "") {
    throw new Error(`lesson question ${i} has no prompt`);
  }
  if (typeof q.explanation !== "string" || q.explanation.trim() === "") {
    throw new Error(`lesson question ${i} has no explanation`);
  }
  const correct =
    typeof q.correct === "string" && q.correct.trim() !== "" ? q.correct : null;

  const payload: LessonQuestionPayload = { style, prompt: q.prompt };

  if (style === "def_match") {
    const options = Array.isArray(q.options)
      ? (q.options as unknown[]).filter(
          (o): o is string => typeof o === "string" && o.trim() !== "",
        )
      : [];
    if (options.length < 2) {
      throw new Error(`lesson def_match question ${i} needs at least two options`);
    }
    if (!correct || !options.includes(correct)) {
      throw new Error(`lesson def_match question ${i} correct is not an option`);
    }
    payload.options = options;
    payload.correct = correct;
  } else if (style === "free_text") {
    // free_text has no single key; keep the model answer as a grading reference.
    if (correct) payload.sample = correct;
  } else {
    // fill_in / conjugation need an exact/normalized answer to grade against.
    if (!correct) {
      throw new Error(`lesson ${style} question ${i} has no correct answer`);
    }
    payload.correct = correct;
  }

  return { style, payload, explanation: q.explanation };
}

function parseLesson(text: string): ParsedLesson {
  const parsed = extractJson(text) as Record<string, unknown>;
  if (typeof parsed.explanation !== "string" || parsed.explanation.trim() === "") {
    throw new Error(`lesson response has no explanation: ${text.slice(0, 200)}`);
  }
  if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
    throw new Error(`lesson response has no questions: ${text.slice(0, 200)}`);
  }
  const questions = parsed.questions.map((q, i) => parseQuestion(q, i));
  return {
    content: {
      explanation: parsed.explanation,
      examples: parseExamples(parsed.examples),
    },
    questions,
  };
}

/**
 * Generate a grammar lesson for one topic: call the LLM once to produce the
 * explanation + examples (stored as a lesson row) and a 4–6 question quiz set
 * (stored as quiz_question rows with lesson_id + topic_id set). Each question's
 * "explain why" is generated in the same call and persisted with it — never
 * lazily. Lessons are cached forever; this always writes a NEW lesson row, so a
 * regeneration keeps the old one.
 */
export async function runLessonGen(
  db: DB,
  llm: LlmService,
  payload: LessonGenPayload,
): Promise<LessonGenResult> {
  const topic = getGrammarTopic(db, payload.topicId);
  if (!topic) throw new Error(`grammar_topic ${payload.topicId} not found`);

  const promptVersion = loadPrompt("grammar_lesson").version;
  const raw = await llm.complete("grammar_lesson", {
    topicName: topic.name,
    topicDescription: topic.description ?? "",
  });
  const parsed = parseLesson(raw);

  const lessonId = insertLesson(db, {
    topicId: topic.id,
    content: parsed.content,
    promptVersion,
  });

  const questionIds = parsed.questions.map((q) =>
    insertLessonQuestion(db, {
      topicId: topic.id,
      lessonId,
      style: q.style,
      payload: q.payload,
      explanation: q.explanation,
      promptVersion,
    }),
  );

  logger.info("lesson generated", {
    topicId: topic.id,
    lessonId,
    questions: questionIds.length,
  });
  return { lessonId, questionIds };
}
