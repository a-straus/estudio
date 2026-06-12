// Lesson-audio (Phase 2) API request/response + browse DTOs.
import type { SourceView } from "./types.js";

/**
 * Response body of POST /api/sources/audio. Mirrors PdfUploadResponse but
 * carries the upfront Whisper transcription cost estimate instead of a page
 * count — audio has no page concept.
 */
export interface AudioUploadResponse {
  source: SourceView;
  jobId: number;
  /** Upfront Whisper estimate (USD) for transcribing the recording. */
  costEstimateUsd: number;
}

/** The four lesson_insight kinds — mirrors the lesson_insight.type CHECK. */
export type LessonInsightType =
  | "flagged_word"
  | "correction"
  | "struggle_sentence"
  | "topic_covered";

/** payload of a flagged_word insight: vocab the learner did not know. */
export interface FlaggedWordPayload {
  term: string;
  lemma: string | null;
  partOfSpeech: string | null;
  definitionEs: string | null;
  definitionEn: string | null;
}

/** payload of a correction insight: a tutor correction of the learner. */
export interface CorrectionPayload {
  said: string;
  corrected: string;
  note: string | null;
}

/** payload of a struggle_sentence insight: a sentence the learner struggled with. */
export interface StruggleSentencePayload {
  sentence: string;
  note: string | null;
}

/** payload of a topic_covered insight: a grammar topic the lesson touched. */
export interface TopicCoveredPayload {
  name: string;
}

export type LessonInsightPayload =
  | FlaggedWordPayload
  | CorrectionPayload
  | StruggleSentencePayload
  | TopicCoveredPayload;

/** Camel-cased view of a lesson_insight row. */
export interface LessonInsightView {
  id: number;
  sourceId: number;
  type: LessonInsightType;
  payload: LessonInsightPayload;
  wordId: number | null;
  topicId: number | null;
  createdAt: string;
  updatedAt: string;
  /** Word status for flagged_word insights: 'new','learning','mature','known','suspended', or null when wordId is null. */
  wordStatus?: string | null;
}

/**
 * A recorded lesson = its `lesson_audio` source plus its insights grouped by
 * type — the shape the future browse UI renders per recording. (Named to avoid
 * collision with grammar-api's LessonView, which is a generated grammar lesson.)
 */
export interface LessonRecordingView {
  source: SourceView;
  insights: {
    flaggedWords: LessonInsightView[];
    corrections: LessonInsightView[];
    struggleSentences: LessonInsightView[];
    topicsCovered: LessonInsightView[];
  };
}

/**
 * Per-topic "seen in N lessons" count, DERIVED at read time from
 * lesson_insight(type='topic_covered') — never a stored counter.
 */
export interface TopicLessonCount {
  topicId: number;
  seenInLessons: number;
}

/** Summary counts + job state for one lesson in the GET /api/lessons list. */
export interface LessonListItem {
  sourceId: number;
  title: string | null;
  createdAt: string;
  /** Null — duration is not stored in the DB at write time. */
  durationMinutes: number | null;
  /** Latest job status: queued/running/done/failed/cancelled, or null if no job found. */
  jobStatus: string | null;
  /** Phase from job.progress JSON: transcribing/analyzing/done, or null. */
  jobPhase: string | null;
  /** Job error string if failed, null otherwise. */
  jobError: string | null;
  flaggedWordCount: number;
  correctionCount: number;
  struggleSentenceCount: number;
  topicCount: number;
}
