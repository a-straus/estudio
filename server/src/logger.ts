import type { DB } from "./db/db.js";

type Level = "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const ERROR_LOG_CAP = 1000;

/**
 * Tiny structured logger: one JSON object per line to stdout.
 * Once a DB is attached, `error()` additionally inserts into the `error_log`
 * table (infrastructure table, capped at ~1000 rows).
 */
class Logger {
  private db: DB | null = null;

  attachDb(db: DB): void {
    db.exec(`CREATE TABLE IF NOT EXISTS error_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      message TEXT NOT NULL,
      stack TEXT,
      context TEXT
    )`);
    this.db = db;
  }

  detachDb(): void {
    this.db = null;
  }

  info(msg: string, fields?: Fields): void {
    this.write("info", msg, fields);
  }

  warn(msg: string, fields?: Fields): void {
    this.write("warn", msg, fields);
  }

  error(msg: string, fields?: Fields & { err?: unknown }): void {
    const { err, ...rest } = fields ?? {};
    const stack =
      err instanceof Error
        ? err.stack
        : err !== undefined
          ? String(err)
          : undefined;
    this.write("error", msg, { ...rest, ...(stack ? { stack } : {}) });
    if (this.db) {
      try {
        this.db
          .prepare(
            "INSERT INTO error_log (ts, message, stack, context) VALUES (?, ?, ?, ?)",
          )
          .run(
            new Date().toISOString(),
            msg,
            stack ?? null,
            JSON.stringify(rest),
          );
        this.db
          .prepare(
            "DELETE FROM error_log WHERE id NOT IN (SELECT id FROM error_log ORDER BY id DESC LIMIT ?)",
          )
          .run(ERROR_LOG_CAP);
      } catch (dbErr) {
        // Never let error logging itself crash the process; stdout still has the line.
        this.write("warn", "failed to persist error_log row", {
          stack: dbErr instanceof Error ? dbErr.stack : String(dbErr),
        });
      }
    }
  }

  private write(level: Level, msg: string, fields?: Fields): void {
    process.stdout.write(
      JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields }) +
        "\n",
    );
  }
}

export const logger = new Logger();
