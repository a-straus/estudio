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

/** Second-precision ISO-8601 UTC, matching the SQL DEFAULT strftime format. */
export function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}
