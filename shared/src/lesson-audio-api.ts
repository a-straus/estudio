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
