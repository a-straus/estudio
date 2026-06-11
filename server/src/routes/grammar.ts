import type { Express } from "express";
import type { DB } from "../db/db.js";
import type { JobQueue } from "../jobs/queue.js";

// Grammar curriculum/home routes — implemented by the grammar-curriculum task.
export function registerGrammarRoutes(
  _app: Express,
  _db: DB,
  _queue?: JobQueue,
): void {}
