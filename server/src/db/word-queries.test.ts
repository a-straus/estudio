import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalize } from "@estudio/shared";
import { openDb, type DB } from "./db.js";
import { runMigrations } from "./migrate.js";
import {
  deleteWord,
  getDefaultDeckId,
  getWordDetail,
  insertWord,
  listWords,
  updateWord,
  wordExistsById,
  wordExistsByTermLanguage,
  type InsertWordFields,
} from "./word-queries.js";

let dataDir: string;
let db: DB;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "estudio-wordq-"));
  db = openDb(dataDir);
  runMigrations(db, dataDir);
});

afterEach(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function add(over: Partial<InsertWordFields> & { term: string }): number {
  return insertWord(db, {
    language: "es",
    lemma: over.lemma ?? null,
    partOfSpeech: null,
    definitionEs: null,
    definitionEn: null,
    example: null,
    level: null,
    status: "new",
    deckId: 1,
    definitionOrigin: "llm",
    promptVersion: null,
    ...over,
  });
}

describe("word-queries", () => {
  it("writes normalized columns lowercased + accent-stripped on insert", () => {
    const id = add({ term: "Más", lemma: "Más" });
    const row = db
      .prepare(
        "SELECT term, term_normalized, lemma_normalized FROM word WHERE id = ?",
      )
      .get(id) as {
      term: string;
      term_normalized: string;
      lemma_normalized: string;
    };
    // Stored text keeps accents; the normalized columns are stripped.
    expect(row.term).toBe("Más");
    expect(row.term_normalized).toBe("mas");
    expect(row.lemma_normalized).toBe("mas");
  });

  it("search is accent-insensitive: 'mas' finds 'más'", () => {
    add({ term: "más" });
    add({ term: "casa" });
    const res = listWords(db, { q: "mas" });
    expect(res.items.map((w) => w.term)).toEqual(["más"]);
  });

  it("search also matches by lemma and an accented query finds plain text", () => {
    add({ term: "corriendo", lemma: "correr" });
    // Query the lemma, with an accent that the stored lemma lacks.
    expect(listWords(db, { q: "correr" }).items).toHaveLength(1);
    // Accent in the query is stripped too.
    add({ term: "averiguar" });
    expect(listWords(db, { q: "áVeriGuar" }).items).toHaveLength(1);
  });

  it("filters by status, partOfSpeech and deck; counts ignore pagination", () => {
    add({ term: "uno", status: "new" });
    add({ term: "dos", status: "mature", partOfSpeech: "sustantivo" });
    add({ term: "tres", status: "mature", partOfSpeech: "verbo" });

    expect(listWords(db, { status: "mature" }).total).toBe(2);
    expect(
      listWords(db, { status: "mature", partOfSpeech: "verbo" }).items.map(
        (w) => w.term,
      ),
    ).toEqual(["tres"]);

    const page = listWords(db, { status: "mature", limit: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(2);
  });

  it("sorts alpha by normalized term and recent by created_at desc", () => {
    add({ term: "Zebra" });
    add({ term: "ábaco" });
    add({ term: "mesa" });
    const alpha = listWords(db, { sort: "alpha" }).items.map((w) => w.term);
    expect(alpha).toEqual(["ábaco", "mesa", "Zebra"]);
  });

  it("getDefaultDeckId resolves the seeded decks by language", () => {
    expect(getDefaultDeckId(db, "es")).toBe(1);
    expect(getDefaultDeckId(db, "en")).toBe(2);
  });

  it("wordExistsByTermLanguage is exact-match on the stored (accented) term", () => {
    add({ term: "más" });
    expect(wordExistsByTermLanguage(db, "más", "es")).toBe(true);
    expect(wordExistsByTermLanguage(db, "mas", "es")).toBe(false);
    expect(wordExistsByTermLanguage(db, "más", "en")).toBe(false);
  });

  it("updateWord flips origin to owner + stamps owner_edited_at on definition edits", () => {
    const id = add({ term: "duelo", definitionEn: "grief" });
    updateWord(db, id, { definitionEn: "mourning; grief" });
    const detail = getWordDetail(db, id)!;
    expect(detail.definitionEn).toBe("mourning; grief");
    expect(detail.definitionOrigin).toBe("owner");
    expect(detail.ownerEditedAt).not.toBeNull();
  });

  it("updateWord on a non-definition field leaves origin untouched", () => {
    const id = add({ term: "duelo" });
    updateWord(db, id, { status: "mature" });
    const detail = getWordDetail(db, id)!;
    expect(detail.status).toBe("mature");
    expect(detail.definitionOrigin).toBe("llm");
    expect(detail.ownerEditedAt).toBeNull();
  });

  it("updateWord keeps lemma_normalized in sync", () => {
    const id = add({ term: "anduve", lemma: "andar" });
    updateWord(db, id, { lemma: "ándar" });
    const row = db
      .prepare("SELECT lemma_normalized FROM word WHERE id = ?")
      .get(id) as { lemma_normalized: string };
    expect(row.lemma_normalized).toBe(normalize("ándar"));
  });

  it("getWordDetail joins source title and recent reviews, newest first", () => {
    const sourceId = Number(
      db
        .prepare("INSERT INTO source (type, title) VALUES ('manual', ?)")
        .run("Workbook p.44").lastInsertRowid,
    );
    const id = add({ term: "añoranza" });
    db.prepare("UPDATE word SET source_id = ? WHERE id = ?").run(sourceId, id);
    db.prepare(
      `INSERT INTO review_log (word_id, ts, direction, grade, ease_after, interval_after, origin)
       VALUES (?, '2026-06-01T00:00:00Z', 'w2d', 'good', 2.5, 1, 'review'),
              (?, '2026-06-02T00:00:00Z', 'w2d', 'fail', 2.3, 0, 'review')`,
    ).run(id, id);

    const detail = getWordDetail(db, id)!;
    expect(detail.sourceTitle).toBe("Workbook p.44");
    expect(detail.recentReviews).toHaveLength(2);
    expect(detail.recentReviews[0].ts).toBe("2026-06-02T00:00:00Z");
  });

  it("deleteWord removes the row; existence check then fails", () => {
    const id = add({ term: "borrar" });
    expect(wordExistsById(db, id)).toBe(true);
    deleteWord(db, id);
    expect(wordExistsById(db, id)).toBe(false);
    expect(getWordDetail(db, id)).toBeNull();
  });
});
