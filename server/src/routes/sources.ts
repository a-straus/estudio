import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import type { Express, Request, Response } from "express";
import type {
  PdfUploadResponse,
  RetryPageResponse,
  SourceDetailResponse,
} from "@estudio/shared";
import { nowIso, type DB } from "../db/db.js";
import {
  getSource,
  getSourcePage,
  insertSource,
  insertSourcePages,
  listSourcePages,
} from "../db/queries.js";
import { enqueuePdfIngestion } from "../jobs/pdfIngestion.js";
import type { JobQueue } from "../jobs/queue.js";
import { getPageCount } from "../pdf/pages.js";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export function registerSourceRoutes(
  app: Express,
  db: DB,
  queue: JobQueue,
  dataDir: string,
): void {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES },
  });

  app.post(
    "/api/sources/pdf",
    upload.single("file"),
    async (req: Request, res: Response) => {
      if (!req.file) {
        res.status(400).json({
          error: {
            message: 'multipart field "file" is required',
            code: "missing_file",
          },
        });
        return;
      }

      let pageCount: number;
      try {
        pageCount = await getPageCount(req.file.buffer);
      } catch {
        res.status(400).json({
          error: { message: "not a readable PDF", code: "invalid_pdf" },
        });
        return;
      }
      if (pageCount === 0) {
        res.status(400).json({
          error: { message: "PDF has no pages", code: "empty_pdf" },
        });
        return;
      }

      const originalName = req.file.originalname || "upload.pdf";
      const safeName = path.basename(originalName).replace(/[^\w.\- ]+/g, "_");
      const uploadsDir = path.join(dataDir, "uploads");
      fs.mkdirSync(uploadsDir, { recursive: true });
      const storedPath = path.join(
        uploadsDir,
        `${nowIso().replace(/[:.]/g, "-")}-${safeName}`,
      );
      fs.writeFileSync(storedPath, req.file.buffer);

      const title =
        (typeof req.body?.title === "string" && req.body.title.trim()) ||
        safeName.replace(/\.pdf$/i, "");

      // File, source, and page rows are all persisted before the job exists.
      const sourceId = insertSource(db, {
        type: "pdf",
        title,
        ref: originalName,
        storedPath,
      });
      insertSourcePages(db, sourceId, pageCount);
      const jobId = enqueuePdfIngestion(db, queue, { sourceId });

      const body: PdfUploadResponse = {
        source: getSource(db, sourceId)!,
        jobId,
        pageCount,
      };
      res.status(201).json(body);
    },
  );

  app.get("/api/sources/:id", (req: Request, res: Response) => {
    const source = getSource(db, Number(req.params.id));
    if (!source) {
      res.status(404).json({
        error: { message: "Source not found", code: "not_found" },
      });
      return;
    }
    const pages = listSourcePages(db, source.id);
    const body: SourceDetailResponse = {
      source,
      pages,
      progress: {
        total: pages.length,
        pending: pages.filter((p) => p.status === "pending").length,
        done: pages.filter((p) => p.status === "done").length,
        failed: pages.filter((p) => p.status === "failed").length,
      },
    };
    res.json(body);
  });

  app.post("/api/source-pages/:id/retry", (req: Request, res: Response) => {
    const page = getSourcePage(db, Number(req.params.id));
    if (!page) {
      res.status(404).json({
        error: { message: "Source page not found", code: "not_found" },
      });
      return;
    }
    if (page.status !== "failed") {
      res.status(409).json({
        error: {
          message: `page is ${page.status}, only failed pages can be retried`,
          code: "page_not_failed",
        },
      });
      return;
    }
    db.prepare(
      "UPDATE source_page SET status = 'pending', error = NULL, updated_at = ? WHERE id = ?",
    ).run(nowIso(), page.id);
    const jobId = enqueuePdfIngestion(db, queue, {
      sourceId: page.sourceId,
      pageIds: [page.id],
    });
    const body: RetryPageResponse = { jobId };
    res.json(body);
  });
}
