import type { Express } from "express";
import type { DB } from "../db/db.js";

// SRS routes (due queue, grade submission). Stub registered by the
// orchestrator so parallel route work never conflicts in app.ts; the
// srs-api-wiring task fills it in.
export function registerSrsRoutes(_app: Express, _db: DB): void {}
