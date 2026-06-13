/**
 * Live, end-to-end validation of the PDF ingestion pipeline against the real
 * workbook scans in /docs/fixtures/workbook/ — using the REAL Anthropic
 * provider (live vision calls), not the test mock.
 *
 *   cp /workspace/.env .env   # ANTHROPIC_API_KEY, git-ignored
 *   npx tsx server/src/scripts/validate-ingestion.ts
 *
 * It boots a throwaway SQLite db in a temp dir, registers each fixture as a
 * `source` exactly as the upload route does (getPageCount + insertSourcePages),
 * runs runPdfIngestion directly, then prints per-page outcomes, extraction
 * items, and the summed llm_call cost. This script is NOT part of check.sh.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { openDb } from "../db/db.js";
import { runMigrations } from "../db/migrate.js";
import { insertSource, insertSourcePages } from "../db/queries.js";
import { createAnthropicProvider } from "../llm/anthropic.js";
import { LlmService } from "../llm/service.js";
import { getPageCount } from "../pdf/pages.js";
import { runPdfIngestion } from "../jobs/pdfIngestion.js";

dotenv.config();

const fixturesDir = fileURLToPath(
  new URL("../../../docs/fixtures/workbook/", import.meta.url),
);
const FIXTURES = [
  "Grammar worksheet to process.pdf",
  "Paragraph to Find words in.pdf",
];

async function main(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(
      "ANTHROPIC_API_KEY missing. Run `cp /workspace/.env .env` first.",
    );
    process.exit(1);
  }

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "estudio-validate-"));
  const db = openDb(dataDir);
  runMigrations(db, dataDir);
  const llm = new LlmService(db, {
    anthropic: createAnthropicProvider(apiKey),
  });

  for (const fixture of FIXTURES) {
    const filePath = path.join(fixturesDir, fixture);
    const pdf = fs.readFileSync(filePath);
    const pageCount = await getPageCount(pdf);
    const sourceId = insertSource(db, {
      type: "pdf",
      title: path.basename(fixture, ".pdf"),
      ref: fixture,
      storedPath: filePath,
      language: "es",
    });
    insertSourcePages(db, sourceId, pageCount);

    console.log(`\n${"=".repeat(72)}`);
    console.log(`SOURCE ${sourceId}: ${fixture}  (${pageCount} page(s))`);
    console.log("=".repeat(72));

    try {
      const result = await runPdfIngestion(db, llm, { sourceId });
      console.log("job result:", JSON.stringify(result.pages));
    } catch (err) {
      console.error("INGESTION THREW:", err instanceof Error ? err.message : err);
    }

    const pages = db
      .prepare(
        "SELECT page_no, kind, status, error FROM source_page WHERE source_id = ? ORDER BY page_no",
      )
      .all(sourceId) as {
      page_no: number;
      kind: string;
      status: string;
      error: string | null;
    }[];
    for (const p of pages) {
      console.log(
        `  page ${p.page_no}: kind=${p.kind} status=${p.status}` +
          (p.error ? ` error=${p.error}` : ""),
      );
    }

    const items = db
      .prepare(
        `SELECT term, lemma, part_of_speech, definition_es, definition_en,
                example, level, likely_known, batch_no, decision, word_id
           FROM extraction_item WHERE source_id = ? ORDER BY id`,
      )
      .all(sourceId) as Record<string, unknown>[];
    console.log(`  ${items.length} extraction_item candidate(s):`);
    for (const it of items) {
      console.log(
        `    • ${it.term}  [lemma=${it.lemma} · ${it.part_of_speech} · ${it.level} · lk=${it.likely_known}]`,
      );
      console.log(`        es: ${it.definition_es}`);
      console.log(`        en: ${it.definition_en}`);
      console.log(`        ej: ${it.example}`);
    }
  }

  const cost = db
    .prepare(
      `SELECT task, status, COUNT(*) AS calls,
              COALESCE(SUM(cost_estimate_usd), 0) AS cost,
              COALESCE(SUM(tokens_in), 0) AS tin,
              COALESCE(SUM(tokens_out), 0) AS tout
         FROM llm_call GROUP BY task, status ORDER BY task, status`,
    )
    .all() as {
    task: string;
    status: string;
    calls: number;
    cost: number;
    tin: number;
    tout: number;
  }[];
  const total = db
    .prepare("SELECT COALESCE(SUM(cost_estimate_usd), 0) AS c FROM llm_call")
    .get() as { c: number };

  console.log(`\n${"=".repeat(72)}`);
  console.log("LLM CALL SUMMARY");
  console.log("=".repeat(72));
  for (const r of cost) {
    console.log(
      `  ${r.task} [${r.status}]: ${r.calls} call(s), ` +
        `${r.tin} in / ${r.tout} out tokens, $${r.cost.toFixed(4)}`,
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
