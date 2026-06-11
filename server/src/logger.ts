import type { DB } from "./db/db.js";

type Level = "info" | "warn" | "error";
type Fields = Record<string, unknown>;
export type ErrorScope = "request" | "job" | "llm" | "transcription";

const ERROR_LOG_CAP = 1000;

/**
 * Tiny structured logger: one JSON object per line to stdout.
 * Once a DB is attached, `error()` additionally inserts into the `error_log`
 * table (created by migration 001, capped at ~1000 rows).
 */
class Logger {
  private db: DB | null = null;

  attachDb(db: DB): void {
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

  error(
    scope: ErrorScope,
    msg: string,
    fields?: Fields & { err?: unknown },
  ): void {
    const { err, ...rest } = fields ?? {};
    const stack =
      err instanceof Error
        ? err.stack
        : err !== undefined
          ? String(err)
          : undefined;
    this.write("error", msg, { scope, ...rest, ...(stack ? { stack } : {}) });
    if (this.db) {
      try {
        this.db
          .prepare(
            "INSERT INTO error_log (ts, scope, message, detail) VALUES (?, ?, ?, ?)",
          )
          .run(
            new Date().toISOString(),
            scope,
            msg,
            JSON.stringify({ ...rest, ...(stack ? { stack } : {}) }),
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
