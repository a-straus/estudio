import type { Express, Request, Response } from "express";
import type { LessonListItem, LessonRecordingView } from "@estudio/shared";
import type { DB } from "../db/db.js";
import { getLessonDetail, listLessons } from "../db/lesson-queries.js";

/** Lesson-recording READ routes. Registered by app.ts as `registerLessonReadRoutes(app, db)`. */
export function registerLessonReadRoutes(app: Express, db: DB): void {
  app.get("/api/lessons", (_req: Request, res: Response) => {
    const body: LessonListItem[] = listLessons(db);
    res.json(body);
  });

  app.get("/api/lessons/:sourceId", (req: Request, res: Response) => {
    const id = Number(req.params.sourceId);
    if (!Number.isInteger(id) || id <= 0) {
      res
        .status(400)
        .json({ error: { message: "invalid sourceId", code: "invalid_id" } });
      return;
    }
    const body: LessonRecordingView | null = getLessonDetail(db, id);
    if (!body) {
      res
        .status(404)
        .json({
          error: { message: "lesson not found", code: "not_found" },
        });
      return;
    }
    res.json(body);
  });
}
