import type { DB } from "../db/db.js";
import type { LlmService } from "../llm/service.js";
import type { JobQueue } from "./queue.js";
import {
  JOB_TYPE_TEXT_INGESTION,
  runTextIngestion,
  type TextIngestionPayload,
} from "./textIngestion.js";

/** Register the text_ingestion job handler. */
export function registerTextIngestionHandler(
  queue: JobQueue,
  db: DB,
  llm: LlmService,
): void {
  queue.register(JOB_TYPE_TEXT_INGESTION, (payload) =>
    runTextIngestion(db, llm, payload as TextIngestionPayload),
  );
}
