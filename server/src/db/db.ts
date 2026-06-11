import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export type DB = InstanceType<typeof Database>;

/** Open (creating if needed) the app database under dataDir, in WAL mode. */
export function openDb(dataDir: string): DB {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, "app.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

export function nowIso(): string {
  return new Date().toISOString();
}
