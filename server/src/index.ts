import { config } from "./config.js";
import { openDb } from "./db/db.js";
import { runMigrations } from "./db/migrate.js";
import { logger } from "./logger.js";
import { JobQueue } from "./jobs/queue.js";
import { registerDemoHandler } from "./jobs/handlers.js";
import { createApp } from "./app.js";

const db = openDb(config.dataDir);
runMigrations(db, config.dataDir);
logger.attachDb(db);

const queue = new JobQueue(db);
registerDemoHandler(queue);
const reverted = queue.recoverRunningJobs();
if (reverted > 0)
  logger.info("reverted running jobs to queued on boot", { count: reverted });
queue.start();

const app = createApp(db, { serveWeb: config.nodeEnv === "production" });
app.listen(config.port, () => {
  logger.info("server listening", {
    port: config.port,
    dataDir: config.dataDir,
    env: config.nodeEnv,
  });
});
