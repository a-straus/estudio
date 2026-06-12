-- 003_note_mixed_phase2.sql — orchestrator-approved schema-gate batch:
--   1. NEW TABLE note — owner self-note attached to an answered quiz question.
--      Word/topic are reached by JOIN through quiz_question; never duplicated here.
--   2. quiz_attempt.style CHECK gains 'mixed' (a mixed-style quiz session and
--      lesson quizzes store 'mixed' instead of a fabricated concrete style).
--      SQLite cannot ALTER a CHECK, so rebuild the table — same pattern as 002.
--   3. Phase-2 tables per ARCHITECTURE.md: transcription_call, chat_message and
--      suggestion already exist in 001_init.sql exactly as specified, so they
--      need nothing here. chat_thread exists but with nullable page_context /
--      title where the spec requires NOT NULL — rebuild it to spec (the table
--      has no writers yet; any rows are copied as-is, and a NULL would abort
--      and roll back the migration rather than fabricate data).

CREATE TABLE note (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quiz_question_id INTEGER NOT NULL REFERENCES quiz_question (id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- The runner wraps each migration in a transaction (where PRAGMA foreign_keys
-- is a no-op), so FK checks are deferred to COMMIT; rebuilding under the same
-- name (copy out, drop, recreate, copy back) clears the deferred-violation
-- counter for rows that reference the rebuilt table. See 002 for the original
-- rationale.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE quiz_attempt_migrate (
  id INTEGER PRIMARY KEY,
  deck_id INTEGER,
  topic_id INTEGER,
  style TEXT NOT NULL,
  direction TEXT,
  answers TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO quiz_attempt_migrate (
  id, deck_id, topic_id, style, direction, answers, created_at, updated_at
)
SELECT
  id, deck_id, topic_id, style, direction, answers, created_at, updated_at
FROM quiz_attempt;

DROP TABLE quiz_attempt;

-- Identical to 001_init.sql plus 'mixed' in the style CHECK.
CREATE TABLE quiz_attempt (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deck_id INTEGER REFERENCES deck (id),
  topic_id INTEGER REFERENCES grammar_topic (id),
  style TEXT NOT NULL CHECK (style IN ('def_match', 'cloze', 'fill_in', 'conjugation', 'free_text', 'mixed')),
  direction TEXT CHECK (direction IN ('w2d', 'd2w')),
  answers TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

INSERT INTO quiz_attempt (
  id, deck_id, topic_id, style, direction, answers, created_at, updated_at
)
SELECT
  id, deck_id, topic_id, style, direction, answers, created_at, updated_at
FROM quiz_attempt_migrate;

DROP TABLE quiz_attempt_migrate;

CREATE TABLE chat_thread_migrate (
  id INTEGER PRIMARY KEY,
  page_context TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO chat_thread_migrate (id, page_context, title, created_at, updated_at)
SELECT id, page_context, title, created_at, updated_at
FROM chat_thread;

DROP TABLE chat_thread;

-- ARCHITECTURE.md spec: page_context (JSON ref: kind + id) and title, both required.
CREATE TABLE chat_thread (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_context TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

INSERT INTO chat_thread (id, page_context, title, created_at, updated_at)
SELECT id, page_context, title, created_at, updated_at
FROM chat_thread_migrate;

DROP TABLE chat_thread_migrate;
