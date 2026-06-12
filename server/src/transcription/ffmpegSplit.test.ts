/**
 * Live-ffmpeg integration test for the real audio splitter. ffmpeg/ffprobe are
 * on PATH in this container; the test synthesizes short clips with ffmpeg,
 * splits them, and asserts the chunk invariants the Whisper limit depends on.
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFfmpegSplitAudio } from "./ffmpegSplit.js";
import { TranscriptionError, type AudioInput } from "./types.js";

const execFileAsync = promisify(execFile);

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "estudio-ffsplit-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** Synthesize a `durationSeconds` sine clip in `codec`, return its bytes. */
async function makeClip(
  codec: "mp3" | "m4a",
  durationSeconds: number,
): Promise<Buffer> {
  const out = path.join(tmpDir, `t.${codec}`);
  const codecArgs =
    codec === "mp3"
      ? ["-c:a", "libmp3lame", "-b:a", "128k"]
      : ["-c:a", "aac", "-b:a", "128k"];
  await execFileAsync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=440:duration=${durationSeconds}`,
    ...codecArgs,
    out,
  ]);
  const data = fs.readFileSync(out);
  fs.rmSync(out, { force: true });
  return data;
}

describe("createFfmpegSplitAudio", () => {
  const split = createFfmpegSplitAudio();

  it("returns the input as a single chunk when under the limit", async () => {
    const data = await makeClip("mp3", 5);
    const input: AudioInput = { data, filename: "lesson.mp3", minutes: 5 / 60 };
    const chunks = await split(input, 100 * 1024 * 1024);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].data.equals(data)).toBe(true);
    expect(chunks[0].filename).toBe("lesson.mp3");
    expect(chunks[0].minutes).toBeCloseTo(input.minutes, 5);
  });

  for (const codec of ["mp3", "m4a"] as const) {
    it(`splits an oversized ${codec} recording into ordered sub-limit chunks`, async () => {
      const durationSeconds = 30;
      const data = await makeClip(codec, durationSeconds);
      const totalMinutes = durationSeconds / 60;
      const maxBytes = 32 * 1024;
      const input: AudioInput = {
        data,
        filename: `lesson.${codec}`,
        minutes: totalMinutes,
      };

      // Sanity: the clip must actually be oversized for this test to mean anything.
      expect(data.length).toBeGreaterThan(maxBytes);

      const chunks = await split(input, maxBytes);

      expect(chunks.length).toBeGreaterThanOrEqual(2);
      for (const chunk of chunks) {
        expect(chunk.data.length).toBeLessThanOrEqual(maxBytes);
        expect(chunk.filename.endsWith(`.${codec}`)).toBe(true);
      }

      const summedMinutes = chunks.reduce((sum, c) => sum + c.minutes, 0);
      expect(summedMinutes).toBeGreaterThan(totalMinutes * 0.95);
      expect(summedMinutes).toBeLessThan(totalMinutes * 1.05);

      // Chronological order: chunk filenames carry zero-padded part indices.
      const sorted = [...chunks].sort((a, b) =>
        a.filename.localeCompare(b.filename),
      );
      expect(chunks.map((c) => c.filename)).toEqual(
        sorted.map((c) => c.filename),
      );
    });
  }

  it("throws a non-retryable TranscriptionError when a segment can't fit", async () => {
    // 1-byte limit forces segmentSeconds=1, and even a 1s segment exceeds it.
    const data = await makeClip("mp3", 10);
    const input: AudioInput = { data, filename: "lesson.mp3", minutes: 10 / 60 };

    await expect(split(input, 1)).rejects.toBeInstanceOf(TranscriptionError);
  });
});
