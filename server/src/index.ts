import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { openDb } from "./db/db.js";
import { runMigrations } from "./db/migrate.js";
import { logger } from "./logger.js";
import { JobQueue } from "./jobs/queue.js";
import {
  registerBackupHandler,
  registerGrammarSeedHandler,
  registerLessonAudioIngestionHandler,
  registerLessonGenHandler,
  registerQuizGenHandler,
  registerTextIngestionHandler,
} from "./jobs/handlers.js";
import { registerPdfIngestionHandler } from "./jobs/pdfIngestion.js";
import { TranscriptionService } from "./transcription/service.js";
import { createOpenAiProvider } from "./transcription/openai.js";
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

const transcription = new TranscriptionService(db, {
  openai: createOpenAiProvider(config.openaiApiKey),
});

const queue = new JobQueue(db);
registerTextIngestionHandler(queue, db, llm);
registerPdfIngestionHandler(queue, db, llm);
registerGrammarSeedHandler(queue, db, llm);
registerQuizGenHandler(queue, db, llm);
registerLessonGenHandler(queue, db, llm);
registerLessonAudioIngestionHandler(queue, db, llm, transcription);
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

if (config.nodeEnv === "production") {
  const webDistIndex = fileURLToPath(
    new URL("../../web/dist/index.html", import.meta.url),
  );
  if (!fs.existsSync(webDistIndex)) {
    logger.warn(
      "web build not found — run `npm run build` before starting the server in production",
      {},
    );
  }
}

const app = createApp(db, {
  serveWeb: config.nodeEnv === "production",
  queue,
  dataDir: config.dataDir,
  llm,
  transcription,
});
app.listen(config.port, () => {
  logger.info("server listening", {
    port: config.port,
    dataDir: config.dataDir,
    env: config.nodeEnv,
  });
  if (config.nodeEnv === "production") {
    logger.info("open the app at", { url: `http://localhost:${config.port}` });
  }
});
