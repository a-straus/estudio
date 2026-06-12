import type { DB } from "../db/db.js";
import type { LlmService } from "../llm/service.js";
import type { TranscriptionService } from "../transcription/service.js";
import type { JobQueue } from "./queue.js";
import {
  JOB_TYPE_LESSON_AUDIO_INGESTION,
  runLessonAudioIngestion,
  type LessonAudioIngestionPayload,
} from "./lessonAudioIngestion.js";
import {
  JOB_TYPE_TEXT_INGESTION,
  runTextIngestion,
  type TextIngestionPayload,
} from "./textIngestion.js";
import { JOB_TYPE_GRAMMAR_SEED, runGrammarSeed } from "./grammarSeed.js";
import {
  JOB_TYPE_QUIZ_GEN,
  runQuizGen,
  type QuizGenPayload,
} from "./quizGen.js";
import {
  JOB_TYPE_LESSON_GEN,
  runLessonGen,
  type LessonGenPayload,
} from "./lessonGen.js";
export { registerBackupHandler } from "./backup.js";

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

/** Register the grammar_seed job handler. */
export function registerGrammarSeedHandler(
  queue: JobQueue,
  db: DB,
  llm: LlmService,
): void {
  queue.register(JOB_TYPE_GRAMMAR_SEED, () => runGrammarSeed(db, llm));
}

/** Register the quiz_gen job handler. */
export function registerQuizGenHandler(
  queue: JobQueue,
  db: DB,
  llm: LlmService,
): void {
  queue.register(JOB_TYPE_QUIZ_GEN, (payload) =>
    runQuizGen(db, llm, payload as QuizGenPayload),
  );
}

/** Register the lesson_audio_ingestion job handler. */
export function registerLessonAudioIngestionHandler(
  queue: JobQueue,
  db: DB,
  llm: LlmService,
  transcription: TranscriptionService,
): void {
  queue.register(JOB_TYPE_LESSON_AUDIO_INGESTION, (payload) =>
    runLessonAudioIngestion(
      db,
      llm,
      transcription,
      payload as LessonAudioIngestionPayload,
    ),
  );
}

/** Register the lesson_gen job handler. */
export function registerLessonGenHandler(
  queue: JobQueue,
  db: DB,
  llm: LlmService,
): void {
  queue.register(JOB_TYPE_LESSON_GEN, (payload) =>
    runLessonGen(db, llm, payload as LessonGenPayload),
  );
}
