// Grammar curriculum/home API payload types — shared by the grammar routes
// (server) and the Grammar screen (web). JSON is camelCase.

/** A topic row with its mastery and the read-time derived fields the screen needs. */
export interface GrammarTopicView {
  id: number;
  categoryId: number;
  name: string;
  description: string | null;
  /** 0–1; defaults to 0 until the topic has been quizzed. */
  mastery: number;
  /** Quiz attempts recorded against this topic (derived from quiz_attempt). */
  quizCount: number;
  /** Times this topic has been seen in lessons (source_page links + lesson_insight). */
  seenInLessons: number;
}

/** A category with its ordered topics. */
export interface GrammarCategoryView {
  id: number;
  name: string;
  sortOrder: number;
  topics: GrammarTopicView[];
}

/**
 * GET /api/grammar — the whole curriculum plus the read-time practice queue.
 * `seeded` is false when no curriculum exists yet (empty state offers seeding).
 */
export interface GrammarHomeResponse {
  seeded: boolean;
  categories: GrammarCategoryView[];
  /** Up to 3 lowest-mastery topics, surfaced for "PRACTICE NEXT". */
  practiceQueue: GrammarTopicView[];
}

/** POST /api/grammar/seed — enqueues the seeding job; client polls /api/jobs. */
export interface GrammarSeedResponse {
  jobId: number;
}

// ---- Lessons + lesson quizzes ----

/** The four quiz styles a lesson question can take. */
export type LessonQuestionStyle =
  | "def_match"
  | "fill_in"
  | "conjugation"
  | "free_text";

/** One Spanish example with its English gloss, stored in lesson content. */
export interface LessonExample {
  es: string;
  en: string;
}

/**
 * One lesson quiz question as served to the client — never includes the
 * answer or the explanation (both revealed only after answering).
 */
export interface LessonQuestionView {
  /** quiz_question.id */
  id: number;
  style: LessonQuestionStyle;
  /** The question stem / instruction shown to the learner. */
  prompt: string;
  /** Multiple-choice options (def_match only); null otherwise. */
  options: string[] | null;
}

/** A cached lesson: the reading plus its quiz set. */
export interface LessonView {
  id: number;
  topicId: number;
  topicName: string;
  explanation: string;
  examples: LessonExample[];
  questions: LessonQuestionView[];
}

/**
 * GET /api/grammar/topics/:id/lesson — the latest cached lesson for a topic,
 * or null when none has been generated yet (the screen offers to generate it).
 */
export interface LessonResponse {
  lesson: LessonView | null;
}

/** POST /api/grammar/topics/:id/lesson — enqueues lesson_gen; client polls. */
export interface LessonGenerateResponse {
  jobId: number;
}

/** GET /api/grammar/lessons/:jobId — poll generation; lesson set when done. */
export interface LessonJobResponse {
  status: "queued" | "running" | "done" | "failed";
  error: string | null;
  lesson: LessonView | null;
}

export interface LessonAnswerRequest {
  questionId: number;
  /** The learner's answer, or null for "Don't know". */
  given: string | null;
}

export interface LessonAnswerResponse {
  correct: boolean;
  /** The reference answer for the reveal; null for free_text with no key. */
  correctAnswer: string | null;
  /** The eagerly-generated "explain why", cached with the question. */
  explanation: string;
  /** One-sentence LLM feedback when the answer was LLM-graded; null otherwise. */
  feedback: string | null;
}

export interface LessonAttemptAnswer {
  questionId: number;
  given: string | null;
  correct: boolean;
}

export interface LessonAttemptRequest {
  topicId: number;
  answers: LessonAttemptAnswer[];
}

export interface LessonAttemptResponse {
  id: number;
  /** Topic mastery before this attempt (0–1). */
  masteryBefore: number;
  /** Topic mastery after the EMA update (0–1). */
  mastery: number;
}
