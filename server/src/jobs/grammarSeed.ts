import { nowIso, type DB } from "../db/db.js";
import {
  countGrammarCategories,
  insertCurriculum,
  type CurriculumInput,
} from "../db/grammar-queries.js";
import { logger } from "../logger.js";
import type { LlmService } from "../llm/service.js";
import type { JobQueue } from "./queue.js";

export const JOB_TYPE_GRAMMAR_SEED = "grammar_seed";

/** The seeding job carries no input — it generates the whole curriculum once. */
export type GrammarSeedPayload = Record<string, never>;

export interface GrammarSeedResult {
  seeded: boolean;
  categories: number;
  topics: number;
}

/** Progress JSON streamed onto the job row while the curriculum builds. */
interface GrammarSeedProgress {
  phase: "generating" | "writing";
  categories: number;
  topics: number;
}

/** Enqueue the one-shot curriculum seeding job. */
export function enqueueGrammarSeed(queue: JobQueue): number {
  return queue.enqueue(JOB_TYPE_GRAMMAR_SEED, {});
}

/**
 * Find the id of the grammar_seed job currently executing, so the handler can
 * stream progress onto its own row. The queue runs one job per tick and the
 * seed job is one-shot/idempotent, so at most one such row is ever `running`.
 * Returns undefined when called outside the queue (e.g. a direct unit test).
 */
function runningJobId(db: DB): number | undefined {
  const row = db
    .prepare(
      "SELECT id FROM job WHERE type = ? AND status = 'running' ORDER BY id DESC LIMIT 1",
    )
    .get(JOB_TYPE_GRAMMAR_SEED) as { id: number } | undefined;
  return row?.id;
}

function writeProgress(
  db: DB,
  jobId: number | undefined,
  progress: GrammarSeedProgress,
): void {
  if (jobId === undefined) return;
  db.prepare("UPDATE job SET progress = ?, updated_at = ? WHERE id = ?").run(
    JSON.stringify(progress),
    nowIso(),
    jobId,
  );
}

/**
 * Generate the grammar curriculum once and persist it to grammar_category /
 * grammar_topic. Idempotent: if any category already exists the job no-ops
 * (seeded:false in the result) and makes no LLM call — the curriculum is never
 * duplicated. Resume-safe: the same gate means a retry after a partial commit
 * (the insert is one transaction, so a partial never lands) does nothing.
 *
 * Streams coarse progress onto the job row: "generating" while the model runs,
 * then "writing" with the category/topic counts once the rows are inserted.
 */
export async function runGrammarSeed(
  db: DB,
  llm: LlmService,
): Promise<GrammarSeedResult> {
  if (countGrammarCategories(db) > 0) {
    logger.info("grammar curriculum already seeded; skipping", {});
    return { seeded: false, categories: 0, topics: 0 };
  }

  const jobId = runningJobId(db);
  writeProgress(db, jobId, { phase: "generating", categories: 0, topics: 0 });
  const categories = parseCurriculum(await llm.complete("grammar_curriculum"));
  writeProgress(db, jobId, {
    phase: "writing",
    categories: categories.length,
    topics: categories.reduce((n, c) => n + c.topics.length, 0),
  });
  const counts = insertCurriculum(db, categories);
  logger.info("grammar curriculum seeded", counts);
  return { seeded: true, ...counts };
}

/**
 * Tolerate a markdown code fence / surrounding prose around the model's JSON.
 * Strip only a leading/trailing fence — never backticks elsewhere, which could
 * appear legitimately inside a JSON string value.
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

function parseCurriculum(text: string): CurriculumInput[] {
  const parsed = extractJson(text) as { categories?: unknown };
  if (!Array.isArray(parsed.categories) || parsed.categories.length === 0) {
    throw new Error(`invalid curriculum response: ${text.slice(0, 200)}`);
  }
  return parsed.categories.map((c: Record<string, unknown>, ci) => {
    if (typeof c.name !== "string" || c.name.trim() === "") {
      throw new Error(`curriculum category ${ci} has no name`);
    }
    if (!Array.isArray(c.topics) || c.topics.length === 0) {
      throw new Error(`curriculum category "${c.name}" has no topics`);
    }
    const topics = c.topics.map((t: Record<string, unknown>, ti) => {
      if (typeof t.name !== "string" || t.name.trim() === "") {
        throw new Error(`topic ${ti} in category "${c.name}" has no name`);
      }
      const description =
        typeof t.description === "string" && t.description.trim() !== ""
          ? t.description
          : null;
      return { name: t.name, description };
    });
    return { name: c.name, topics };
  });
}
