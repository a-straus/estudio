import type { Express, Request, Response } from "express";
import type { ProgressSummary } from "@estudio/shared";
import type { DB } from "../db/db.js";
import { getProgressSummary } from "../db/progress-queries.js";

/** GET /api/progress — read-only aggregates for the Progress screen. */
export function registerProgressRoutes(app: Express, db: DB): void {
  app.get("/api/progress", (_req: Request, res: Response) => {
    const body: ProgressSummary = getProgressSummary(db);
    res.json(body);
  });
}
