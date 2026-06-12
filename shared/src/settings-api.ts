// Settings API payload types — shared by the settings routes (server) and the
// System screen's Preferences section (web). JSON is camelCase. Settings are
// the owner's few preferences, backed by the `setting` table.

/** Which definition line(s) to reveal in Review/Quiz. */
export type DefinitionDisplay = "es" | "en" | "both";

/** New cards introduced per day (the SRS promotion cap). */
export type NewCardsPerDay = 10 | 20 | 40;

/** Review render mode: multiple-choice (default) or binary yes/no self-grade. */
export type ReviewFormat = "mc" | "yesno";

/** The owner's preferences, always fully defaulted. */
export interface AppSettings {
  definitionDisplay: DefinitionDisplay;
  newCardsPerDay: NewCardsPerDay;
  reviewFormat: ReviewFormat;
}

/** GET /api/settings — the full, defaulted preferences object. */
export interface GetSettingsResponse {
  settings: AppSettings;
}

/** PUT /api/settings — a partial update; each provided field is validated. */
export type PutSettingsRequest = Partial<AppSettings>;

/** PUT /api/settings — the full current preferences after the update. */
export interface PutSettingsResponse {
  settings: AppSettings;
}
