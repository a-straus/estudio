import { config } from "./config.js";
import { openDb } from "./db/db.js";
import { runMigrations } from "./db/migrate.js";
import { logger } from "./logger.js";
import { JobQueue } from "./jobs/queue.js";
import {
  registerBackupHandler,
  registerGrammarSeedHandler,
  registerTextIngestionHandler,
} from "./jobs/handlers.js";
import { registerPdfIngestionHandler } from "./jobs/pdfIngestion.js";
import {
  BACKUP_INTERVAL_MS,
  enqueueBackupIfDue,
  JOB_TYPE_BACKUP,
} from "./jobs/backup.js";
import { createAnthropicProvider } from "./llm/anthropic.js";
import { LlmService } from "./llm/service.js";
import { createApp } from "./app.js";

const db = openDb(config.dataDir);
runMigrations(db, config.dataDir);
logger.attachDb(db);

const llm = new LlmService(db, {
  anthropic: createAnthropicProvider(config.anthropicApiKey),
});

const queue = new JobQueue(db);
registerTextIngestionHandler(queue, db, llm);
registerPdfIngestionHandler(queue, db, llm);
registerGrammarSeedHandler(queue, db, llm);
registerBackupHandler(queue, db, config.dataDir);
const reverted = queue.recoverRunningJobs();
if (reverted > 0)
  logger.info("reverted running jobs to queued on boot", { count: reverted });
queue.start();

// Enqueue a backup on boot if none has run in the last 24h, then daily. The
// queue gives persistence/retry; this just decides when to enqueue.
const bootBackupId = enqueueBackupIfDue(db, queue);
if (bootBackupId !== null)
  logger.info("enqueued boot backup", { jobId: bootBackupId });
const backupTimer = setInterval(() => {
  const jobId = queue.enqueue(JOB_TYPE_BACKUP, {});
  logger.info("enqueued daily backup", { jobId });
}, BACKUP_INTERVAL_MS);
backupTimer.unref();

const app = createApp(db, {
  serveWeb: config.nodeEnv === "production",
  queue,
  dataDir: config.dataDir,
});
app.listen(config.port, () => {
  logger.info("server listening", {
    port: config.port,
    dataDir: config.dataDir,
    env: config.nodeEnv,
  });
});
