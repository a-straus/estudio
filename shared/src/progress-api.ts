export interface ProgressCounts {
  new: number;
  learning: number;
  mature: number;
}

export interface ProgressDayForecast {
  /** ISO date string YYYY-MM-DD. */
  date: string;
  count: number;
}

export interface ProgressQuizAccuracy {
  /** Per-session accuracy pct, oldest→newest, ≤20 entries. */
  sessions: number[];
  average: number | null;
}

export interface ProgressCoverageRow {
  sourceId: number;
  title: string;
  /** 0–100, rounded. */
  triagedPct: number;
  wordsKept: number;
}

export interface ProgressMasteryTopic {
  topicId: number;
  name: string;
  category: string;
  /** 0–1. */
  mastery: number;
}

export interface ProgressSummary {
  counts: ProgressCounts;
  /** 14 entries, one per calendar day starting today. */
  dueForecast: ProgressDayForecast[];
  quizAccuracy: ProgressQuizAccuracy;
  /** Newest source first. */
  coverage: ProgressCoverageRow[];
  grammarMastery: ProgressMasteryTopic[];
}
