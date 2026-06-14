import { unzipSync, strFromU8 } from "fflate";
import { normalize } from "@estudio/shared";
import type { DB } from "../db/db.js";
import { insertSource } from "../db/queries.js";
import { deckIdForLanguage } from "../db/triage-queries.js";
import { insertWord } from "../db/word-queries.js";

/** A single curated card: the owner's term + their own definition (the back). */
export interface MochiCard {
  term: string;
  definition: string;
}

export interface ParsedMochi {
  deckName: string;
  cards: MochiCard[];
  malformed: number;
}

const SEPARATOR = "\n---\n";

/**
 * Parse a Mochi `.mochi` export (a ZIP holding a single Transit-JSON
 * `data.json`). We don't need a general Transit decoder — `JSON.parse` and read
 * the specific `~:`-prefixed keys. Iterates ALL decks (exports usually have one).
 * Throws if there is no `data.json` or it isn't parseable Mochi (route → 400).
 */
export function parseMochiExport(zip: Buffer): ParsedMochi {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(zip));
  } catch {
    throw new Error("not a readable .mochi file (not a ZIP archive)");
  }

  const entry = files["data.json"];
  if (!entry) {
    throw new Error("not a Mochi export: no data.json entry in the archive");
  }

  let data: unknown;
  try {
    data = JSON.parse(strFromU8(entry));
  } catch {
    throw new Error("not a Mochi export: data.json is not valid JSON");
  }

  const decks = (data as Record<string, unknown>)?.["~:decks"];
  if (!Array.isArray(decks)) {
    throw new Error("not a Mochi export: missing ~:decks");
  }

  const cards: MochiCard[] = [];
  const deckNames: string[] = [];
  let malformed = 0;
  for (const deck of decks) {
    const d = deck as Record<string, unknown>;
    const name = typeof d["~:name"] === "string" ? (d["~:name"] as string) : "";
    deckNames.push(name);
    const cardList = (d["~:cards"] as Record<string, unknown> | undefined)?.[
      "~#list"
    ];
    if (!Array.isArray(cardList)) continue;
    for (const card of cardList) {
      const c = card as Record<string, unknown>;
      const content = typeof c["~:content"] === "string" ? c["~:content"] : "";
      const fallbackName =
        typeof c["~:name"] === "string" ? (c["~:name"] as string) : "";

      const sepIndex = content.indexOf(SEPARATOR);
      let term: string;
      let definition: string;
      if (sepIndex === -1) {
        term = (content || fallbackName).trim();
        definition = "";
      } else {
        term = content.slice(0, sepIndex).trim();
        definition = content.slice(sepIndex + SEPARATOR.length).trim();
      }

      if (term === "") { malformed++; continue; }
      cards.push({ term, definition });
    }
  }

  return { deckName: deckNames.filter((n) => n !== "")[0] ?? "Vocab", cards, malformed };
}

export interface ImportMochiOpts {
  /** Original filename of the upload, recorded as the source's ref. */
  ref: string;
  /** Where the uploaded .mochi file was persisted (source provenance). */
  storedPath: string;
}

export interface ImportMochiResult {
  imported: number;
  duplicates: number;
  malformed: number;
  total: number;
  deck: "en";
}

/**
 * Add the parsed curated cards to the English deck. Definitions are the owner's
 * own (the card back) → `definitionOrigin: "owner"`, no LLM. Deduped against
 * existing 'en' words by normalized lemma AND term (mirrors placement.ts), and
 * dedupes within the import itself (add-as-you-go).
 */
export function importMochiCards(
  db: DB,
  parsed: ParsedMochi,
  opts: ImportMochiOpts,
): ImportMochiResult {
  const sourceId = insertSource(db, {
    type: "mochi",
    title: `Mochi: ${parsed.deckName}`,
    ref: opts.ref,
    storedPath: opts.storedPath,
    language: "en",
  });

  const deckId = deckIdForLanguage(db, "en");

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

  let imported = 0;
  let duplicates = 0;
  for (const card of parsed.cards) {
    const normTerm = normalize(card.term);
    if (existingLemmas.has(normTerm) || existingTerms.has(normTerm)) {
      duplicates++;
      continue;
    }
    insertWord(db, {
      term: card.term,
      language: "en",
      lemma: null,
      partOfSpeech: null,
      definitionEs: null,
      definitionEn: card.definition || null,
      example: null,
      level: null,
      status: "new",
      deckId,
      sourceId,
      definitionOrigin: "owner",
      promptVersion: null,
    });
    existingTerms.add(normTerm);
    imported++;
  }

  return { imported, duplicates, malformed: parsed.malformed, total: parsed.cards.length, deck: "en" };
}
