import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import { openDb, nowIso, type DB } from "../db/db.js";
import { runMigrations } from "../db/migrate.js";
import { logger } from "../logger.js";
import { createApp } from "../app.js";

let dataDir: string;
let db: DB;
let app: Express;
let sourceId: number;

interface SeedItem {
  term: string;
  lemma?: string | null;
  definitionEn?: string | null;
  likelyKnown?: number | null;
  batchNo?: number;
}

function seedSource(): number {
  const now = nowIso();
  const r = db
    .prepare(
      "INSERT INTO source (type, title, created_at, updated_at) VALUES ('pdf', 'Moby-Dick', ?, ?)",
    )
    .run(now, now);
  return Number(r.lastInsertRowid);
}

function seedItem(src: number, item: SeedItem): number {
  const now = nowIso();
  const r = db
    .prepare(
      `INSERT INTO extraction_item
         (source_id, term, lemma, part_of_speech, definition_es, definition_en,
          example, level, likely_known, batch_no, decision, created_at, updated_at)
       VALUES (?, ?, ?, 'sustantivo', 'def es', ?, 'un ejemplo', 'C1', ?, ?, 'pending', ?, ?)`,
    )
    .run(
      src,
      item.term,
      item.lemma ?? item.term,
      item.definitionEn ?? `gloss of ${item.term}`,
      item.likelyKnown ?? 0.1,
      item.batchNo ?? 1,
      now,
      now,
    );
  return Number(r.lastInsertRowid);
}

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "estudio-triage-"));
  db = openDb(dataDir);
  runMigrations(db, dataDir);
  app = createApp(db);
  sourceId = seedSource();
});

afterEach(() => {
  logger.detachDb();
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("GET /api/sources/:id/extraction-items", () => {
  it("returns the active batch with tally and source meta", async () => {
    seedItem(sourceId, { term: "arpón", likelyKnown: 0.1 });
    seedItem(sourceId, { term: "leeward", likelyKnown: 0.8 });

    const res = await request(app).get(
      `/api/sources/${sourceId}/extraction-items`,
    );
    expect(res.status).toBe(200);
    expect(res.body.source).toEqual({ id: sourceId, title: "Moby-Dick" });
    expect(res.body.batchNo).toBe(1);
    expect(res.body.batchCount).toBe(1);
    expect(res.body.totalInBatch).toBe(2);
    expect(res.body.sortedInBatch).toBe(0);
    expect(res.body.items.map((i: { term: string }) => i.term)).toEqual([
      "arpón",
      "leeward",
    ]);
    expect(res.body.tally).toEqual({ know: 0, learn: 0, skip: 0, pending: 2 });
  });

  it("picks the lowest batch that still has pending items", async () => {
    seedItem(sourceId, { term: "uno", batchNo: 1 });
    const second = seedItem(sourceId, { term: "dos", batchNo: 2 });
    // Decide everything in batch 1.
    const unoId = (
      db.prepare("SELECT id FROM extraction_item WHERE term = 'uno'").get() as {
        id: number;
      }
    ).id;
    await request(app)
      .patch(`/api/extraction-items/${unoId}`)
      .send({ decision: "skip" });

    const res = await request(app).get(
      `/api/sources/${sourceId}/extraction-items`,
    );
    expect(res.body.batchNo).toBe(2);
    expect(res.body.items[0].id).toBe(second);
  });

  it("404s for an unknown source", async () => {
    const res = await request(app).get("/api/sources/9999/extraction-items");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  it("returns an empty batch list when nothing was extracted", async () => {
    const res = await request(app).get(
      `/api/sources/${sourceId}/extraction-items`,
    );
    expect(res.status).toBe(200);
    expect(res.body.batchCount).toBe(0);
    expect(res.body.items).toEqual([]);
  });
});

describe("PATCH /api/extraction-items/:id", () => {
  it("records a decision and supports undo via 'pending'", async () => {
    const id = seedItem(sourceId, { term: "arpón" });

    const learn = await request(app)
      .patch(`/api/extraction-items/${id}`)
      .send({ decision: "learn" });
    expect(learn.status).toBe(200);
    expect(learn.body.decision).toBe("learn");
    expect(learn.body.decidedAt).toBeNull(); // not materialized yet

    const undo = await request(app)
      .patch(`/api/extraction-items/${id}`)
      .send({ decision: "pending" });
    expect(undo.body.decision).toBe("pending");
  });

  it("rejects an invalid decision", async () => {
    const id = seedItem(sourceId, { term: "arpón" });
    const res = await request(app)
      .patch(`/api/extraction-items/${id}`)
      .send({ decision: "maybe" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_decision");
  });

  it("404s for an unknown item", async () => {
    const res = await request(app)
      .patch("/api/extraction-items/9999")
      .send({ decision: "learn" });
    expect(res.status).toBe(404);
  });

  it("409s when re-deciding an already-confirmed item", async () => {
    const id = seedItem(sourceId, { term: "arpón" });
    await request(app)
      .patch(`/api/extraction-items/${id}`)
      .send({ decision: "skip" });
    await request(app)
      .post(`/api/sources/${sourceId}/extraction-items/confirm`)
      .send({ batchNo: 1 });

    const res = await request(app)
      .patch(`/api/extraction-items/${id}`)
      .send({ decision: "learn" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("already_confirmed");
  });
});

describe("POST /api/sources/:id/extraction-items/bulk-decision", () => {
  it("decides a whole likely-known group, leaving the other untouched", async () => {
    seedItem(sourceId, { term: "newish", likelyKnown: 0.1 });
    seedItem(sourceId, { term: "knownish", likelyKnown: 0.9 });

    const res = await request(app)
      .post(`/api/sources/${sourceId}/extraction-items/bulk-decision`)
      .send({ batchNo: 1, group: "probably_new", decision: "learn" });
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].term).toBe("newish");
    expect(res.body.tally).toEqual({ know: 0, learn: 1, skip: 0, pending: 1 });
  });

  it("rejects an unknown group", async () => {
    const res = await request(app)
      .post(`/api/sources/${sourceId}/extraction-items/bulk-decision`)
      .send({ batchNo: 1, group: "whatever", decision: "learn" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_group");
  });

  it("never overrides decisions the user already made by hand", async () => {
    const skipped = seedItem(sourceId, { term: "uno", likelyKnown: 0.1 });
    const known = seedItem(sourceId, { term: "dos", likelyKnown: 0.1 });
    seedItem(sourceId, { term: "tres", likelyKnown: 0.1 }); // still pending
    await request(app)
      .patch(`/api/extraction-items/${skipped}`)
      .send({ decision: "skip" });
    await request(app)
      .patch(`/api/extraction-items/${known}`)
      .send({ decision: "know" });

    const res = await request(app)
      .post(`/api/sources/${sourceId}/extraction-items/bulk-decision`)
      .send({ batchNo: 1, group: "probably_new", decision: "learn" });
    expect(res.status).toBe(200);
    // Only the still-pending item is affected.
    expect(res.body.items.map((i: { term: string }) => i.term)).toEqual([
      "tres",
    ]);
    expect(res.body.tally).toEqual({ know: 1, learn: 1, skip: 1, pending: 0 });
  });
});

describe("POST /api/sources/:id/extraction-items/confirm", () => {
  it("materializes learn/know words, archives known, records skips", async () => {
    const learnId = seedItem(sourceId, { term: "arpón" });
    const knowId = seedItem(sourceId, { term: "barco" });
    const skipId = seedItem(sourceId, { term: "scud" });
    await request(app)
      .patch(`/api/extraction-items/${learnId}`)
      .send({ decision: "learn" });
    await request(app)
      .patch(`/api/extraction-items/${knowId}`)
      .send({ decision: "know" });
    await request(app)
      .patch(`/api/extraction-items/${skipId}`)
      .send({ decision: "skip" });

    const res = await request(app)
      .post(`/api/sources/${sourceId}/extraction-items/confirm`)
      .send({ batchNo: 1 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      materialized: 2,
      known: 1,
      learn: 1,
      skipped: 1,
      dedupeHits: [],
    });

    // learn → status 'new', know → status 'known', no card_state for either.
    const words = db
      .prepare("SELECT term, status, language, deck_id FROM word ORDER BY id")
      .all() as {
      term: string;
      status: string;
      language: string;
      deck_id: number;
    }[];
    expect(words).toEqual([
      { term: "arpón", status: "new", language: "es", deck_id: 1 },
      { term: "barco", status: "known", language: "es", deck_id: 1 },
    ]);
    expect(db.prepare("SELECT COUNT(*) AS c FROM card_state").get()).toEqual({
      c: 0,
    });

    // skip leaves no word but stamps decided_at; learn/know link word_id.
    const items = db
      .prepare(
        "SELECT term, decision, decided_at, word_id FROM extraction_item ORDER BY id",
      )
      .all() as {
      term: string;
      decided_at: string | null;
      word_id: number | null;
    }[];
    expect(items.every((i) => i.decided_at !== null)).toBe(true);
    expect(items.find((i) => i.term === "scud")!.word_id).toBeNull();
    expect(items.find((i) => i.term === "arpón")!.word_id).not.toBeNull();
  });

  it("409s if any item in the batch is still pending", async () => {
    const a = seedItem(sourceId, { term: "arpón" });
    seedItem(sourceId, { term: "barco" }); // left pending
    await request(app)
      .patch(`/api/extraction-items/${a}`)
      .send({ decision: "learn" });

    const res = await request(app)
      .post(`/api/sources/${sourceId}/extraction-items/confirm`)
      .send({ batchNo: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("batch_incomplete");
    expect(db.prepare("SELECT COUNT(*) AS c FROM word").get()).toEqual({
      c: 0,
    });
  });

  it("surfaces dedupe hits instead of silently dropping or merging them", async () => {
    // Pre-existing word with the same lemma.
    const now = nowIso();
    db.prepare(
      `INSERT INTO word (term, term_normalized, lemma, lemma_normalized, language, definition_en, status, deck_id, created_at, updated_at)
       VALUES ('arpon', 'arpon', 'arpón', 'arpon', 'es', 'harpoon (existing)', 'learning', 1, ?, ?)`,
    ).run(now, now);

    const dupId = seedItem(sourceId, { term: "arpón", lemma: "arpón" });
    await request(app)
      .patch(`/api/extraction-items/${dupId}`)
      .send({ decision: "learn" });

    const res = await request(app)
      .post(`/api/sources/${sourceId}/extraction-items/confirm`)
      .send({ batchNo: 1 });
    expect(res.status).toBe(200);
    expect(res.body.materialized).toBe(0);
    expect(res.body.dedupeHits).toHaveLength(1);
    expect(res.body.dedupeHits[0].existingWord.term).toBe("arpon");
    // The candidate stays unconfirmed until a human resolves it.
    const item = db
      .prepare("SELECT decided_at, word_id FROM extraction_item WHERE id = ?")
      .get(dupId) as { decided_at: string | null; word_id: number | null };
    expect(item.decided_at).toBeNull();
    // No second word row was created.
    expect(db.prepare("SELECT COUNT(*) AS c FROM word").get()).toEqual({
      c: 1,
    });
  });

  it("surfaces within-batch duplicates as dedupe hits and confirms the rest", async () => {
    // The same word extracted on two pages → two items in one batch.
    const first = seedItem(sourceId, { term: "arpón", lemma: "arpón" });
    const second = seedItem(sourceId, { term: "arpón", lemma: "arpón" });
    const other = seedItem(sourceId, { term: "barco" });
    for (const id of [first, second, other]) {
      await request(app)
        .patch(`/api/extraction-items/${id}`)
        .send({ decision: "learn" });
    }

    const res = await request(app)
      .post(`/api/sources/${sourceId}/extraction-items/confirm`)
      .send({ batchNo: 1 });
    expect(res.status).toBe(200); // never a 500 for duplicates
    expect(res.body.materialized).toBe(2); // first arpón + barco
    expect(res.body.dedupeHits).toHaveLength(1);
    expect(res.body.dedupeHits[0].item.id).toBe(second);
    // The hit points at the word the first occurrence just materialized.
    expect(res.body.dedupeHits[0].existingWord.term).toBe("arpón");

    const words = db.prepare("SELECT term FROM word ORDER BY id").all() as {
      term: string;
    }[];
    expect(words.map((w) => w.term)).toEqual(["arpón", "barco"]);
    // The duplicate stays unconfirmed for a human keep/merge decision.
    const dup = db
      .prepare("SELECT decided_at FROM extraction_item WHERE id = ?")
      .get(second) as { decided_at: string | null };
    expect(dup.decided_at).toBeNull();
  });

  it("surfaces homographs (same term, different lemma) as dedupe hits", async () => {
    // Existing word 'como' (lemma 'como'); the candidate 'como' has lemma
    // 'comer' — missed by a lemma-only check, caught by the exact-term check.
    const now = nowIso();
    db.prepare(
      `INSERT INTO word (term, term_normalized, lemma, lemma_normalized, language, definition_en, status, deck_id, created_at, updated_at)
       VALUES ('como', 'como', 'como', 'como', 'es', 'like, as', 'learning', 1, ?, ?)`,
    ).run(now, now);

    const homograph = seedItem(sourceId, { term: "como", lemma: "comer" });
    const other = seedItem(sourceId, { term: "barco" });
    for (const id of [homograph, other]) {
      await request(app)
        .patch(`/api/extraction-items/${id}`)
        .send({ decision: "learn" });
    }

    const res = await request(app)
      .post(`/api/sources/${sourceId}/extraction-items/confirm`)
      .send({ batchNo: 1 });
    expect(res.status).toBe(200); // never a 500
    expect(res.body.materialized).toBe(1); // barco confirms
    expect(res.body.dedupeHits).toHaveLength(1);
    expect(res.body.dedupeHits[0].item.id).toBe(homograph);
    expect(res.body.dedupeHits[0].existingWord.term).toBe("como");

    // The homograph hit is resolvable: merge links it to the existing word.
    const merge = await request(app)
      .post(`/api/extraction-items/${homograph}/resolve-dedupe`)
      .send({ resolution: "merge" });
    expect(merge.status).toBe(200);
    expect(merge.body.wordId).toBe(
      (
        db.prepare("SELECT id FROM word WHERE term = 'como'").get() as {
          id: number;
        }
      ).id,
    );
  });
});

describe("language-aware materialization (English source)", () => {
  function seedEnglishSource(): number {
    const now = nowIso();
    const r = db
      .prepare(
        "INSERT INTO source (type, title, language, created_at, updated_at) VALUES ('gutenberg', 'King James Bible', 'en', ?, ?)",
      )
      .run(now, now);
    return Number(r.lastInsertRowid);
  }

  function englishDeckId(): number {
    return (
      db.prepare("SELECT id FROM deck WHERE language = 'en'").get() as {
        id: number;
      }
    ).id;
  }

  it("routes confirmed words into the English deck with language 'en'", async () => {
    const enSource = seedEnglishSource();
    const learnId = seedItem(enSource, { term: "covenant" });
    const knowId = seedItem(enSource, { term: "wilderness" });
    await request(app)
      .patch(`/api/extraction-items/${learnId}`)
      .send({ decision: "learn" });
    await request(app)
      .patch(`/api/extraction-items/${knowId}`)
      .send({ decision: "know" });

    const res = await request(app)
      .post(`/api/sources/${enSource}/extraction-items/confirm`)
      .send({ batchNo: 1 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ materialized: 2, dedupeHits: [] });

    const enDeck = englishDeckId();
    const words = db
      .prepare("SELECT term, language, deck_id FROM word ORDER BY id")
      .all() as { term: string; language: string; deck_id: number }[];
    expect(words).toEqual([
      { term: "covenant", language: "en", deck_id: enDeck },
      { term: "wilderness", language: "en", deck_id: enDeck },
    ]);
    // Not the Spanish deck.
    const esDeck = (
      db.prepare("SELECT id FROM deck WHERE language = 'es'").get() as {
        id: number;
      }
    ).id;
    expect(words.every((w) => w.deck_id !== esDeck)).toBe(true);
  });

  it("dedupes English candidates only against English words", async () => {
    // A Spanish word sharing the same normalized lemma as an English candidate
    // must NOT cause a false dedupe hit — different language, different deck.
    const now = nowIso();
    db.prepare(
      `INSERT INTO word (term, term_normalized, lemma, lemma_normalized, language, definition_en, status, deck_id, created_at, updated_at)
       VALUES ('son', 'son', 'son', 'son', 'es', 'they are (ser)', 'learning', 1, ?, ?)`,
    ).run(now, now);

    const enSource = seedEnglishSource();
    const id = seedItem(enSource, { term: "son", lemma: "son" });
    await request(app)
      .patch(`/api/extraction-items/${id}`)
      .send({ decision: "learn" });

    const res = await request(app)
      .post(`/api/sources/${enSource}/extraction-items/confirm`)
      .send({ batchNo: 1 });
    expect(res.status).toBe(200);
    expect(res.body.materialized).toBe(1);
    expect(res.body.dedupeHits).toHaveLength(0);

    // Now there are two 'son' rows: one es, one en, each in its own deck.
    const sons = db
      .prepare("SELECT language, deck_id FROM word WHERE term = 'son' ORDER BY id")
      .all() as { language: string; deck_id: number }[];
    expect(sons.map((w) => w.language)).toEqual(["es", "en"]);
    expect(sons[1].deck_id).toBe(englishDeckId());
  });
});

describe("POST /api/extraction-items/:id/resolve-dedupe", () => {
  function seedDupe(): number {
    const now = nowIso();
    db.prepare(
      `INSERT INTO word (term, term_normalized, lemma, lemma_normalized, language, definition_en, status, deck_id, created_at, updated_at)
       VALUES ('arpon', 'arpon', 'arpón', 'arpon', 'es', 'existing', 'learning', 1, ?, ?)`,
    ).run(now, now);
    const id = seedItem(sourceId, { term: "arpón", lemma: "arpón" });
    return id;
  }

  it("merge links the candidate to the existing word without a new row", async () => {
    const id = seedDupe();
    await request(app)
      .patch(`/api/extraction-items/${id}`)
      .send({ decision: "learn" });

    const res = await request(app)
      .post(`/api/extraction-items/${id}/resolve-dedupe`)
      .send({ resolution: "merge" });
    expect(res.status).toBe(200);
    expect(res.body.decidedAt).not.toBeNull();
    const existing = db
      .prepare("SELECT id FROM word WHERE term = 'arpon'")
      .get() as { id: number };
    expect(res.body.wordId).toBe(existing.id);
    expect(db.prepare("SELECT COUNT(*) AS c FROM word").get()).toEqual({
      c: 1,
    });
  });

  it("keep materializes a separate word row", async () => {
    const id = seedDupe();
    await request(app)
      .patch(`/api/extraction-items/${id}`)
      .send({ decision: "learn" });

    const res = await request(app)
      .post(`/api/extraction-items/${id}/resolve-dedupe`)
      .send({ resolution: "keep" });
    expect(res.status).toBe(200);
    expect(res.body.decidedAt).not.toBeNull();
    expect(db.prepare("SELECT COUNT(*) AS c FROM word").get()).toEqual({
      c: 2,
    });
    const kept = db
      .prepare("SELECT status FROM word WHERE term = 'arpón'")
      .get() as { status: string };
    expect(kept.status).toBe("new");
  });

  it("rejects an invalid resolution", async () => {
    const id = seedDupe();
    const res = await request(app)
      .post(`/api/extraction-items/${id}/resolve-dedupe`)
      .send({ resolution: "nope" });
    expect(res.status).toBe(400);
  });

  it("409s when there is no dedupe collision", async () => {
    const id = seedItem(sourceId, { term: "unique-term" });
    await request(app)
      .patch(`/api/extraction-items/${id}`)
      .send({ decision: "learn" });
    const res = await request(app)
      .post(`/api/extraction-items/${id}/resolve-dedupe`)
      .send({ resolution: "merge" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("not_dedupe");
  });
});
