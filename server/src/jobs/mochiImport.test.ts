import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { openDb, type DB } from "../db/db.js";
import { runMigrations } from "../db/migrate.js";
import {
  importMochiCards,
  parseMochiExport,
  type ParsedMochi,
} from "./mochiImport.js";

const FIXTURE = fileURLToPath(
  new URL("../../../docs/fixtures/mochi/Vocab.mochi", import.meta.url),
);

let dataDir: string;
let db: DB;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "estudio-mochi-"));
  db = openDb(dataDir);
  runMigrations(db, dataDir);
});

afterEach(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

/** Build a minimal .mochi ZIP from a data.json object literal. */
function mochiZip(data: unknown): Buffer {
  return Buffer.from(
    zipSync({ "data.json": strToU8(JSON.stringify(data)) }),
  );
}

describe("parseMochiExport", () => {
  it("parses the real fixture and finds a known card", () => {
    const parsed = parseMochiExport(fs.readFileSync(FIXTURE));
    expect(parsed.deckName).toBe("Vocab");
    expect(parsed.cards.length).toBeGreaterThan(300);

    const mammock = parsed.cards.find((c) => c.term === "Mammock");
    expect(mammock).toEqual({
      term: "Mammock",
      definition: "to tear into fragments",
    });
  });

  it("falls back to ~:name when there is no separator", () => {
    const parsed = parseMochiExport(
      mochiZip({
        "~:decks": [
          {
            "~:name": "Vocab",
            "~:cards": {
              "~#list": [{ "~:content": "Solo term", "~:name": "Solo term" }],
            },
          },
        ],
      }),
    );
    expect(parsed.cards).toEqual([{ term: "Solo term", definition: "" }]);
  });

  it("skips a card whose term is empty after trimming and counts it as malformed", () => {
    const parsed = parseMochiExport(
      mochiZip({
        "~:decks": [
          {
            "~:name": "Vocab",
            "~:cards": {
              "~#list": [
                { "~:content": "   \n---\norphan definition", "~:name": "" },
                { "~:content": "Keep\n---\nkept", "~:name": "Keep" },
              ],
            },
          },
        ],
      }),
    );
    expect(parsed.cards).toEqual([{ term: "Keep", definition: "kept" }]);
    expect(parsed.malformed).toBe(1);
  });

  it("throws on a buffer that is not a ZIP", () => {
    expect(() => parseMochiExport(Buffer.from("not a zip"))).toThrow();
  });

  it("throws when the ZIP has no data.json", () => {
    const zip = Buffer.from(zipSync({ "other.json": strToU8("{}") }));
    expect(() => parseMochiExport(zip)).toThrow(/data\.json/);
  });
});

describe("importMochiCards", () => {
  const parsed: ParsedMochi = {
    deckName: "Vocab",
    cards: [
      { term: "Mammock", definition: "to tear into fragments" },
      { term: "Petrichor", definition: "the smell of rain on dry earth" },
    ],
    malformed: 0,
  };
  const opts = { ref: "Vocab.mochi", storedPath: "/tmp/Vocab.mochi" };

  it("inserts cards into the 'en' deck with owner definitions", () => {
    const result = importMochiCards(db, parsed, opts);
    expect(result).toEqual({
      imported: 2,
      duplicates: 0,
      malformed: 0,
      total: 2,
      deck: "en",
    });

    const enDeck = db
      .prepare("SELECT id FROM deck WHERE language = 'en' ORDER BY id LIMIT 1")
      .get() as { id: number };
    const rows = db
      .prepare(
        "SELECT term, definition_en, status, definition_origin, deck_id FROM word WHERE language = 'en' ORDER BY term",
      )
      .all() as {
      term: string;
      definition_en: string;
      status: string;
      definition_origin: string;
      deck_id: number;
    }[];
    expect(rows).toEqual([
      {
        term: "Mammock",
        definition_en: "to tear into fragments",
        status: "new",
        definition_origin: "owner",
        deck_id: enDeck.id,
      },
      {
        term: "Petrichor",
        definition_en: "the smell of rain on dry earth",
        status: "new",
        definition_origin: "owner",
        deck_id: enDeck.id,
      },
    ]);

    const source = db
      .prepare("SELECT type, title, ref FROM source WHERE type = 'mochi'")
      .get() as { type: string; title: string; ref: string };
    expect(source).toEqual({
      type: "mochi",
      title: "Mochi: Vocab",
      ref: "Vocab.mochi",
    });
  });

  it("sets source_id on imported words to the mochi source row", () => {
    importMochiCards(db, parsed, opts);
    const src = db
      .prepare("SELECT id FROM source WHERE type = 'mochi'")
      .get() as { id: number };
    const words = db
      .prepare("SELECT source_id FROM word WHERE language = 'en'")
      .all() as { source_id: number | null }[];
    expect(words.length).toBeGreaterThan(0);
    for (const w of words) expect(w.source_id).toBe(src.id);
  });

  it("reports every card as a duplicate on a second import", () => {
    importMochiCards(db, parsed, opts);
    const second = importMochiCards(db, parsed, opts);
    expect(second).toEqual({
      imported: 0,
      duplicates: 2,
      malformed: 0,
      total: 2,
      deck: "en",
    });
    const count = db
      .prepare("SELECT COUNT(*) AS c FROM word WHERE language = 'en'")
      .get() as { c: number };
    expect(count.c).toBe(2);
  });

  it("threads malformed count from parsed data into the import result", () => {
    const parsedWithMalformed: ParsedMochi = {
      deckName: "Vocab",
      cards: [{ term: "Liminal", definition: "occupying a threshold" }],
      malformed: 3,
    };
    const result = importMochiCards(db, parsedWithMalformed, opts);
    expect(result.malformed).toBe(3);
    expect(result.imported).toBe(1);
    expect(result.total).toBe(1);
  });
});
