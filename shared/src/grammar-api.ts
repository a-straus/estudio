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
