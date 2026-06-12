/**
 * Real ffmpeg-based audio splitter for the TranscriptionService seam.
 *
 * OpenAI Whisper caps each request at ~24 MB, and a normal ~1 hr tutor lesson
 * exceeds that at any usual bitrate. Compressed containers (m4a/mp3/ogg/…)
 * can't be split by naive byte ranges without corrupting frames, so we lean on
 * ffmpeg's frame-aware segment muxer with stream copy (`-c copy`): lossless,
 * fast, no re-encode. Files already under the limit pass straight through as a
 * single chunk (identical to defaultSplitAudio's small-file case).
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { TranscriptionError, type SplitAudio } from "./types.js";

const execFileAsync = promisify(execFile);

function extOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  const ext = i >= 0 ? filename.slice(i + 1).toLowerCase() : "";
  return ext || "m4a";
}

/** Run ffprobe to read a media file's duration in seconds, or null if unknown. */
async function probeDurationSeconds(file: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=nw=1:nk=1",
      file,
    ]);
    const seconds = Number.parseFloat(stdout.trim());
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  } catch {
    return null;
  }
}

/**
 * Build the real splitter. Async: oversized recordings are demuxed with ffmpeg;
 * under-limit recordings are returned as one pass-through chunk.
 */
export function createFfmpegSplitAudio(): SplitAudio {
  return async (input, maxBytes) => {
    if (input.data.length <= maxBytes) {
      return [
        {
          data: input.data,
          filename: input.filename,
          minutes: input.minutes,
        },
      ];
    }

    const ext = extOf(input.filename);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "estudio-ffsplit-"));
    const inPath = path.join(tmpDir, `in.${ext}`);

    try {
      fs.writeFileSync(inPath, input.data);

      const probed = await probeDurationSeconds(inPath);
      const totalSeconds = probed ?? input.minutes * 60;
      if (!(totalSeconds > 0)) {
        throw new TranscriptionError(
          "could not determine audio duration for splitting",
          { retryable: false },
        );
      }

      const bytesPerSec = input.data.length / totalSeconds;
      const targetBytes = Math.floor(maxBytes * 0.92);
      const segmentSeconds = Math.max(
        1,
        Math.floor(targetBytes / bytesPerSec),
      );

      await execFileAsync("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        inPath,
        "-f",
        "segment",
        "-segment_time",
        String(segmentSeconds),
        "-c",
        "copy",
        "-reset_timestamps",
        "1",
        path.join(tmpDir, `chunk%03d.${ext}`),
      ]);

      const chunkFiles = fs
        .readdirSync(tmpDir)
        .filter((f) => f.startsWith("chunk") && f.endsWith(`.${ext}`))
        .sort();

      if (chunkFiles.length === 0) {
        throw new TranscriptionError(
          "ffmpeg produced no audio segments",
          { retryable: false },
        );
      }

      const base = input.filename.replace(/\.[^.]*$/, "");
      const chunks = [];
      for (let i = 0; i < chunkFiles.length; i++) {
        const file = path.join(tmpDir, chunkFiles[i]);
        const data = fs.readFileSync(file);
        if (data.length > maxBytes) {
          throw new TranscriptionError(
            `a ${segmentSeconds}s segment still exceeds the ${maxBytes}-byte limit`,
            { retryable: false },
          );
        }
        const chunkSeconds = await probeDurationSeconds(file);
        const minutes =
          chunkSeconds !== null
            ? chunkSeconds / 60
            : input.minutes / chunkFiles.length;
        chunks.push({
          data,
          filename: `${base}.part${String(i + 1).padStart(3, "0")}.${ext}`,
          minutes,
        });
      }

      return chunks;
    } catch (err) {
      if (err instanceof TranscriptionError) throw err;
      throw new TranscriptionError(
        `ffmpeg audio splitting failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
        { retryable: false, cause: err },
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  };
}
