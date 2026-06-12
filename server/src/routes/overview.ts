import type { Express, Request, Response } from "express";
import type { OverviewSummary } from "@estudio/shared";
import type { DB } from "../db/db.js";
import { getOverviewSummary } from "../db/overview-queries.js";

/**
 * Overview route — the one read shared by the Home screen and the SiteFooter
 * (home.md / shell.md: "one fetch, shared"). Read-only: aggregates existing
 * tables, writes nothing, triggers no LLM calls.
 */
export function registerOverviewRoutes(app: Express, db: DB): void {
  app.get("/api/overview", (_req: Request, res: Response) => {
    const body: OverviewSummary = getOverviewSummary(db);
    res.json(body);
  });
}
