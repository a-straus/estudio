import type { Express } from "express";
import type { DB } from "../db/db.js";

// Triage routes (extraction-item listing, know/learn/skip, batch confirm).
// Stub registered by the orchestrator so parallel route work never
// conflicts in app.ts; the triage-ui task fills it in.
export function registerTriageRoutes(_app: Express, _db: DB): void {}
