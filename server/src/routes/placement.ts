import { normalize } from "@estudio/shared";
import type {
  PlacementCompleteRequest,
  PlacementCompleteResponse,
  PlacementNextRequest,
  PlacementNextResponse,
  PlacementStatusResponse,
  PlacementWord,
} from "@estudio/shared";
import type { Express, Request, Response } from "express";
import { nowIso, type DB } from "../db/db.js";
import { deckIdForLanguage } from "../db/triage-queries.js";
import { insertSource } from "../db/queries.js";
import { insertWord } from "../db/word-queries.js";
import { buildCalibrationSample } from "../jobs/textIngestion.js";
import type { LlmService } from "../llm/service.js";
import { extractJson } from "../jobs/textIngestion.js";
import { BANDS, nextStep, type Band, type BandResult } from "../placement/adaptive.js";

const BAND_SIZE = 6;

function error(res: Response, status: number, message: string, code: string) {
  res.status(status).json({ error: { message, code } });
}

/** Setting KV key for caching a generated band word list. */
function bandCacheKey(band: Band): string {
  return `placement.band.${band}`;
}

/** Setting KV key for placement completion status. */
const PLACEMENT_SETTING_KEY = "english_placement";

interface PlacementSetting {
  level: Band;
  seeded: number;
  at: string;
}

function readPlacementSetting(db: DB): PlacementSetting | null {
  const row = db
    .prepare("SELECT value FROM setting WHERE key = ?")
    .get(PLACEMENT_SETTING_KEY) as { value: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value) as PlacementSetting;
  } catch {
    return null;
  }
}

function writePlacementSetting(db: DB, data: PlacementSetting): void {
  const value = JSON.stringify(data);
  const now = nowIso();
  const existing = db
    .prepare("SELECT key FROM setting WHERE key = ?")
    .get(PLACEMENT_SETTING_KEY);
  if (existing) {
    db.prepare("UPDATE setting SET value = ?, updated_at = ? WHERE key = ?").run(
      value,
      now,
      PLACEMENT_SETTING_KEY,
    );
  } else {
    db.prepare(
      "INSERT INTO setting (key, value, created_at, updated_at) VALUES (?, ?, ?, ?)",
    ).run(PLACEMENT_SETTING_KEY, value, now, now);
  }
}

/** Load cached band words from the setting table; null if not cached. */
function loadBandCache(db: DB, band: Band): PlacementWord[] | null {
  const key = bandCacheKey(band);
  const row = db
    .prepare("SELECT value FROM setting WHERE key = ?")
    .get(key) as { value: string } | undefined;
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value) as unknown;
    if (Array.isArray(parsed)) return parsed as PlacementWord[];
    return null;
  } catch {
    return null;
  }
}

/** Store generated band words in the setting table for re-use. */
function saveBandCache(db: DB, band: Band, words: PlacementWord[]): void {
  const key = bandCacheKey(band);
  const value = JSON.stringify(words);
  const now = nowIso();
  const existing = db
    .prepare("SELECT key FROM setting WHERE key = ?")
    .get(key);
  if (existing) {
    db.prepare("UPDATE setting SET value = ?, updated_at = ? WHERE key = ?").run(
      value,
      now,
      key,
    );
  } else {
    db.prepare(
      "INSERT INTO setting (key, value, created_at, updated_at) VALUES (?, ?, ?, ?)",
    ).run(key, value, now, now);
  }
}

/** Generate a band's word list via LLM, or return from cache. */
async function getBandWords(
  db: DB,
  llm: LlmService,
  band: Band,
  knownSample: string,
): Promise<PlacementWord[]> {
  const cached = loadBandCache(db, band);
  if (cached) return cached;

  const raw = await llm.complete("english_placement", {
    band,
    count: String(BAND_SIZE),
    known_sample: knownSample || "(none)",
  });

  const parsed = extractJson(raw) as { words?: unknown };
  if (!Array.isArray(parsed.words)) {
    throw new Error(`invalid english_placement response: ${raw.slice(0, 200)}`);
  }
  const words: PlacementWord[] = (parsed.words as Record<string, unknown>[]).map((w) => ({
    term: String(w.term ?? ""),
    lemma: String(w.lemma ?? w.term ?? ""),
    part_of_speech: String(w.part_of_speech ?? ""),
    definition_en: String(w.definition_en ?? ""),
    band: band,
  }));

  saveBandCache(db, band, words);
  return words;
}

export function registerPlacementRoutes(
  app: Express,
  db: DB,
  llm?: LlmService,
): void {
  // GET /api/placement/status — calibrated state for the System row.
  app.get("/api/placement/status", (_req: Request, res: Response) => {
    const setting = readPlacementSetting(db);
    if (!setting) {
      const body: PlacementStatusResponse = { calibrated: false };
      res.json(body);
      return;
    }
    const body: PlacementStatusResponse = {
      calibrated: true,
      level: setting.level,
      seeded: setting.seeded,
    };
    res.json(body);
  });

  // POST /api/placement/next — adaptive probe step.
  app.post("/api/placement/next", async (req: Request, res: Response) => {
    if (!llm) {
      error(res, 503, "LLM service unavailable", "llm_unavailable");
      return;
    }

    const body = (req.body ?? {}) as PlacementNextRequest;
    const completedBands = Array.isArray(body.completedBands)
      ? body.completedBands
      : [];

    // Build band results from completed bands
    const bandResults: BandResult[] = completedBands.map((b) => ({
      band: b.band,
      known: b.knownTerms.length,
      total: b.words.length,
    }));

    const decision = nextStep(bandResults);

    if (decision.done) {
      const resp: PlacementNextResponse = { done: true, level: decision.level };
      res.json(resp);
      return;
    }

    try {
      const knownSample = buildCalibrationSample(db, "en");
      const words = await getBandWords(db, llm, decision.nextBand, knownSample);
      const resp: PlacementNextResponse = {
        done: false,
        band: decision.nextBand,
        words,
      };
      res.json(resp);
    } catch (err) {
      error(
        res,
        502,
        "Couldn't fetch placement words — try again.",
        "llm_failed",
      );
    }
  });

  // POST /api/placement/complete — seed known words and record level.
  app.post("/api/placement/complete", (req: Request, res: Response) => {
    const body = (req.body ?? {}) as PlacementCompleteRequest;

    if (typeof body.level !== "string" || !BANDS.includes(body.level as Band)) {
      error(res, 400, "Invalid level", "invalid_level");
      return;
    }
    if (!Array.isArray(body.knownWords)) {
      error(res, 400, "knownWords must be an array", "invalid_known_words");
      return;
    }

    const level = body.level as Band;
    const knownWords = body.knownWords as PlacementWord[];

    // Create one manual source for provenance (insertWord doesn't expose source_id
    // but the source row documents this seeding event in the source table).
    insertSource(db, {
      type: "manual",
      title: "English placement assessment",
      ref: "",
      storedPath: "",
      language: "en",
    });

    const deckId = deckIdForLanguage(db, "en");

    // Dedupe against existing 'en' words by normalized lemma
    const existingLemmas = new Set(
      (
        db
          .prepare(
            "SELECT lemma_normalized FROM word WHERE language = 'en' AND lemma_normalized IS NOT NULL",
          )
          .all() as { lemma_normalized: string }[]
      ).map((r) => r.lemma_normalized),
    );
    const existingTerms = new Set(
      (
        db
          .prepare("SELECT term_normalized FROM word WHERE language = 'en'")
          .all() as { term_normalized: string }[]
      ).map((r) => r.term_normalized),
    );

    let seeded = 0;
    for (const w of knownWords) {
      const normLemma = normalize(w.lemma || w.term);
      const normTerm = normalize(w.term);
      if (existingLemmas.has(normLemma) || existingTerms.has(normTerm)) {
        continue;
      }
      insertWord(db, {
        term: w.term,
        language: "en",
        lemma: w.lemma || null,
        partOfSpeech: w.part_of_speech || null,
        definitionEs: null,
        definitionEn: w.definition_en || null,
        example: null,
        level: w.band || null,
        status: "known",
        deckId,
        definitionOrigin: "llm",
        promptVersion: null,
      });
      existingLemmas.add(normLemma);
      existingTerms.add(normTerm);
      seeded++;
    }

    writePlacementSetting(db, { level, seeded, at: nowIso() });

    const resp: PlacementCompleteResponse = { level, seeded };
    res.json(resp);
  });
}
