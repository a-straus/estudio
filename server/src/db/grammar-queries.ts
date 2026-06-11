import type {
  GrammarCategoryView,
  GrammarHomeResponse,
  GrammarTopicView,
  LessonExample,
  LessonQuestionStyle,
} from "@estudio/shared";
import { nowIso, type DB } from "./db.js";

// snake_case → camelCase mapping happens here, at the query layer.

/** A category with its topics, as parsed from the seeding job's LLM output. */
export interface CurriculumInput {
  name: string;
  topics: { name: string; description: string | null }[];
}

/** How many categories already exist — the idempotency gate for seeding. */
export function countGrammarCategories(db: DB): number {
  const { c } = db
    .prepare("SELECT COUNT(*) AS c FROM grammar_category")
    .get() as { c: number };
  return c;
}

/**
 * Persist a freshly generated curriculum. Categories take their list index as
 * sort_order; topics default mastery 0 (the column default). Wrapped in one
 * transaction so a partial curriculum never lands.
 */
export function insertCurriculum(
  db: DB,
  categories: CurriculumInput[],
): { categories: number; topics: number } {
  const now = nowIso();
  const insertCategory = db.prepare(
    "INSERT INTO grammar_category (name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?)",
  );
  const insertTopic = db.prepare(
    "INSERT INTO grammar_topic (category_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  );
  let topicCount = 0;
  db.transaction(() => {
    categories.forEach((cat, i) => {
      const categoryId = Number(
        insertCategory.run(cat.name, i, now, now).lastInsertRowid,
      );
      for (const topic of cat.topics) {
        insertTopic.run(categoryId, topic.name, topic.description, now, now);
        topicCount += 1;
      }
    });
  })();
  return { categories: categories.length, topics: topicCount };
}

interface TopicRowDb {
  id: number;
  category_id: number;
  name: string;
  description: string | null;
  mastery: number;
  quiz_count: number;
  seen_in_lessons: number;
}

interface CategoryRowDb {
  id: number;
  name: string;
  sort_order: number;
}

function toTopicView(r: TopicRowDb): GrammarTopicView {
  return {
    id: r.id,
    categoryId: r.category_id,
    name: r.name,
    description: r.description,
    mastery: r.mastery,
    quizCount: r.quiz_count,
    seenInLessons: r.seen_in_lessons,
  };
}

/**
 * Every topic with its mastery and read-time derived counts:
 *   - quiz_count: attempts recorded against the topic (quiz_attempt)
 *   - seen_in_lessons: linked source pages + lessons that covered it
 * "Seen in lessons" is derived here, never a stored counter.
 */
function listTopics(db: DB): TopicRowDb[] {
  return db
    .prepare(
      `SELECT t.id, t.category_id, t.name, t.description, t.mastery,
              (SELECT COUNT(*) FROM quiz_attempt qa WHERE qa.topic_id = t.id) AS quiz_count,
              ((SELECT COUNT(*) FROM source_page sp WHERE sp.grammar_topic_id = t.id)
               + (SELECT COUNT(*) FROM lesson_insight li
                    WHERE li.topic_id = t.id AND li.type = 'topic_covered')) AS seen_in_lessons
         FROM grammar_topic t
        ORDER BY t.category_id, t.id`,
    )
    .all() as TopicRowDb[];
}

/**
 * The whole curriculum (categories → topics) plus the practice queue. The
 * queue is DERIVED here at read time from mastery + recency — lowest mastery
 * first, ties broken by least-recently-updated — never a stored queue.
 */
export function getGrammarHome(db: DB): GrammarHomeResponse {
  const categories = db
    .prepare(
      "SELECT id, name, sort_order FROM grammar_category ORDER BY sort_order, id",
    )
    .all() as CategoryRowDb[];

  const topics = listTopics(db);
  const byCategory = new Map<number, GrammarTopicView[]>();
  for (const row of topics) {
    const list = byCategory.get(row.category_id) ?? [];
    list.push(toTopicView(row));
    byCategory.set(row.category_id, list);
  }

  const categoryViews: GrammarCategoryView[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    sortOrder: c.sort_order,
    topics: byCategory.get(c.id) ?? [],
  }));

  const practiceQueue = db
    .prepare(
      `SELECT t.id, t.category_id, t.name, t.description, t.mastery,
              (SELECT COUNT(*) FROM quiz_attempt qa WHERE qa.topic_id = t.id) AS quiz_count,
              ((SELECT COUNT(*) FROM source_page sp WHERE sp.grammar_topic_id = t.id)
               + (SELECT COUNT(*) FROM lesson_insight li
                    WHERE li.topic_id = t.id AND li.type = 'topic_covered')) AS seen_in_lessons
         FROM grammar_topic t
        ORDER BY t.mastery ASC, t.updated_at ASC, t.id ASC
        LIMIT 3`,
    )
    .all() as TopicRowDb[];

  return {
    seeded: categories.length > 0,
    categories: categoryViews,
    practiceQueue: practiceQueue.map(toTopicView),
  };
}

/** Topic id + name list for the cheap deterministic page→topic match. */
export function listGrammarTopicsForMatching(
  db: DB,
): { id: number; name: string }[] {
  return db.prepare("SELECT id, name FROM grammar_topic ORDER BY id").all() as {
    id: number;
    name: string;
  }[];
}

// ---- Lessons + lesson quizzes ----

export interface GrammarTopicRow {
  id: number;
  name: string;
  description: string | null;
  mastery: number;
}

/** A single topic, or null when the id doesn't exist. */
export function getGrammarTopic(db: DB, id: number): GrammarTopicRow | null {
  const row = db
    .prepare("SELECT id, name, description, mastery FROM grammar_topic WHERE id = ?")
    .get(id) as
    | { id: number; name: string; description: string | null; mastery: number }
    | undefined;
  return row ?? null;
}

/** The JSON stored in lesson.content — explanation + examples ONLY. */
export interface LessonContent {
  explanation: string;
  examples: LessonExample[];
}

export function insertLesson(
  db: DB,
  lesson: { topicId: number; content: LessonContent; promptVersion: string },
): number {
  const now = nowIso();
  const result = db
    .prepare(
      `INSERT INTO lesson (topic_id, content, prompt_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      lesson.topicId,
      JSON.stringify(lesson.content),
      lesson.promptVersion,
      now,
      now,
    );
  return Number(result.lastInsertRowid);
}

export interface LessonRow {
  id: number;
  topicId: number;
  content: LessonContent;
}

/** The most recent lesson for a topic (lessons are cached forever, never deleted). */
export function getLatestLesson(db: DB, topicId: number): LessonRow | null {
  const row = db
    .prepare(
      "SELECT id, topic_id, content FROM lesson WHERE topic_id = ? ORDER BY id DESC LIMIT 1",
    )
    .get(topicId) as
    | { id: number; topic_id: number; content: string }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    topicId: row.topic_id,
    content: JSON.parse(row.content) as LessonContent,
  };
}

/** A lesson by its own id, with the topic name joined in. Null when missing. */
export function getLessonById(
  db: DB,
  id: number,
): (LessonRow & { topicName: string }) | null {
  const row = db
    .prepare(
      `SELECT l.id, l.topic_id, l.content, t.name AS topic_name
         FROM lesson l JOIN grammar_topic t ON t.id = l.topic_id
        WHERE l.id = ?`,
    )
    .get(id) as
    | { id: number; topic_id: number; content: string; topic_name: string }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    topicId: row.topic_id,
    content: JSON.parse(row.content) as LessonContent,
    topicName: row.topic_name,
  };
}

/** The JSON stored in a lesson quiz_question.payload, by style. */
export interface LessonQuestionPayload {
  style: LessonQuestionStyle;
  prompt: string;
  /** def_match: the multiple-choice options. */
  options?: string[];
  /** def_match / fill_in / conjugation: the correct answer. */
  correct?: string;
  /** free_text: a model answer used as the grading reference. */
  sample?: string;
}

export function insertLessonQuestion(
  db: DB,
  q: {
    topicId: number;
    lessonId: number;
    style: LessonQuestionStyle;
    payload: LessonQuestionPayload;
    explanation: string;
    promptVersion: string;
  },
): number {
  const now = nowIso();
  const result = db
    .prepare(
      `INSERT INTO quiz_question
         (word_id, topic_id, lesson_id, style, payload, explanation, prompt_version, flagged, created_at, updated_at)
       VALUES (NULL, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    )
    .run(
      q.topicId,
      q.lessonId,
      q.style,
      JSON.stringify(q.payload),
      q.explanation,
      q.promptVersion,
      now,
      now,
    );
  return Number(result.lastInsertRowid);
}

export interface LessonQuestionRow {
  id: number;
  style: LessonQuestionStyle;
  payload: LessonQuestionPayload;
  explanation: string;
}

function toLessonQuestionRow(r: {
  id: number;
  style: string;
  payload: string;
  explanation: string;
}): LessonQuestionRow {
  return {
    id: r.id,
    style: r.style as LessonQuestionStyle,
    payload: JSON.parse(r.payload) as LessonQuestionPayload,
    explanation: r.explanation,
  };
}

/** A lesson's quiz set, in id order, excluding flagged questions. */
export function getLessonQuestions(
  db: DB,
  lessonId: number,
): LessonQuestionRow[] {
  const rows = db
    .prepare(
      `SELECT id, style, payload, explanation
         FROM quiz_question
        WHERE lesson_id = ? AND flagged = 0
        ORDER BY id`,
    )
    .all(lessonId) as Parameters<typeof toLessonQuestionRow>[0][];
  return rows.map(toLessonQuestionRow);
}

/** One lesson question for grading; null when missing. */
export function getLessonQuestion(
  db: DB,
  id: number,
): LessonQuestionRow | null {
  const row = db
    .prepare("SELECT id, style, payload, explanation FROM quiz_question WHERE id = ?")
    .get(id) as Parameters<typeof toLessonQuestionRow>[0] | undefined;
  return row ? toLessonQuestionRow(row) : null;
}

/** Record a completed lesson-quiz attempt against a topic. */
export function insertLessonAttempt(
  db: DB,
  attempt: {
    topicId: number;
    style: LessonQuestionStyle;
    answers: unknown;
  },
): number {
  const now = nowIso();
  const result = db
    .prepare(
      `INSERT INTO quiz_attempt
         (deck_id, topic_id, style, direction, answers, created_at, updated_at)
       VALUES (NULL, ?, ?, NULL, ?, ?, ?)`,
    )
    .run(
      attempt.topicId,
      attempt.style,
      JSON.stringify(attempt.answers),
      now,
      now,
    );
  return Number(result.lastInsertRowid);
}

/**
 * Update a topic's mastery via an exponential moving average:
 *   mastery = 0.7 * mastery + 0.3 * score
 * where `score` is the fraction of the lesson quiz answered correctly (0–1).
 * Recent performance is weighted 30%, history 70%, so mastery tracks current
 * ability without lurching on a single attempt. Returns the previous mastery.
 */
export function updateTopicMastery(
  db: DB,
  topicId: number,
  score: number,
): { masteryBefore: number; mastery: number } {
  const topic = getGrammarTopic(db, topicId);
  if (!topic) throw new Error(`grammar_topic ${topicId} not found`);
  const masteryBefore = topic.mastery;
  const mastery = 0.7 * masteryBefore + 0.3 * score;
  db.prepare(
    "UPDATE grammar_topic SET mastery = ?, updated_at = ? WHERE id = ?",
  ).run(mastery, nowIso(), topicId);
  return { masteryBefore, mastery };
}

export interface LessonJobRow {
  id: number;
  type: string;
  status: "queued" | "running" | "done" | "failed";
  progress: unknown | null;
  error: string | null;
}

/** A job row for polling lesson generation. */
export function getLessonJob(db: DB, id: number): LessonJobRow | null {
  const row = db
    .prepare("SELECT id, type, status, progress, error FROM job WHERE id = ?")
    .get(id) as
    | {
        id: number;
        type: string;
        status: string;
        progress: string | null;
        error: string | null;
      }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    status: row.status as LessonJobRow["status"],
    progress: row.progress === null ? null : JSON.parse(row.progress),
    error: row.error,
  };
}
