// Read-only aggregate queries powering GET /api/progress. No writes, no DDL.

import type {
  ProgressCoverageRow,
  ProgressMasteryTopic,
  ProgressSummary,
} from "@estudio/shared";
import { nowIso, type DB } from "./db.js";
import { getSourceCoverage } from "./queries.js";

function getCounts(db: DB) {
  const rows = db
    .prepare(
      `SELECT status, COUNT(*) AS cnt FROM word
       WHERE status IN ('new','learning','mature')
       GROUP BY status`,
    )
    .all() as { status: string; cnt: number }[];

  const byStatus = Object.fromEntries(rows.map((r) => [r.status, r.cnt]));
  return {
    new: byStatus["new"] ?? 0,
    learning: byStatus["learning"] ?? 0,
    mature: byStatus["mature"] ?? 0,
  };
}

function getDueForecast(db: DB, today: string) {
  // Generate 14 calendar days starting today; left-join with card_state counts.
  // substr(due_at, 1, 10) extracts "YYYY-MM-DD" from any ISO timestamp.
  const rows = db
    .prepare(
      `WITH RECURSIVE
         days(d) AS (
           SELECT ?
           UNION ALL
           SELECT date(d, '+1 day') FROM days WHERE d < date(?, '+13 days')
         ),
         forecast(day, cnt) AS (
           SELECT substr(cs.due_at, 1, 10) AS day, COUNT(*) AS cnt
           FROM card_state cs
           WHERE substr(cs.due_at, 1, 10) BETWEEN ? AND date(?, '+13 days')
           GROUP BY substr(cs.due_at, 1, 10)
         )
       SELECT d.d AS date, COALESCE(f.cnt, 0) AS count
       FROM days d
       LEFT JOIN forecast f ON f.day = d.d
       ORDER BY d.d`,
    )
    .all(today, today, today, today) as { date: string; count: number }[];

  return rows;
}

function getQuizAccuracy(db: DB) {
  const rows = db
    .prepare(
      `SELECT answers FROM quiz_attempt ORDER BY created_at DESC LIMIT 20`,
    )
    .all() as { answers: string }[];

  if (rows.length === 0) return { sessions: [], average: null };

  const sessions = rows.reverse().map((r) => {
    const answers = JSON.parse(r.answers) as { correct: boolean }[];
    if (answers.length === 0) return 0;
    const correct = answers.filter((a) => a.correct).length;
    return Math.round((correct / answers.length) * 100);
  });

  const average =
    sessions.length === 0
      ? null
      : Math.round(sessions.reduce((s, v) => s + v, 0) / sessions.length);

  return { sessions, average };
}

function getCoverage(db: DB): ProgressCoverageRow[] {
  const sources = db
    .prepare(`SELECT id, title, ref FROM source ORDER BY id DESC`)
    .all() as { id: number; title: string | null; ref: string | null }[];

  return sources.map((s) => {
    const cov = getSourceCoverage(db, s.id);
    const triagedPct =
      cov.total > 0 ? Math.round((cov.triaged / cov.total) * 100) : 0;
    return {
      sourceId: s.id,
      title: s.title ?? s.ref ?? `Source ${s.id}`,
      triagedPct,
      wordsKept: cov.kept,
    };
  });
}

function getGrammarMastery(db: DB): ProgressMasteryTopic[] {
  return db
    .prepare(
      `SELECT t.id AS topicId, t.name AS name, c.name AS category, t.mastery AS mastery
       FROM grammar_topic t
       JOIN grammar_category c ON c.id = t.category_id
       ORDER BY c.sort_order, c.id, t.id`,
    )
    .all() as ProgressMasteryTopic[];
}

export function getProgressSummary(db: DB): ProgressSummary {
  const today = nowIso().substring(0, 10); // "YYYY-MM-DD"
  return {
    counts: getCounts(db),
    dueForecast: getDueForecast(db, today),
    quizAccuracy: getQuizAccuracy(db),
    coverage: getCoverage(db),
    grammarMastery: getGrammarMastery(db),
  };
}
