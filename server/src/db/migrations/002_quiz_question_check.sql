-- 002_quiz_question_check.sql — ARCHITECTURE requires exactly one of
-- word_id/topic_id on quiz_question. SQLite cannot ALTER TABLE ADD CHECK, so
-- rebuild the table with the constraint. The runner wraps each migration in a
-- transaction (where PRAGMA foreign_keys is a no-op), so FK checks are
-- deferred to COMMIT instead; the rebuild recreates quiz_question under its
-- own name (copy out, drop, recreate, copy back) rather than via RENAME,
-- because re-inserting the parent keys is what clears the deferred-violation
-- counter for review_log rows that reference quiz_question.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE quiz_question_migrate (
  id INTEGER PRIMARY KEY,
  word_id INTEGER,
  topic_id INTEGER,
  lesson_id INTEGER,
  style TEXT NOT NULL,
  payload TEXT NOT NULL,
  explanation TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  flagged INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO quiz_question_migrate (
  id, word_id, topic_id, lesson_id, style, payload, explanation,
  prompt_version, flagged, created_at, updated_at
)
SELECT
  id, word_id, topic_id, lesson_id, style, payload, explanation,
  prompt_version, flagged, created_at, updated_at
FROM quiz_question;

DROP TABLE quiz_question;

-- Identical to 001_init.sql plus the exactly-one-of CHECK.
CREATE TABLE quiz_question (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word_id INTEGER REFERENCES word (id) ON DELETE SET NULL,
  topic_id INTEGER REFERENCES grammar_topic (id),
  lesson_id INTEGER REFERENCES lesson (id),
  style TEXT NOT NULL CHECK (style IN ('def_match', 'cloze', 'fill_in', 'conjugation', 'free_text')),
  payload TEXT NOT NULL,
  explanation TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  flagged INTEGER NOT NULL DEFAULT 0 CHECK (flagged IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  CHECK ((word_id IS NULL) <> (topic_id IS NULL))
);

INSERT INTO quiz_question (
  id, word_id, topic_id, lesson_id, style, payload, explanation,
  prompt_version, flagged, created_at, updated_at
)
SELECT
  id, word_id, topic_id, lesson_id, style, payload, explanation,
  prompt_version, flagged, created_at, updated_at
FROM quiz_question_migrate;

DROP TABLE quiz_question_migrate;
