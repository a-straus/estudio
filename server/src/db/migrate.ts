import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../logger.js";
import { nowIso, type DB } from "./db.js";

// Resolves to src/db/migrations in dev/tests and dist/db/migrations in the
// build (the build step copies the .sql files alongside the compiled runner).
export const defaultMigrationsDir = fileURLToPath(
  new URL("./migrations/", import.meta.url),
);

/**
 * Apply pending numbered .sql migrations in order, recording each in the
 * `migration` table. A timestamped backup of the DB is copied into
 * DATA_DIR/backups/ before anything is applied. Returns applied file names.
 */
export function runMigrations(
  db: DB,
  dataDir: string,
  migrationsDir: string = defaultMigrationsDir,
): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS migration (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL
  )`);

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const applied = new Set(
    (db.prepare("SELECT name FROM migration").all() as { name: string }[]).map(
      (r) => r.name,
    ),
  );
  const pending = files.filter((f) => !applied.has(f));
  if (pending.length === 0) return [];

  const backupPath = backupDb(db, dataDir);
  logger.info("db backup written before migration run", { backupPath });

  const record = db.prepare(
    "INSERT INTO migration (name, applied_at) VALUES (?, ?)",
  );
  for (const file of pending) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    db.transaction(() => {
      db.exec(sql);
      record.run(file, nowIso());
    })();
    logger.info("migration applied", { migration: file });
  }
  return pending;
}

function backupDb(db: DB, dataDir: string): string {
  const backupsDir = path.join(dataDir, "backups");
  fs.mkdirSync(backupsDir, { recursive: true });
  const stamp = nowIso().replace(/[:.]/g, "-");
  const dest = path.join(backupsDir, `app-${stamp}.db`);
  // VACUUM INTO writes a consistent snapshot even in WAL mode.
  db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
  return dest;
}
