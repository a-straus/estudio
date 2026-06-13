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
      // Segment duration is derived from the AVERAGE bitrate, so a localized
      // bitrate spike sustained across one segment can still overshoot maxBytes.
      // When that happens we re-run the segment pass with a smaller target
      // computed from the worst overshoot, rather than failing the whole lesson
      // (Whisper may already have transcribed earlier chunks in this call).
      // Bounded to maxAttempts; only a genuinely unsplittable input (a single
      // frame larger than maxBytes) exhausts the loop and throws.
      const maxAttempts = 3;
      const base = input.filename.replace(/\.[^.]*$/, "");
      let segmentSeconds = Math.max(1, Math.floor(targetBytes / bytesPerSec));
      let lastSegmentSeconds = segmentSeconds;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        lastSegmentSeconds = segmentSeconds;
        // Fresh per-attempt output dir so a smaller-target re-run never reads or
        // collides with the previous attempt's segments; removed before the next
        // attempt, and the surviving dir is cleaned by the outer finally.
        const outDir = path.join(tmpDir, `attempt${attempt}`);
        fs.mkdirSync(outDir);

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
          path.join(outDir, `chunk%03d.${ext}`),
        ]);

        const chunkFiles = fs
          .readdirSync(outDir)
          .filter((f) => f.startsWith("chunk") && f.endsWith(`.${ext}`))
          .sort();

        if (chunkFiles.length === 0) {
          throw new TranscriptionError(
            "ffmpeg produced no audio segments",
            { retryable: false },
          );
        }

        let largestChunkBytes = 0;
        for (const f of chunkFiles) {
          const size = fs.statSync(path.join(outDir, f)).size;
          if (size > largestChunkBytes) largestChunkBytes = size;
        }

        if (largestChunkBytes <= maxBytes) {
          const chunks = [];
          for (let i = 0; i < chunkFiles.length; i++) {
            const file = path.join(outDir, chunkFiles[i]);
            const data = fs.readFileSync(file);
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
        }

        // Overshoot: shrink the target from the worst observed chunk and retry.
        segmentSeconds = Math.max(
          1,
          Math.floor(segmentSeconds * (maxBytes / largestChunkBytes) * 0.92),
        );
        fs.rmSync(outDir, { recursive: true, force: true });
      }

      throw new TranscriptionError(
        `a ${lastSegmentSeconds}s segment still exceeds the ${maxBytes}-byte limit`,
        { retryable: false },
      );
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
