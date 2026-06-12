import type {
  LessonInsightView,
  LessonListItem,
  LessonRecordingView,
} from "@estudio/shared";
import type { DB } from "./db.js";
import { getSource } from "./queries.js";

const JOB_TYPE = "lesson_audio_ingestion";

interface SourceRowDb {
  id: number;
  title: string | null;
  created_at: string;
  duration_minutes: number | null;
}

interface InsightRowDb {
  id: number;
  source_id: number;
  type: string;
  payload: string;
  word_id: number | null;
  topic_id: number | null;
  created_at: string;
  updated_at: string;
  word_status: string | null;
}

interface JobInfoDb {
  job_status: string | null;
  job_phase: string | null;
  job_error: string | null;
}

interface CountRowDb {
  type: string;
  cnt: number;
}

function parseInsight(r: InsightRowDb): LessonInsightView {
  return {
    id: r.id,
    sourceId: r.source_id,
    type: r.type as LessonInsightView["type"],
    payload: JSON.parse(r.payload) as LessonInsightView["payload"],
    wordId: r.word_id,
    topicId: r.topic_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    wordStatus: r.word_status ?? null,
  };
}

/** Newest-first list of lesson_audio sources with summary counts and job state. */
export function listLessons(db: DB): LessonListItem[] {
  const sources = db
    .prepare(
      `SELECT id, title, created_at, duration_minutes
         FROM source
        WHERE type = 'lesson_audio'
        ORDER BY id DESC`,
    )
    .all() as SourceRowDb[];

  if (sources.length === 0) return [];

  return sources.map((s) => {
    const jobInfo = db
      .prepare(
        `SELECT j.status AS job_status,
                json_extract(j.progress, '$.phase') AS job_phase,
                j.error AS job_error
           FROM job j
          WHERE j.type = ?
            AND json_extract(j.payload, '$.sourceId') = ?
          ORDER BY j.id DESC
          LIMIT 1`,
      )
      .get(JOB_TYPE, s.id) as JobInfoDb | undefined;

    const counts = db
      .prepare(
        `SELECT type, COUNT(*) AS cnt
           FROM lesson_insight
          WHERE source_id = ?
          GROUP BY type`,
      )
      .all(s.id) as CountRowDb[];

    const byType: Record<string, number> = {};
    for (const row of counts) byType[row.type] = row.cnt;

    return {
      sourceId: s.id,
      title: s.title,
      createdAt: s.created_at,
      durationMinutes: s.duration_minutes ?? null,
      jobStatus: jobInfo?.job_status ?? null,
      jobPhase: jobInfo?.job_phase ?? null,
      jobError: jobInfo?.job_error ?? null,
      flaggedWordCount: byType["flagged_word"] ?? 0,
      correctionCount: byType["correction"] ?? 0,
      struggleSentenceCount: byType["struggle_sentence"] ?? 0,
      topicCount: byType["topic_covered"] ?? 0,
    };
  });
}

/**
 * Full detail for one lesson_audio source: source row + insights grouped by type.
 * Returns null if the source doesn't exist or isn't a lesson_audio.
 */
export function getLessonDetail(
  db: DB,
  sourceId: number,
): LessonRecordingView | null {
  const source = getSource(db, sourceId);
  if (!source || source.type !== "lesson_audio") return null;

  const rows = db
    .prepare(
      `SELECT li.id, li.source_id, li.type, li.payload, li.word_id, li.topic_id,
              li.created_at, li.updated_at,
              w.status AS word_status
         FROM lesson_insight li
         LEFT JOIN word w ON w.id = li.word_id
        WHERE li.source_id = ?
        ORDER BY li.id ASC`,
    )
    .all(sourceId) as InsightRowDb[];

  const flaggedWords: LessonInsightView[] = [];
  const corrections: LessonInsightView[] = [];
  const struggleSentences: LessonInsightView[] = [];
  const topicsCovered: LessonInsightView[] = [];

  for (const r of rows) {
    const v = parseInsight(r);
    if (r.type === "flagged_word") flaggedWords.push(v);
    else if (r.type === "correction") corrections.push(v);
    else if (r.type === "struggle_sentence") struggleSentences.push(v);
    else if (r.type === "topic_covered") topicsCovered.push(v);
  }

  return { source, insights: { flaggedWords, corrections, struggleSentences, topicsCovered } };
}
