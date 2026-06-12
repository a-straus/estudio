// SQL for the owner's preferences in the `setting` table (key/value rows).
// snake_case keys → a typed, defaulted AppSettings here, at the query layer.
// Schema is read/write-only: no new tables or columns.

import type {
  AppSettings,
  DefinitionDisplay,
  NewCardsPerDay,
} from "@estudio/shared";
import { nowIso, type DB } from "./db.js";
// Reuse the SRS engine's key so reads/writes stay in sync (do not redefine it).
import { NEW_CARDS_PER_DAY_SETTING } from "./srs-queries.js";

/** Plain-string preference: which definition line(s) to reveal. */
export const DEFINITION_DISPLAY_SETTING = "definition_display";

export const ALLOWED_DEFINITION_DISPLAY: readonly DefinitionDisplay[] = [
  "es",
  "en",
  "both",
];
export const ALLOWED_NEW_CARDS_PER_DAY: readonly NewCardsPerDay[] = [
  10, 20, 40,
];

const DEFAULT_DEFINITION_DISPLAY: DefinitionDisplay = "both";
const DEFAULT_NEW_CARDS_PER_DAY: NewCardsPerDay = 20;

function readRaw(db: DB, key: string): string | undefined {
  const row = db.prepare("SELECT value FROM setting WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

/**
 * The owner's preferences, always fully defaulted. `new_cards_per_day` is a
 * JSON number string (matching getNewCardsPerDay in srs-queries); an unset or
 * out-of-range value falls back to its default rather than surfacing.
 */
export function getSettings(db: DB): AppSettings {
  const displayRaw = readRaw(db, DEFINITION_DISPLAY_SETTING);
  const definitionDisplay = ALLOWED_DEFINITION_DISPLAY.includes(
    displayRaw as DefinitionDisplay,
  )
    ? (displayRaw as DefinitionDisplay)
    : DEFAULT_DEFINITION_DISPLAY;

  let newCardsPerDay: NewCardsPerDay = DEFAULT_NEW_CARDS_PER_DAY;
  const cardsRaw = readRaw(db, NEW_CARDS_PER_DAY_SETTING);
  if (cardsRaw !== undefined) {
    try {
      const parsed = JSON.parse(cardsRaw);
      if (ALLOWED_NEW_CARDS_PER_DAY.includes(parsed as NewCardsPerDay)) {
        newCardsPerDay = parsed as NewCardsPerDay;
      }
    } catch {
      // malformed value → keep the default
    }
  }

  return { definitionDisplay, newCardsPerDay };
}

/** Upsert one preference row, stamping updated_at. */
export function upsertSetting(db: DB, key: string, value: string): void {
  db.prepare(
    `INSERT INTO setting (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, value, nowIso());
}
