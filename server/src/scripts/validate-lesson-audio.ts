/**
 * Live, end-to-end validation of the lesson-audio ingestion pipeline against the
 * real owner lesson recording in /docs/fixtures/lesson-audio/ — using the REAL
 * ffmpeg splitter + OpenAI Whisper + Anthropic lesson_analysis, not test mocks.
 *
 * This is the Phase-2 *done* gate: the fixture is > 24 MB, so it exercises the
 * frame-aware ffmpeg split -> transcribe -> stitch path end to end. It also
 * surfaces the first REAL transcript, which is read to seed the lesson_analysis
 * prompt with the owner's literal self-flag phrases (review-04 S3).
 *
 *   cp /workspace/.env .env   # ANTHROPIC_API_KEY + OPENAI_API_KEY, git-ignored
 *   npx tsx server/src/scripts/validate-lesson-audio.ts
 *
 * Boots a throwaway SQLite db in a temp dir, registers the fixture as a
 * `lesson_audio` source exactly as the upload route does, runs
 * runLessonAudioIngestion directly, then prints the transcript, the mined
 * insights, the triage candidates, and the summed live cost. NOT part of
 * check.sh (needs real ffmpeg + live API keys + the gitignored fixture).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { openDb } from "../db/db.js";
import { runMigrations } from "../db/migrate.js";
import { insertSource } from "../db/queries.js";
import { createAnthropicProvider } from "../llm/anthropic.js";
import { LlmService } from "../llm/service.js";
import { TranscriptionService } from "../transcription/service.js";
import { createOpenAiProvider } from "../transcription/openai.js";
import { createFfmpegSplitAudio } from "../transcription/ffmpegSplit.js";
import { runLessonAudioIngestion } from "../jobs/lessonAudioIngestion.js";

dotenv.config();

const AUDIO = /\.(m4a|mp3|mp4|ogg|oga|webm|aac|flac|opus|wav)$/i;
const fixturesDir = fileURLToPath(
  new URL("../../../docs/fixtures/lesson-audio/", import.meta.url),
);

const rule = (label = ""): void => {
  console.log("=".repeat(72) + (label ? `\n${label}\n` + "=".repeat(72) : ""));
};

async function main(): Promise<void> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!anthropicKey || !openaiKey) {
    console.error(
      "ANTHROPIC_API_KEY and OPENAI_API_KEY required. Run `cp /workspace/.env .env` first.",
    );
    process.exit(1);
  }

  if (!fs.existsSync(fixturesDir)) {
    console.error(`fixtures dir missing: ${fixturesDir}`);
    process.exit(1);
  }
  const fixture = fs.readdirSync(fixturesDir).find((f) => AUDIO.test(f));
  if (!fixture) {
    console.error(`no audio fixture in ${fixturesDir}`);
    process.exit(1);
  }
  const filePath = path.join(fixturesDir, fixture);
  const mb = fs.statSync(filePath).size / 1024 / 1024;

  const dataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "estudio-validate-audio-"),
  );
  const db = openDb(dataDir);
  runMigrations(db, dataDir);
  const llm = new LlmService(db, {
    anthropic: createAnthropicProvider(anthropicKey),
  });
  const transcription = new TranscriptionService(
    db,
    { openai: createOpenAiProvider(openaiKey) },
    { splitAudio: createFfmpegSplitAudio() },
  );

  const sourceId = insertSource(db, {
    type: "lesson_audio",
    title: path.basename(fixture, path.extname(fixture)),
    ref: fixture,
    storedPath: filePath,
  });

  rule(`SOURCE ${sourceId}: ${fixture}  (${mb.toFixed(1)} MB, >24 MB → split path)`);
  const started = Date.now();
  try {
    const result = await runLessonAudioIngestion(db, llm, transcription, {
      sourceId,
    });
    console.log(
      `job result: ${JSON.stringify(result)}  (${((Date.now() - started) / 1000).toFixed(0)}s wall)`,
    );
  } catch (err) {
    console.error("INGESTION THREW:", err instanceof Error ? err.message : err);
  }

  const src = db
    .prepare("SELECT transcript FROM source WHERE id = ?")
    .get(sourceId) as { transcript: string | null } | undefined;
  const transcript = src?.transcript ?? null;
  rule(
    `TRANSCRIPT  (${transcript === null ? "NULL — not transcribed" : `${transcript.length} chars`})`,
  );
  if (transcript) console.log(transcript);

  const insights = db
    .prepare(
      "SELECT type, payload FROM lesson_insight WHERE source_id = ? ORDER BY id",
    )
    .all(sourceId) as { type: string; payload: string }[];
  rule(`${insights.length} lesson_insight row(s)`);
  for (const it of insights) console.log(`  [${it.type}] ${it.payload}`);

  const items = db
    .prepare(
      "SELECT term, lemma, level FROM extraction_item WHERE source_id = ? ORDER BY id",
    )
    .all(sourceId) as { term: string; lemma: string | null; level: string | null }[];
  console.log(`\n  ${items.length} extraction_item (flagged-word) candidate(s):`);
  for (const it of items) {
    console.log(`    • ${it.term}  [lemma=${it.lemma} · ${it.level}]`);
  }

  const tcost = db
    .prepare(
      `SELECT task, status, COUNT(*) AS calls,
              COALESCE(SUM(minutes),0) AS mins,
              COALESCE(SUM(cost_estimate_usd),0) AS cost
         FROM transcription_call GROUP BY task, status ORDER BY task`,
    )
    .all() as {
    task: string;
    status: string;
    calls: number;
    mins: number;
    cost: number;
  }[];
  const lcost = db
    .prepare(
      `SELECT task, status, COUNT(*) AS calls,
              COALESCE(SUM(cost_estimate_usd),0) AS cost
         FROM llm_call GROUP BY task, status ORDER BY task`,
    )
    .all() as { task: string; status: string; calls: number; cost: number }[];
  const total = db
    .prepare(
      `SELECT (SELECT COALESCE(SUM(cost_estimate_usd),0) FROM transcription_call)
            + (SELECT COALESCE(SUM(cost_estimate_usd),0) FROM llm_call) AS c`,
    )
    .get() as { c: number };
  rule("COST");
  for (const r of tcost) {
    console.log(
      `  transcription ${r.task} [${r.status}]: ${r.calls} call(s), ${r.mins.toFixed(1)} min, $${r.cost.toFixed(4)}`,
    );
  }
  for (const r of lcost) {
    console.log(
      `  llm ${r.task} [${r.status}]: ${r.calls} call(s), $${r.cost.toFixed(4)}`,
    );
  }
  console.log(`  TOTAL live cost: $${total.c.toFixed(4)}`);

  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
