-- 001_init.sql — every table from ARCHITECTURE.md "Entities & relationships".
-- snake_case, singular; id INTEGER PRIMARY KEY AUTOINCREMENT; created_at /
-- updated_at TEXT ISO-8601 UTC; enums as TEXT with CHECK constraints.

CREATE TABLE deck (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('es', 'en')),
  subject TEXT NOT NULL DEFAULT 'language',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE source (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (
    type IN ('pdf', 'text', 'lesson_audio', 'voice_question', 'gutenberg', 'mochi', 'manual', 'chat', 'suggestion')
  ),
  title TEXT,
  ref TEXT,
  stored_path TEXT,
  transcript TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE word (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  term TEXT NOT NULL,
  term_normalized TEXT NOT NULL,
  lemma TEXT,
  lemma_normalized TEXT,
  language TEXT NOT NULL CHECK (language IN ('es', 'en')),
  part_of_speech TEXT,
  definition_es TEXT,
  definition_en TEXT,
  example TEXT,
  level TEXT,
  status TEXT NOT NULL CHECK (status IN ('new', 'learning', 'mature', 'known', 'suspended')),
  deck_id INTEGER NOT NULL REFERENCES deck (id),
  source_id INTEGER REFERENCES source (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (term, language)
);

CREATE INDEX idx_word_term_normalized ON word (term_normalized);
CREATE INDEX idx_word_lemma_normalized ON word (lemma_normalized);

CREATE TABLE card_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word_id INTEGER NOT NULL UNIQUE REFERENCES word (id) ON DELETE CASCADE,
  ease REAL NOT NULL,
  interval_days REAL NOT NULL,
  due_at TEXT NOT NULL,
  reps INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Append-only: no code path may UPDATE or DELETE rows here.
CREATE TABLE review_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word_id INTEGER REFERENCES word (id) ON DELETE SET NULL,
  ts TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('w2d', 'd2w')),
  grade TEXT NOT NULL CHECK (grade IN ('fail', 'good', 'easy')),
  ease_after REAL NOT NULL,
  interval_after REAL NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('review', 'quiz', 'manual_demotion')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE grammar_category (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE grammar_topic (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES grammar_category (id),
  name TEXT NOT NULL,
  description TEXT,
  mastery REAL NOT NULL DEFAULT 0 CHECK (mastery >= 0 AND mastery <= 1),
  seen_in_lessons INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE lesson (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL REFERENCES grammar_topic (id),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE quiz_question (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word_id INTEGER REFERENCES word (id) ON DELETE SET NULL,
  topic_id INTEGER REFERENCES grammar_topic (id),
  style TEXT NOT NULL CHECK (style IN ('def_match', 'cloze', 'fill_in', 'conjugation', 'free_text')),
  payload TEXT NOT NULL,
  explanation TEXT NOT NULL,
  flagged INTEGER NOT NULL DEFAULT 0 CHECK (flagged IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE quiz_attempt (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deck_id INTEGER REFERENCES deck (id),
  topic_id INTEGER REFERENCES grammar_topic (id),
  style TEXT NOT NULL CHECK (style IN ('def_match', 'cloze', 'fill_in', 'conjugation', 'free_text')),
  direction TEXT CHECK (direction IN ('w2d', 'd2w')),
  answers TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE lesson_insight (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES source (id),
  type TEXT NOT NULL CHECK (type IN ('flagged_word', 'correction', 'struggle_sentence', 'topic_covered')),
  payload TEXT NOT NULL,
  word_id INTEGER REFERENCES word (id) ON DELETE SET NULL,
  topic_id INTEGER REFERENCES grammar_topic (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE chat_thread (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_context TEXT,
  title TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE chat_message (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER NOT NULL REFERENCES chat_thread (id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tool_calls TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE suggestion (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_type TEXT NOT NULL CHECK (item_type IN ('word', 'grammar_topic')),
  normalized_key TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'added', 'skipped')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (item_type, normalized_key)
);

CREATE TABLE job (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed', 'cancelled')),
  progress TEXT,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE llm_call (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  tokens_in INTEGER,
  tokens_out INTEGER,
  latency_ms INTEGER,
  cache_hit INTEGER NOT NULL DEFAULT 0 CHECK (cache_hit IN (0, 1)),
  cost_estimate_usd REAL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE transcription_call (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  minutes REAL,
  latency_ms INTEGER,
  cache_hit INTEGER NOT NULL DEFAULT 0 CHECK (cache_hit IN (0, 1)),
  cost_estimate_usd REAL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE setting (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- v1 seeds exactly two decks; the UI never creates more.
INSERT INTO deck (name, language) VALUES ('Spanish', 'es');
INSERT INTO deck (name, language) VALUES ('English Vocabulary', 'en');
