import type { Express, Request, Response } from "express";
import type { GrammarSeedResponse } from "@estudio/shared";
import type { DB } from "../db/db.js";
import {
  countGrammarCategories,
  getGrammarHome,
} from "../db/grammar-queries.js";
import { enqueueGrammarSeed } from "../jobs/grammarSeed.js";
import type { JobQueue } from "../jobs/queue.js";

/**
 * Grammar curriculum/home routes. GET returns the whole curriculum with the
 * read-time practice queue; POST /seed enqueues the one-shot seeding job and
 * refuses (409) once a curriculum exists, so it is never duplicated.
 */
export function registerGrammarRoutes(
  app: Express,
  db: DB,
  queue?: JobQueue,
): void {
  app.get("/api/grammar", (_req: Request, res: Response) => {
    res.json(getGrammarHome(db));
  });

  app.post("/api/grammar/seed", (_req: Request, res: Response) => {
    if (!queue) {
      res.status(503).json({
        error: {
          message: "Seeding is unavailable: no job queue.",
          code: "queue_unavailable",
        },
      });
      return;
    }
    if (countGrammarCategories(db) > 0) {
      res.status(409).json({
        error: {
          message: "The grammar curriculum is already seeded.",
          code: "already_seeded",
        },
      });
      return;
    }
    const jobId = enqueueGrammarSeed(queue);
    const body: GrammarSeedResponse = { jobId };
    res.status(202).json(body);
  });
}
