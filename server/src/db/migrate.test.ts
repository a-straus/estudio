import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { openDb, type DB } from "./db.js";
import { runMigrations } from "./migrate.js";

const tmpDirs: string[] = [];
const dbs: DB[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "estudio-test-"));
  tmpDirs.push(dir);
  return dir;
}

function openTmpDb(dataDir: string): DB {
  const db = openDb(dataDir);
  dbs.push(db);
  return db;
}

afterEach(() => {
  for (const db of dbs.splice(0)) db.close();
  for (const dir of tmpDirs.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});

describe("runMigrations with the real migrations", () => {
  it("creates the full schema and seeds the two decks", () => {
    const dataDir = makeTmpDir();
    const db = openTmpDb(dataDir);
    const applied = runMigrations(db, dataDir);

    expect(applied).toEqual(["001_init.sql"]);
    const tables = (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all() as { name: string }[]
    ).map((r) => r.name);
    for (const table of [
      "deck",
      "source",
      "word",
      "card_state",
      "review_log",
      "grammar_category",
      "grammar_topic",
      "lesson",
      "quiz_question",
      "quiz_attempt",
      "lesson_insight",
      "chat_thread",
      "chat_message",
      "suggestion",
      "job",
      "llm_call",
      "transcription_call",
      "setting",
      "migration",
    ]) {
      expect(tables).toContain(table);
    }

    const decks = db
      .prepare("SELECT name, language FROM deck ORDER BY id")
      .all();
    expect(decks).toEqual([
      { name: "Spanish", language: "es" },
      { name: "English Vocabulary", language: "en" },
    ]);

    expect(db.pragma("journal_mode", { simple: true })).toBe("wal");
  });

  it("enforces UNIQUE(term, language) on word", () => {
    const dataDir = makeTmpDir();
    const db = openTmpDb(dataDir);
    runMigrations(db, dataDir);
    const insert = db.prepare(
      "INSERT INTO word (term, term_normalized, language, status, deck_id) VALUES (?, ?, ?, 'new', 1)",
    );
    insert.run("más", "mas", "es");
    expect(() => insert.run("más", "mas", "es")).toThrow(/UNIQUE/);
    // Same term in the other language is fine.
    insert.run("más", "mas", "en");
  });
});

describe("runMigrations with fixture migrations", () => {
  function writeFixtures(dir: string, files: Record<string, string>): string {
    const migrationsDir = path.join(dir, "migrations");
    fs.mkdirSync(migrationsDir, { recursive: true });
    for (const [name, sql] of Object.entries(files)) {
      fs.writeFileSync(path.join(migrationsDir, name), sql);
    }
    return migrationsDir;
  }

  it("applies migrations in numbered order and records them", () => {
    const dataDir = makeTmpDir();
    const db = openTmpDb(dataDir);
    // 002 depends on the table 001 creates — out-of-order application would throw.
    const migrationsDir = writeFixtures(dataDir, {
      "002_insert.sql": "INSERT INTO t (v) VALUES ('from-002');",
      "001_create.sql": "CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT);",
    });

    const applied = runMigrations(db, dataDir, migrationsDir);
    expect(applied).toEqual(["001_create.sql", "002_insert.sql"]);

    const recorded = db
      .prepare("SELECT name, applied_at FROM migration ORDER BY id")
      .all() as {
      name: string;
      applied_at: string;
    }[];
    expect(recorded.map((r) => r.name)).toEqual([
      "001_create.sql",
      "002_insert.sql",
    ]);
    for (const r of recorded)
      expect(r.applied_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // Re-running is a no-op.
    expect(runMigrations(db, dataDir, migrationsDir)).toEqual([]);
  });

  it("writes a timestamped backup into DATA_DIR/backups before applying", () => {
    const dataDir = makeTmpDir();
    const db = openTmpDb(dataDir);
    const migrationsDir = writeFixtures(dataDir, {
      "001_create.sql": "CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT);",
    });

    runMigrations(db, dataDir, migrationsDir);
    const backupsDir = path.join(dataDir, "backups");
    let backups = fs.readdirSync(backupsDir);
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatch(/^app-.*\.db$/);

    // The backup is a snapshot taken BEFORE the pending migration: no table t.
    const snapshot = new Database(path.join(backupsDir, backups[0]!));
    const tablesInBackup = (
      snapshot
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all() as {
        name: string;
      }[]
    ).map((r) => r.name);
    snapshot.close();
    expect(tablesInBackup).not.toContain("t");

    // A run with nothing pending takes no backup; a run with a new pending file does.
    runMigrations(db, dataDir, migrationsDir);
    expect(fs.readdirSync(backupsDir)).toHaveLength(1);
    fs.writeFileSync(
      path.join(migrationsDir, "002_more.sql"),
      "INSERT INTO t (v) VALUES ('x');",
    );
    runMigrations(db, dataDir, migrationsDir);
    backups = fs.readdirSync(backupsDir);
    expect(backups).toHaveLength(2);
  });
});
