import type { Express } from "express";
import type { DB } from "../db/db.js";
import type { LlmService } from "../llm/service.js";

/**
 * Ask chat routes — STUB. app.ts already calls
 * `registerChatRoutes(app, db, opts.llm)`; keep this exact name/arity/types.
 * The `ask-chatbot` task OWNS and replaces this file: persistent
 * chat_thread / chat_message, page-context seeding, the server-side tool set
 * (add_word_to_deck, lookup_word, get_page_context) with inline mutation
 * confirmation, and every LLM turn routed through llm/service.ts ('chat'
 * task). Do NOT edit app.ts.
 */
export function registerChatRoutes(
  _app: Express,
  _db: DB,
  _llm?: LlmService,
): void {
  // intentionally empty until ask-chatbot fills it in
}
