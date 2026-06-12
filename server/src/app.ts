import path from "node:path";
import { fileURLToPath } from "node:url";
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { MulterError } from "multer";
import type { HealthResponse } from "@estudio/shared";
import { listJobs } from "./db/queries.js";
import type { DB } from "./db/db.js";
import type { JobQueue } from "./jobs/queue.js";
import type { LlmService } from "./llm/service.js";
import type { TranscriptionService } from "./transcription/service.js";
import { logger } from "./logger.js";
import { registerGrammarRoutes } from "./routes/grammar.js";
import { registerOverviewRoutes } from "./routes/overview.js";
import { registerQuizRoutes } from "./routes/quiz.js";
import { registerSettingsRoutes } from "./routes/settings.js";
import { registerSourceRoutes } from "./routes/sources.js";
import { registerSrsRoutes } from "./routes/srs.js";
import { registerSystemRoutes } from "./routes/system.js";
import { registerTriageRoutes } from "./routes/triage.js";
import { registerWordRoutes } from "./routes/words.js";
import { registerChatRoutes } from "./routes/chat.js";
import { registerSuggestionRoutes } from "./routes/suggestions.js";
import { registerLessonReadRoutes } from "./routes/lessons.js";
import { registerNotesRoutes } from "./routes/notes.js";

// web/dist sits two levels up from both server/src/ and server/dist/.
const webDistDir = fileURLToPath(new URL("../../web/dist/", import.meta.url));

export function createApp(
  db: DB,
  opts: {
    serveWeb?: boolean;
    queue?: JobQueue;
    dataDir?: string;
    llm?: LlmService;
    transcription?: TranscriptionService;
  } = {},
): Express {
  const app = express();
  app.use(express.json());

  app.use((req: Request, res: Response, next: NextFunction) => {
    const startedAt = Date.now();
    res.on("finish", () => {
      logger.info("request", {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
      });
    });
    next();
  });

  app.get("/api/health", (_req: Request, res: Response) => {
    db.prepare("SELECT 1").get();
    const body: HealthResponse = { status: "ok" };
    res.json(body);
  });

  app.get("/api/jobs", (_req: Request, res: Response) => {
    res.json(listJobs(db));
  });

  // Source routes need the queue (to enqueue ingestion) and DATA_DIR (uploads).
  if (opts.queue && opts.dataDir) {
    registerSourceRoutes(app, db, opts.queue, opts.dataDir);
  }
  registerSrsRoutes(app, db);
  registerOverviewRoutes(app, db);
  registerSettingsRoutes(app, db);
  registerTriageRoutes(app, db);
  registerWordRoutes(app, db);
  registerGrammarRoutes(app, db, opts.queue, opts.llm);
  registerQuizRoutes(app, db, opts.queue);
  // Phase-2 stub routes — pre-partitioned (empty until ask-chatbot /
  // suggestions / lesson-recording-ui fill them in). Each owns only its own
  // routes file; this registration block is the orchestrator's.
  registerChatRoutes(app, db, opts.llm, opts.transcription);
  registerSuggestionRoutes(app, db, opts.llm);
  registerLessonReadRoutes(app, db);
  registerNotesRoutes(app, db);
  if (opts.dataDir) {
    registerSystemRoutes(app, db, opts.dataDir);
  }

  app.use("/api", (_req: Request, res: Response) => {
    res
      .status(404)
      .json({ error: { message: "Not found", code: "not_found" } });
  });

  if (opts.serveWeb) {
    app.use(express.static(webDistDir));
    app.get(/.*/, (_req: Request, res: Response) => {
      res.sendFile(path.join(webDistDir, "index.html"));
    });
  }

  app.use(errorHandler);

  return app;
}

/** Final error handler: known client errors get their own status, the rest 500. */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof MulterError && err.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({
      error: {
        message: "the uploaded file is too large",
        code: "file_too_large",
      },
    });
    return;
  }
  logger.error("request", "request failed", {
    method: req.method,
    path: req.originalUrl,
    err,
  });
  res.status(500).json({
    error: { message: "Internal server error", code: "internal_error" },
  });
}
