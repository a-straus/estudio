import type { Express } from "express";
import type { DB } from "../db/db.js";

/**
 * Lesson-recording READ routes — STUB. app.ts already calls
 * `registerLessonReadRoutes(app, db)`; keep this exact name/arity/types.
 * The `lesson-recording-ui` task OWNS and replaces this file: read-only
 * browse endpoints over the already-ingested data — a list of lesson_audio
 * recordings (newest first, with summary counts) and a per-recording detail
 * returning the `LessonRecordingView` (source + insights grouped by type,
 * already defined in shared/src/lesson-audio-api.ts). Pure DB reads, no LLM,
 * no job. Do NOT edit app.ts.
 */
export function registerLessonReadRoutes(_app: Express, _db: DB): void {
  // intentionally empty until lesson-recording-ui fills it in
}
