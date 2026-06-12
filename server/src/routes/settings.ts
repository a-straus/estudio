import type { Express, Request, Response } from "express";
import type { DB } from "../db/db.js";

/**
 * User preferences backed by the `setting` table. Stub registered on base so
 * the System-screen Preferences task owns this file (and the System screen)
 * without touching app.ts. The system-preferences task fills in GET/PUT for
 * the definition-display and new-cards-per-day preferences.
 */
export function registerSettingsRoutes(app: Express, db: DB): void {
  app.get("/api/settings", (_req: Request, res: Response) => {
    const rows = db
      .prepare("SELECT key, value FROM setting")
      .all() as { key: string; value: string }[];
    const settings: Record<string, string> = {};
    for (const row of rows) settings[row.key] = row.value;
    res.json({ settings });
  });
}
