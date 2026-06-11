import path from "node:path";
import { fileURLToPath } from "node:url";
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import type { HealthResponse } from "@estudio/shared";
import { listJobs } from "./db/queries.js";
import type { DB } from "./db/db.js";
import { logger } from "./logger.js";

// web/dist sits two levels up from both server/src/ and server/dist/.
const webDistDir = fileURLToPath(new URL("../../web/dist/", import.meta.url));

export function createApp(db: DB, opts: { serveWeb?: boolean } = {}): Express {
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

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    logger.error("request failed", {
      method: req.method,
      path: req.originalUrl,
      err,
    });
    res.status(500).json({
      error: { message: "Internal server error", code: "internal_error" },
    });
  });

  return app;
}
