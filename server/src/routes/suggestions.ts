import type { Express } from "express";
import type { DB } from "../db/db.js";
import type { LlmService } from "../llm/service.js";

/**
 * Suggestions routes — STUB. app.ts already calls
 * `registerSuggestionRoutes(app, db, opts.llm)`; keep this exact
 * name/arity/types. The `suggestions` task OWNS and replaces this file:
 * the `suggestion` table (uniqueness enforced — nothing re-suggested),
 * LLM-selected one-at-a-time word/grammar-topic proposals via llm/service.ts
 * ('suggestion_select' task), add/skip, pool-exhausted empty state. Do NOT
 * edit app.ts.
 */
export function registerSuggestionRoutes(
  _app: Express,
  _db: DB,
  _llm?: LlmService,
): void {
  // intentionally empty until suggestions fills it in
}
