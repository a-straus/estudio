import { logger } from "../logger.js";
import { nowIso, type DB } from "../db/db.js";

export type JobHandler = (payload: unknown) => unknown | Promise<unknown>;

interface HandlerEntry {
  fn: JobHandler;
  maxAttempts: number;
}

interface JobRow {
  id: number;
  type: string;
  payload: string;
  status: string;
  attempts: number;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_BACKOFF_BASE_MS = 1000;

/**
 * Enqueue API + in-process poller over the `job` table. Claims queued jobs,
 * runs the registered handler, retries with exponential backoff up to the
 * handler's attempts limit, and persists error + stack on failure. Backoff
 * timing is in-memory only; after a restart, due jobs retry immediately.
 */
export class JobQueue {
  private handlers = new Map<string, HandlerEntry>();
  private notBefore = new Map<number, number>();
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;
  private readonly pollIntervalMs: number;
  private readonly backoffBaseMs: number;

  constructor(
    private db: DB,
    opts: { pollIntervalMs?: number; backoffBaseMs?: number } = {},
  ) {
    this.pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.backoffBaseMs = opts.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;
  }

  register(
    type: string,
    fn: JobHandler,
    opts: { maxAttempts?: number } = {},
  ): void {
    this.handlers.set(type, {
      fn,
      maxAttempts: opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    });
  }

  enqueue(type: string, payload: unknown): number {
    const now = nowIso();
    const result = this.db
      .prepare(
        "INSERT INTO job (type, payload, status, attempts, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
      )
      .run(type, JSON.stringify(payload ?? null), "queued", now, now);
    return Number(result.lastInsertRowid);
  }

  /** On boot: jobs left `running` by a previous process revert to `queued`. */
  recoverRunningJobs(): number {
    const result = this.db
      .prepare(
        "UPDATE job SET status = 'queued', updated_at = ? WHERE status = 'running'",
      )
      .run(nowIso());
    return result.changes;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.pollIntervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Claim and run at most one due queued job. Returns true if a job ran. */
  async tick(): Promise<boolean> {
    if (this.ticking) return false;
    this.ticking = true;
    try {
      const job = this.claimNext();
      if (!job) return false;
      await this.run(job);
      return true;
    } finally {
      this.ticking = false;
    }
  }

  private claimNext(): JobRow | null {
    const now = Date.now();
    const candidates = this.db
      .prepare(
        "SELECT id, type, payload, status, attempts FROM job WHERE status = 'queued' ORDER BY id",
      )
      .all() as JobRow[];
    const job = candidates.find((j) => (this.notBefore.get(j.id) ?? 0) <= now);
    if (!job) return null;
    this.db
      .prepare(
        "UPDATE job SET status = 'running', attempts = attempts + 1, updated_at = ? WHERE id = ?",
      )
      .run(nowIso(), job.id);
    job.attempts += 1;
    return job;
  }

  private async run(job: JobRow): Promise<void> {
    const entry = this.handlers.get(job.type);
    try {
      if (!entry)
        throw new Error(`No handler registered for job type "${job.type}"`);
      const result = await entry.fn(JSON.parse(job.payload));
      this.db
        .prepare(
          "UPDATE job SET status = 'done', progress = ?, updated_at = ? WHERE id = ?",
        )
        .run(
          result === undefined ? null : JSON.stringify(result),
          nowIso(),
          job.id,
        );
      this.notBefore.delete(job.id);
      logger.info("job done", {
        jobId: job.id,
        type: job.type,
        attempts: job.attempts,
      });
    } catch (err) {
      const maxAttempts = entry?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
      const errorText =
        err instanceof Error ? (err.stack ?? err.message) : String(err);
      const failed = job.attempts >= maxAttempts;
      this.db
        .prepare(
          "UPDATE job SET status = ?, error = ?, updated_at = ? WHERE id = ?",
        )
        .run(failed ? "failed" : "queued", errorText, nowIso(), job.id);
      if (failed) {
        this.notBefore.delete(job.id);
        logger.error("job failed permanently", {
          jobId: job.id,
          type: job.type,
          attempts: job.attempts,
          err,
        });
      } else {
        const delay = this.backoffBaseMs * 2 ** (job.attempts - 1);
        this.notBefore.set(job.id, Date.now() + delay);
        logger.warn("job attempt failed, will retry", {
          jobId: job.id,
          type: job.type,
          attempts: job.attempts,
          retryInMs: delay,
        });
      }
    }
  }
}
