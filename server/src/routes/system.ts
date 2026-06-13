import path from "node:path";
import type { Express, Request, Response } from "express";
import type {
  SystemBackupResponse,
  SystemErrorsResponse,
  SystemJobsResponse,
  SystemSpendResponse,
  SystemStatusResponse,
} from "@estudio/shared";
import type { DB } from "../db/db.js";
import {
  getDbStatus,
  getSpend,
  listRecentErrors,
  listRecentJobs,
} from "../db/system-queries.js";
import { backupStatus, backupsDir, runBackup } from "../jobs/backup.js";
import { logger } from "../logger.js";

/**
 * System page routes — the machine's honest ledger. All reads are cheap; the
 * manual backup uses the exact same code path as the scheduled job.
 */
export function registerSystemRoutes(
  app: Express,
  db: DB,
  dataDir: string,
): void {
  app.get("/api/system/errors", (_req: Request, res: Response) => {
    const body: SystemErrorsResponse = { errors: listRecentErrors(db) };
    res.json(body);
  });

  app.get("/api/system/jobs", (_req: Request, res: Response) => {
    const body: SystemJobsResponse = { jobs: listRecentJobs(db) };
    res.json(body);
  });

  app.get("/api/system/spend", (_req: Request, res: Response) => {
    const body: SystemSpendResponse = getSpend(db);
    res.json(body);
  });

  app.get("/api/system/status", (_req: Request, res: Response) => {
    const body: SystemStatusResponse = {
      db: getDbStatus(db),
      backup: backupStatus(dataDir),
    };
    res.json(body);
  });

  app.get("/api/system/export", (_req: Request, res: Response) => {
    const tableRows = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as { name: string }[];

    const tables: Record<string, unknown[]> = {};
    for (const { name } of tableRows) {
      tables[name] = db.prepare(`SELECT * FROM "${name}"`).all() as unknown[];
    }

    const exportedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    const date = exportedAt.slice(0, 10);
    const dump = { version: 1, exportedAt, tables };

    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="estudio-export-${date}.json"`,
    );
    res.send(JSON.stringify(dump, null, 2));
  });

  app.get("/api/system/backup/download", (_req: Request, res: Response) => {
    const status = backupStatus(dataDir);
    if (!status.latestFilename) {
      res.status(404).json({
        error: {
          message: "No backup found. Create a backup first.",
          code: "no_backup",
        },
      });
      return;
    }
    const absolutePath = path.join(backupsDir(dataDir), status.latestFilename);
    res.download(absolutePath, status.latestFilename);
  });

  app.post("/api/system/backup", (_req: Request, res: Response) => {
    runBackup(db, dataDir)
      .then((result) => {
        const body: SystemBackupResponse = { filename: result.filename };
        res.status(201).json(body);
      })
      .catch((err: unknown) => {
        logger.error("request", "manual backup failed", { err });
        res.status(500).json({
          error: {
            message: "Backup failed. The database may be locked — try again.",
            code: "backup_failed",
          },
        });
      });
  });
}
