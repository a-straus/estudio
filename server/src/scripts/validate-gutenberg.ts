/**
 * Live, end-to-end validation of the Gutenberg/KJV ingestion pipeline against a
 * REAL Project Gutenberg book + the REAL archaic-aware gutenberg_extraction LLM
 * task — the GOAL §14 Phase-3 "pipeline proof" (the KJV ingested with the
 * archaic-aware rubric and a working coverage indicator).
 *
 *   cp /workspace/.env .env && npx tsx server/src/scripts/validate-gutenberg.ts --max-words=2000
 *
 * Boots a throwaway SQLite db in a temp dir, fetches + strips the book exactly
 * as POST /api/sources/gutenberg does, persists it as a `gutenberg` / `en`
 * source, runs runGutenbergIngestion directly with the real LlmService, drives
 * the kept words through the language-aware triage path into the English deck,
 * then prints the coverage indicator and the SUMMED real cost beside the upfront
 * estimate. `--max-words` truncates the book to a cheap bounded stage-1 slice so
 * the orchestrator can recompute the full-book cost from REAL per-candidate
 * token numbers before paying for the whole KJV.
 *
 * NOT part of check.sh (needs a live ANTHROPIC_API_KEY + gutenberg.org egress).
 * The harness WIRING is proven by validate-gutenberg.test.ts against mocks.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import dotenv from "dotenv";
import { nowIso, openDb, type DB } from "../db/db.js";
import { runMigrations } from "../db/migrate.js";
import { getSourceCoverage, insertSourcePages } from "../db/queries.js";
import { confirmBatch, setDecision } from "../db/triage-queries.js";
import { createAnthropicProvider, modelPricing } from "../llm/anthropic.js";
import { LlmService } from "../llm/service.js";
import {
  deriveGutenbergTitle,
  resolveGutenbergUrl,
  stripGutenbergBoilerplate,
} from "../jobs/gutenbergPrepass.js";
import {
  estimateGutenbergCostUsd,
  gutenbergChunkCount,
  gutenbergWordCount,
  runGutenbergIngestion,
} from "../jobs/gutenbergIngestion.js";

export interface GutenbergValidationResult {
  sourceId: number;
  /** Unique pre-pass candidate words left after stripping/truncation. */
  candidates: number;
  /** LLM classification calls (= source_page chunks). */
  batches: number;
  /** Terms the rubric kept that materialized into the English deck. */
  keptWords: string[];
  /** getSourceCoverage(): triaged / kept / untested-kept counts. */
  coverage: ReturnType<typeof getSourceCoverage>;
  /** SUMMED from the real llm_call rows the job wrote. */
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  /** Real per-candidate token rates, so the full book can be recomputed. */
  tokensPerCandidateIn: number;
  tokensPerCandidateOut: number;
}

export interface GutenbergValidationOpts {
  db: DB;
  dataDir: string;
  /** The network seam — stubbed in tests, real fetch in main(). */
  fetchGutenberg: (url: string) => Promise<string>;
  /** Real or mocked LlmService for the gutenberg_extraction task. */
  llm: LlmService;
  /** URL or bare ebook id; default '10' (KJV). */
  ref?: string;
  /** Cap the candidate words for a cheap bounded run; default no cap. */
  maxWords?: number;
}

/** First `maxWords` whitespace-delimited words of the stripped text. */
function truncateWords(text: string, maxWords: number): string {
  return text.trim().split(/\s+/).slice(0, maxWords).join(" ");
}

/**
 * Run the Gutenberg pipeline end to end against the injected seams and return a
 * structured proof. Mirrors POST /api/sources/gutenberg (fetch → strip →
 * persist) + the /confirm route (pages → runGutenbergIngestion), then drives the
 * kept words through triage so they land in the English deck and the coverage
 * indicator is populated.
 */
export async function runGutenbergValidation(
  opts: GutenbergValidationOpts,
): Promise<GutenbergValidationResult> {
  const { db, dataDir, fetchGutenberg, llm } = opts;
  const ref = opts.ref ?? "10";

  const url = resolveGutenbergUrl(ref);
  if (!url) throw new Error(`couldn't resolve a Gutenberg book from "${ref}"`);

  const raw = await fetchGutenberg(url);
  let text = stripGutenbergBoilerplate(raw);
  if (text.trim() === "") throw new Error("fetched book had no readable text");
  if (opts.maxWords !== undefined) text = truncateWords(text, opts.maxWords);

  const title = deriveGutenbergTitle(raw, ref);

  // Persist the source exactly as POST /api/sources/gutenberg does: type
  // 'gutenberg', language 'en', the stripped/truncated text on transcript AND a
  // books/<id>.txt file. Replicated inline from existing exports — sources.ts is
  // untouched. (insertSource() can't carry a transcript, so the route's raw
  // INSERT is reused verbatim.)
  const now = nowIso();
  const sourceId = Number(
    db
      .prepare(
        "INSERT INTO source (type, title, ref, transcript, language, created_at, updated_at) VALUES ('gutenberg', ?, ?, ?, 'en', ?, ?)",
      )
      .run(title, ref, text, now, now).lastInsertRowid,
  );
  const booksDir = path.join(dataDir, "books");
  fs.mkdirSync(booksDir, { recursive: true });
  const storedPath = path.join(booksDir, `${sourceId}.txt`);
  fs.writeFileSync(storedPath, text);
  db.prepare("UPDATE source SET stored_path = ? WHERE id = ?").run(
    storedPath,
    sourceId,
  );

  const candidates = gutenbergWordCount(text);
  const batches = gutenbergChunkCount(text);

  // Mirror the /confirm route: one pending source_page per chunk, then run the
  // job handler directly with the real LlmService (matches gutenbergIngestion.test.ts).
  insertSourcePages(db, sourceId, batches);
  await runGutenbergIngestion(db, llm, { sourceId });

  // Drive the kept words through the language-aware triage path: mark every
  // classified candidate 'learn', then confirm each batch so a word row
  // materializes into the English deck (this is what populates coverage.kept).
  const items = db
    .prepare(
      "SELECT id FROM extraction_item WHERE source_id = ? AND decision = 'pending'",
    )
    .all(sourceId) as { id: number }[];
  for (const it of items) setDecision(db, it.id, "learn");
  const batchNos = db
    .prepare(
      "SELECT DISTINCT batch_no FROM extraction_item WHERE source_id = ? AND batch_no IS NOT NULL ORDER BY batch_no",
    )
    .all(sourceId) as { batch_no: number }[];
  for (const { batch_no } of batchNos) confirmBatch(db, sourceId, batch_no);

  const keptWords = (
    db
      .prepare("SELECT term FROM word WHERE source_id = ? ORDER BY id")
      .all(sourceId) as { term: string }[]
  ).map((r) => r.term);

  const coverage = getSourceCoverage(db, sourceId);

  // Sum the REAL llm_call rows the job wrote for this task.
  const cost = db
    .prepare(
      `SELECT COALESCE(SUM(tokens_in), 0) AS tokensIn,
              COALESCE(SUM(tokens_out), 0) AS tokensOut,
              COALESCE(SUM(cost_estimate_usd), 0) AS costUsd
         FROM llm_call WHERE task = 'gutenberg_extraction'`,
    )
    .get() as { tokensIn: number; tokensOut: number; costUsd: number };

  return {
    sourceId,
    candidates,
    batches,
    keptWords,
    coverage,
    costUsd: cost.costUsd,
    tokensIn: cost.tokensIn,
    tokensOut: cost.tokensOut,
    tokensPerCandidateIn: candidates ? cost.tokensIn / candidates : 0,
    tokensPerCandidateOut: candidates ? cost.tokensOut / candidates : 0,
  };
}

const rule = (label = ""): void => {
  console.log("=".repeat(72) + (label ? `\n${label}\n` + "=".repeat(72) : ""));
};

function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

async function main(): Promise<void> {
  dotenv.config();
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    console.error(
      "ANTHROPIC_API_KEY required. Run `cp /workspace/.env .env` first.",
    );
    process.exit(1);
  }

  const ref = parseArg("ref") ?? process.env.GUTENBERG_REF ?? "10";
  const maxWordsRaw =
    parseArg("max-words") ?? process.env.GUTENBERG_MAX_WORDS ?? "";
  const maxWords = maxWordsRaw ? Number(maxWordsRaw) : undefined;
  if (maxWords !== undefined && (!Number.isFinite(maxWords) || maxWords <= 0)) {
    console.error(`invalid --max-words: ${maxWordsRaw}`);
    process.exit(1);
  }

  const dataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "estudio-validate-gutenberg-"),
  );
  const db = openDb(dataDir);
  runMigrations(db, dataDir);
  const llm = new LlmService(db, {
    anthropic: createAnthropicProvider(anthropicKey),
  });
  const model = llm.resolveTaskConfig("gutenberg_extraction").model;

  // The real network fetch, polite UA + redirect follow + 30s timeout, exactly
  // as defaultFetchGutenberg in sources.ts.
  const fetchGutenberg = async (url: string): Promise<string> => {
    const res = await fetch(url, {
      headers: { "User-Agent": "estudio/1.0 (personal language-learning app)" },
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`gutenberg fetch failed: HTTP ${res.status}`);
    return res.text();
  };

  rule(
    `GUTENBERG VALIDATION  ref=${ref}  model=${model}  maxWords=${maxWords ?? "(none — full book)"}`,
  );
  const started = Date.now();
  let result: GutenbergValidationResult;
  try {
    result = await runGutenbergValidation({
      db,
      dataDir,
      fetchGutenberg,
      llm,
      ref,
      maxWords,
    });
  } catch (err) {
    console.error("VALIDATION THREW:", err instanceof Error ? err.message : err);
    db.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
    process.exit(1);
  }
  const wallS = ((Date.now() - started) / 1000).toFixed(0);

  rule(`RESULT  (source ${result.sourceId}, ${wallS}s wall)`);
  console.log(`  candidates (pre-pass words): ${result.candidates}`);
  console.log(`  batches (LLM calls):         ${result.batches}`);
  console.log(`  kept words:                  ${result.keptWords.length}`);
  console.log(
    `  sample kept (≤20): ${result.keptWords.slice(0, 20).join(", ") || "(none)"}`,
  );

  rule("COVERAGE INDICATOR");
  console.log(`  total candidates triaged: ${result.coverage.total}`);
  console.log(`  triaged (decided):        ${result.coverage.triaged}`);
  console.log(`  kept (in English deck):   ${result.coverage.kept}`);
  console.log(`  untested kept:            ${result.coverage.untested}`);

  rule("REAL TOKENS / COST  (summed from llm_call rows)");
  console.log(`  tokensIn:  ${result.tokensIn}`);
  console.log(`  tokensOut: ${result.tokensOut}`);
  console.log(
    `  per candidate: in=${result.tokensPerCandidateIn.toFixed(2)}  out=${result.tokensPerCandidateOut.toFixed(2)}`,
  );
  const estimate = estimateGutenbergCostUsd(result.candidates, model);
  console.log(`  ACTUAL summed cost: $${result.costUsd.toFixed(4)}`);
  console.log(
    `  upfront ESTIMATE  : $${estimate.toFixed(4)}  (model priced: ${modelPricing(model) ? "yes" : "no"})`,
  );
  if (estimate > 0) {
    console.log(
      `  estimate/actual ratio: ${(estimate / (result.costUsd || estimate)).toFixed(2)}x`,
    );
  }

  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
}

// Only run main() when invoked as a script, never on import (the test imports
// runGutenbergValidation directly).
if (process.argv[1] && process.argv[1].endsWith("validate-gutenberg.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
