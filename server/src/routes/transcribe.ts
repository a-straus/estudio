import multer from "multer";
import type { Express, Request, Response } from "express";
import type { DB } from "../db/db.js";
import type { TranscriptionService } from "../transcription/service.js";
import {
  readAudioDurationMinutes,
  type ReadAudioDurationMinutes,
} from "../transcription/duration.js";

const AUDIO_EXTENSIONS = new Set([
  "m4a", "mp3", "mp4", "ogg", "oga", "webm", "aac", "flac", "opus", "wav",
]);

function extOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i >= 0 ? filename.slice(i + 1).toLowerCase() : "";
}

export function registerTranscribeRoutes(
  app: Express,
  _db: DB,
  transcription?: TranscriptionService,
  opts: { readAudioDuration?: ReadAudioDurationMinutes } = {},
): void {
  const readAudioDuration = opts.readAudioDuration ?? readAudioDurationMinutes;
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
  });

  app.post(
    "/api/transcribe",
    upload.single("file"),
    async (req: Request, res: Response): Promise<void> => {
      if (!req.file) {
        res.status(400).json({
          error: { message: 'multipart field "file" is required', code: "missing_file" },
        });
        return;
      }

      const filename = req.file.originalname || "voice.webm";
      if (!AUDIO_EXTENSIONS.has(extOf(filename))) {
        res.status(400).json({
          error: { message: "unsupported audio format", code: "invalid_audio" },
        });
        return;
      }

      let minutes: number;
      try {
        minutes = await readAudioDuration(req.file.buffer, filename);
      } catch {
        res.status(400).json({
          error: { message: "not a readable audio file", code: "invalid_audio" },
        });
        return;
      }

      if (!transcription) {
        res.status(503).json({
          error: {
            message: "Voice transcription is unavailable.",
            code: "transcription_unavailable",
          },
        });
        return;
      }

      let result: { text: string };
      try {
        result = await transcription.transcribe("quick_add", {
          data: req.file.buffer,
          filename,
          minutes,
        });
      } catch {
        res.status(502).json({
          error: {
            message: "Couldn't transcribe that. Try again.",
            code: "transcription_failed",
          },
        });
        return;
      }

      const text = result.text.trim();
      if (text === "") {
        res.status(422).json({
          error: { message: "No speech detected. Try again.", code: "empty_transcript" },
        });
        return;
      }

      res.json({ text });
    },
  );
}
