import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import type { Express, Request, Response } from "express";
import type {
  AudioUploadResponse,
  PdfUploadResponse,
  RetryPageResponse,
  SourceDetailResponse,
  TextIngestResponse,
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
import { enqueueLessonAudioIngestion } from "../jobs/lessonAudioIngestion.js";
import {
  chunkCount,
  detectLanguage,
  enqueueTextIngestion,
} from "../jobs/textIngestion.js";
import type { JobQueue } from "../jobs/queue.js";
import { getPageCount } from "../pdf/pages.js";
import { estimateWhisperCostUsd } from "../transcription/openai.js";
import {
  readAudioDurationMinutes,
  type ReadAudioDurationMinutes,
} from "../transcription/duration.js";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** Audio extensions accepted by POST /api/sources/audio (typical phone memos). */
const AUDIO_EXTENSIONS = new Set([
  "m4a",
  "mp3",
  "mp4",
  "ogg",
  "oga",
  "webm",
  "aac",
  "flac",
  "opus",
  "wav",
]);

function extOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i >= 0 ? filename.slice(i + 1).toLowerCase() : "";
}

export function registerSourceRoutes(
  app: Express,
  db: DB,
  queue: JobQueue,
  dataDir: string,
  // Injectable duration seam (defaults to the music-metadata impl) so the audio
  // route is unit-testable without a real audio file. createApp passes 4 args,
  // so this stays optional and app.ts is untouched.
  opts: { readAudioDuration?: ReadAudioDurationMinutes } = {},
): void {
  const readAudioDuration = opts.readAudioDuration ?? readAudioDurationMinutes;
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
        language: "es", // Spanish workbooks
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

  app.post(
    "/api/sources/audio",
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

      const originalName = req.file.originalname || "recording";
      if (!AUDIO_EXTENSIONS.has(extOf(originalName))) {
        res.status(400).json({
          error: {
            message: `unsupported audio format; accepted: ${[...AUDIO_EXTENSIONS].join(", ")}`,
            code: "invalid_audio",
          },
        });
        return;
      }

      // Read the recording's duration up front (pure-JS, no ffmpeg) for the cost
      // estimate. A file that carries no usable duration metadata isn't a
      // readable recording — reject it before persisting anything.
      let minutes: number;
      try {
        minutes = await readAudioDuration(req.file.buffer, originalName);
      } catch {
        res.status(400).json({
          error: {
            message: "not a readable audio file",
            code: "invalid_audio",
          },
        });
        return;
      }

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
        safeName.replace(/\.[^.]+$/, "");

      // File + source persisted before the job exists, so a job failure never
      // loses the uploaded recording.
      const sourceId = insertSource(db, {
        type: "lesson_audio",
        title,
        ref: originalName,
        storedPath,
        language: "es", // Spanish lessons
      });
      const jobId = enqueueLessonAudioIngestion(db, queue, { sourceId });

      const body: AudioUploadResponse = {
        source: getSource(db, sourceId)!,
        jobId,
        costEstimateUsd: estimateWhisperCostUsd(minutes),
      };
      res.status(201).json(body);
    },
  );

  app.post("/api/sources/text", (req: Request, res: Response) => {
    const text = typeof req.body?.text === "string" ? req.body.text : "";
    if (text.trim() === "") {
      res.status(400).json({
        error: { message: "text is required", code: "missing_text" },
      });
      return;
    }

    const requested = req.body?.language;
    if (requested !== undefined && requested !== "es" && requested !== "en") {
      res.status(400).json({
        error: {
          message: 'language must be "es", "en", or omitted',
          code: "invalid_language",
        },
      });
      return;
    }
    // Auto-detect when the request omits language (cheap heuristic), and carry
    // the resolved value on the job so it is stable across retries/resume.
    const language = requested ?? detectLanguage(text);

    const title =
      (typeof req.body?.title === "string" && req.body.title.trim()) ||
      "Pasted text";
    const pageCount = chunkCount(text);

    // Source + page rows are persisted before the job exists, so a job failure
    // never loses the pasted input. Text sources keep their content in
    // `transcript`; there is no stored_path file.
    const now = nowIso();
    const sourceId = Number(
      db
        .prepare(
          "INSERT INTO source (type, title, ref, transcript, language, created_at, updated_at) VALUES ('text', ?, NULL, ?, ?, ?, ?)",
        )
        .run(title, text, language, now, now).lastInsertRowid,
    );
    insertSourcePages(db, sourceId, pageCount);
    const jobId = enqueueTextIngestion(db, queue, { sourceId, language });

    const body: TextIngestResponse = { sourceId, jobId, pageCount };
    res.status(201).json(body);
  });

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
