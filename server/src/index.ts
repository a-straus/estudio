import { config } from "./config.js";
import { openDb } from "./db/db.js";
import { runMigrations } from "./db/migrate.js";
import { logger } from "./logger.js";
import { JobQueue } from "./jobs/queue.js";
import { registerDemoHandler } from "./jobs/handlers.js";
import { registerPdfIngestionHandler } from "./jobs/pdfIngestion.js";
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
registerDemoHandler(queue);
registerPdfIngestionHandler(queue, db, llm);
const reverted = queue.recoverRunningJobs();
if (reverted > 0)
  logger.info("reverted running jobs to queued on boot", { count: reverted });
queue.start();

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
