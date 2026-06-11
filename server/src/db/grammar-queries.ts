import type {
  GrammarCategoryView,
  GrammarHomeResponse,
  GrammarTopicView,
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
