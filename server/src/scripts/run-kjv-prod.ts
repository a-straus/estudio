/**
 * PRODUCTION Gutenberg ingestion against the owner's LIVE data/app.db.
 *
 * Unlike validate-gutenberg.ts (which spins up a THROWAWAY temp db and
 * auto-confirms every word into the deck to prove the pipeline), this script
 * runs the REAL owner-facing flow against the REAL database and STOPS at the
 * triage queue: the classified hard-words land in `extraction_item`
 * (decision='pending') for the owner to keep/skip in /triage. Nothing enters
 * the study deck until the owner triages — so a big book does NOT silently add
 * thousands of cards.
 *
 * It mirrors POST /api/sources/gutenberg (fetch → strip → persist source) +
 * the /confirm route (source_pages → runGutenbergIngestion), reusing the same
 * exported building blocks the route uses, but executes the job handler inline
 * (no server / job queue needed) so the orchestrator can run it detached.
 *
 *   tsx server/src/scripts/run-kjv-prod.ts [--ref=10] [--max-words=N] [--data-dir=/workspace/data]
 *
 * OWNER-APPROVED ONLY. This spends real money on the gutenberg_extraction LLM
 * task and writes to the live database. Take a backup first. Defaults: ref=10
 * (the King James Bible), full book (no --max-words), data-dir=/workspace/data.
 *
 * NOT part of check.sh (needs a live ANTHROPIC_API_KEY + gutenberg.org egress).
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { nowIso, openDb } from "../db/db.js";
import { getSourceCoverage, insertSourcePages } from "../db/queries.js";
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

function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function truncateWords(text: string, maxWords: number): string {
  return text.trim().split(/\s+/).slice(0, maxWords).join(" ");
}

const rule = (label = ""): void => {
  console.log("=".repeat(72) + (label ? `\n${label}\n` + "=".repeat(72) : ""));
};

async function main(): Promise<void> {
  dotenv.config({ path: "/workspace/.env" });
  dotenv.config(); // also pick up a local .env if present
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    console.error("ANTHROPIC_API_KEY required (looked in /workspace/.env).");
    process.exit(1);
  }

  const ref = parseArg("ref") ?? "10";
  const dataDir = parseArg("data-dir") ?? "/workspace/data";
  // Resume an existing source: re-run the job (skips status='done' chunks,
  // re-processes 'failed'/'pending') — for mopping up chunks that failed on a
  // flaky-network pass, without re-fetching or creating a duplicate source.
  const resumeSourceRaw = parseArg("resume-source") ?? "";
  const resumeSource = resumeSourceRaw ? Number(resumeSourceRaw) : undefined;
  if (
    resumeSource !== undefined &&
    (!Number.isInteger(resumeSource) || resumeSource <= 0)
  ) {
    console.error(`invalid --resume-source: ${resumeSourceRaw}`);
    process.exit(1);
  }
  const maxWordsRaw = parseArg("max-words") ?? "";
  const maxWords = maxWordsRaw ? Number(maxWordsRaw) : undefined;
  if (maxWords !== undefined && (!Number.isFinite(maxWords) || maxWords <= 0)) {
    console.error(`invalid --max-words: ${maxWordsRaw}`);
    process.exit(1);
  }

  const db = openDb(dataDir);
  db.pragma("busy_timeout = 30000"); // tolerate the owner's app holding the db

  const llm = new LlmService(db, {
    anthropic: createAnthropicProvider(anthropicKey),
  });
  const model = llm.resolveTaskConfig("gutenberg_extraction").model;

  const fetchGutenberg = async (url: string): Promise<string> => {
    const res = await fetch(url, {
      headers: { "User-Agent": "estudio/1.0 (personal language-learning app)" },
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`gutenberg fetch failed: HTTP ${res.status}`);
    return res.text();
  };

  const started = Date.now();

  // Isolate THIS run's cost from any prior llm_call rows (so a resume reports
  // only the incremental spend).
  const costBeforeId = (
    db.prepare("SELECT COALESCE(MAX(id), 0) AS m FROM llm_call").get() as {
      m: number;
    }
  ).m;

  let sourceId: number;
  let estimate = 0;
  if (resumeSource !== undefined) {
    rule(
      `KJV PROD INGESTION (RESUME)  source=${resumeSource}  model=${model}  dataDir=${dataDir}  startedAt=${nowIso()}`,
    );
    const src = db
      .prepare("SELECT id, type FROM source WHERE id = ?")
      .get(resumeSource) as { id: number; type: string } | undefined;
    if (!src) throw new Error(`no source with id=${resumeSource}`);
    if (src.type !== "gutenberg")
      throw new Error(
        `source ${resumeSource} is type '${src.type}', not gutenberg`,
      );
    sourceId = src.id;
    const pend = (
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM source_page WHERE source_id = ? AND status != 'done'",
        )
        .get(sourceId) as { n: number }
    ).n;
    console.log(`  resuming source ${sourceId}: ${pend} chunk(s) not yet done`);
  } else {
    rule(
      `KJV PROD INGESTION  ref=${ref}  model=${model}  dataDir=${dataDir}  maxWords=${maxWords ?? "(none — full book)"}  startedAt=${nowIso()}`,
    );
    const url = resolveGutenbergUrl(ref);
    if (!url) throw new Error(`couldn't resolve a Gutenberg book from "${ref}"`);
    const raw = await fetchGutenberg(url);
    let text = stripGutenbergBoilerplate(raw);
    if (text.trim() === "") throw new Error("fetched book had no readable text");
    if (maxWords !== undefined) text = truncateWords(text, maxWords);
    const title = deriveGutenbergTitle(raw, ref);

    const wordCount = gutenbergWordCount(text);
    const batches = gutenbergChunkCount(text);
    estimate = estimateGutenbergCostUsd(wordCount, model);
    console.log(`  title: ${title}`);
    console.log(`  pre-pass candidate words: ${wordCount}`);
    console.log(`  classification batches:   ${batches}`);
    console.log(
      `  UPFRONT COST ESTIMATE: $${estimate.toFixed(4)} (err-high; model priced: ${modelPricing(model) ? "yes" : "no"})`,
    );

    // Persist the source exactly as POST /api/sources/gutenberg does.
    const now = nowIso();
    sourceId = Number(
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
    console.log(`  persisted source id=${sourceId} → ${storedPath}`);

    // Mirror /confirm: one pending source_page per chunk. Words land in
    // extraction_item as 'pending' (the triage queue) — we DO NOT
    // auto-decide/confirm them.
    insertSourcePages(db, sourceId, batches);
  }

  console.log(`  running ingestion on ${model} (resumable; STOPS at triage)...`);
  await runGutenbergIngestion(db, llm, { sourceId });
  const wallS = ((Date.now() - started) / 1000).toFixed(0);

  const triageQueue = (
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM extraction_item WHERE source_id = ? AND decision = 'pending'",
      )
      .get(sourceId) as { n: number }
  ).n;
  const coverage = getSourceCoverage(db, sourceId);
  const cost = db
    .prepare(
      `SELECT COALESCE(SUM(tokens_in), 0) AS tokensIn,
              COALESCE(SUM(tokens_out), 0) AS tokensOut,
              COALESCE(SUM(cost_estimate_usd), 0) AS costUsd
         FROM llm_call WHERE id > ? AND task = 'gutenberg_extraction'`,
    )
    .get(costBeforeId) as {
    tokensIn: number;
    tokensOut: number;
    costUsd: number;
  };

  rule(`DONE  (source ${sourceId}, ${wallS}s wall, finishedAt=${nowIso()})`);
  console.log(`  hard-words now in TRIAGE queue (pending): ${triageQueue}`);
  console.log(
    `  coverage: total=${coverage.total} triaged=${coverage.triaged} kept=${coverage.kept} untested=${coverage.untested}`,
  );
  console.log(
    `  ACTUAL cost: $${cost.costUsd.toFixed(4)}  (tokensIn=${cost.tokensIn} tokensOut=${cost.tokensOut})`,
  );
  console.log(
    `  estimate/actual: $${estimate.toFixed(4)} / $${cost.costUsd.toFixed(4)}`,
  );
  console.log(
    `  NEXT: owner opens /triage?source=${sourceId} to keep/skip; kept words enter the English deck.`,
  );
  db.close();
}

main().catch((err) => {
  console.error("KJV PROD INGESTION FAILED:", err);
  process.exit(1);
});
