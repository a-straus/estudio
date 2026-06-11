import { type DB } from "../db/db.js";
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

/** Enqueue the one-shot curriculum seeding job. */
export function enqueueGrammarSeed(queue: JobQueue): number {
  return queue.enqueue(JOB_TYPE_GRAMMAR_SEED, {});
}

/**
 * Generate the grammar curriculum once and persist it to grammar_category /
 * grammar_topic. Idempotent: if any category already exists the job no-ops
 * (seeded:false in the result) and makes no LLM call — the curriculum is never
 * duplicated. Resume-safe: the same gate means a retry after a partial commit
 * (the insert is one transaction, so a partial never lands) does nothing.
 */
export async function runGrammarSeed(
  db: DB,
  llm: LlmService,
): Promise<GrammarSeedResult> {
  if (countGrammarCategories(db) > 0) {
    logger.info("grammar curriculum already seeded; skipping", {});
    return { seeded: false, categories: 0, topics: 0 };
  }

  const categories = parseCurriculum(await llm.complete("grammar_curriculum"));
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
