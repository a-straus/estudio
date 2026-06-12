import type { Express, Request, Response } from "express";
import type {
  GetSettingsResponse,
  PutSettingsRequest,
  PutSettingsResponse,
} from "@estudio/shared";
import { NEW_CARDS_PER_DAY_SETTING } from "../db/srs-queries.js";
import {
  ALLOWED_DEFINITION_DISPLAY,
  ALLOWED_NEW_CARDS_PER_DAY,
  ALLOWED_REVIEW_FORMAT,
  DEFINITION_DISPLAY_SETTING,
  REVIEW_FORMAT_SETTING,
  getSettings,
  upsertSetting,
} from "../db/settings-queries.js";
import type { DB } from "../db/db.js";

/**
 * User preferences backed by the `setting` table. GET returns the full,
 * defaulted preferences; PUT accepts a partial update, validates each provided
 * field against its allowed set, upserts, and returns the new state. Owned by
 * the System-screen Preferences task; wired into app.ts on base.
 */
export function registerSettingsRoutes(app: Express, db: DB): void {
  app.get("/api/settings", (_req: Request, res: Response) => {
    const body: GetSettingsResponse = { settings: getSettings(db) };
    res.json(body);
  });

  app.put("/api/settings", (req: Request, res: Response) => {
    const patch = (req.body ?? {}) as PutSettingsRequest;
    const invalid = (message: string) =>
      res.status(400).json({ error: { message, code: "invalid_setting" } });

    if (patch.definitionDisplay !== undefined) {
      if (!ALLOWED_DEFINITION_DISPLAY.includes(patch.definitionDisplay)) {
        invalid(
          `definitionDisplay must be one of: ${ALLOWED_DEFINITION_DISPLAY.join(", ")}`,
        );
        return;
      }
    }
    if (patch.newCardsPerDay !== undefined) {
      if (!ALLOWED_NEW_CARDS_PER_DAY.includes(patch.newCardsPerDay)) {
        invalid(
          `newCardsPerDay must be one of: ${ALLOWED_NEW_CARDS_PER_DAY.join(", ")}`,
        );
        return;
      }
    }
    if (patch.reviewFormat !== undefined) {
      if (!ALLOWED_REVIEW_FORMAT.includes(patch.reviewFormat)) {
        invalid(
          `reviewFormat must be one of: ${ALLOWED_REVIEW_FORMAT.join(", ")}`,
        );
        return;
      }
    }

    // definition_display and review_format are plain strings; new_cards_per_day
    // is a JSON number string (the SRS code parses it with JSON — match that).
    if (patch.definitionDisplay !== undefined) {
      upsertSetting(db, DEFINITION_DISPLAY_SETTING, patch.definitionDisplay);
    }
    if (patch.newCardsPerDay !== undefined) {
      upsertSetting(
        db,
        NEW_CARDS_PER_DAY_SETTING,
        JSON.stringify(patch.newCardsPerDay),
      );
    }
    if (patch.reviewFormat !== undefined) {
      upsertSetting(db, REVIEW_FORMAT_SETTING, patch.reviewFormat);
    }

    const body: PutSettingsResponse = { settings: getSettings(db) };
    res.json(body);
  });
}
