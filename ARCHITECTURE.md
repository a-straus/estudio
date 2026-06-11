# Architecture

<!--
Owned by the orchestrator. Drafted from GOAL.md §8 in the first iteration,
challenged by a fresh-context critic agent, reconciled, then amended ONLY
through the schema-change gate (see CLAUDE.md): one model change in flight
at a time, applied while no other workers run.

Workers follow this document exactly and never edit it — integration is
refused for branches that touch it. Humans: read freely; steer it through
GOAL.md §8 and QUESTIONS.md answers, not by editing here.
-->

## System shape

One deployable: a single Node.js + Express + TypeScript process that serves
the REST/JSON API **and** the built React (Vite) app, on one port, backed by
one SQLite file (better-sqlite3, WAL mode). No ORM — plain SQL through a
tiny in-house migration runner. A persistent job queue (a `job` table polled
by an in-process worker loop) runs all long work: PDF pages, book
processing, transcription, generation. The server is the only thing that
talks to LLM/transcription providers; the browser never holds a key.

Monorepo layout (shallow, fixed):

```
/server          Express app, routes, services, jobs, db (migrations + queries)
/web             React + Vite app, plain CSS, design tokens as CSS custom properties
/shared          TypeScript types shared by server and web (API payloads, enums)
/prompts         versioned prompt template files (one file per task, plain text/markdown)
/docs            fixtures, demo script, human docs
/data            runtime data directory (git-ignored): app.db, backups/, uploads/, books/
```

`/data` location is configurable via `DATA_DIR` env (default `./data`). DB
file, timestamped backups, uploaded originals, and fetched book texts all
live under it — nothing on disk outside it at runtime. README documents
"Where your data lives".

## Entities & relationships

All tables snake_case, singular. Every table has `id` (INTEGER PRIMARY KEY
AUTOINCREMENT), `created_at`, `updated_at` (TEXT, ISO-8601 UTC) unless noted.

- `deck` — name, language (`es`|`en`), subject (default `language`). v1
  seeds exactly two rows: Spanish, English Vocabulary. UI never creates more.
- `source` — type (`pdf`|`text`|`lesson_audio`|`voice_question`|`gutenberg`|`mochi`|`manual`|`chat`|`suggestion`),
  title, ref (URL/ID/filename), stored_path (original file under
  `/data/uploads` or `/data/books`), transcript (TEXT, nullable; lesson
  audio + voice questions).
- `word` — term (as encountered), lemma, language, part_of_speech,
  definition_es, definition_en, example, level (CEFR estimate, owner-
  overridable), status (`new`|`learning`|`mature`|`known`|`suspended`),
  deck_id → deck, source_id → source (nullable). Uniqueness: one card per
  normalized (lemma, language) — normalization = lowercase + accent-strip
  for matching only; stored text keeps accents. Multi-word expressions are
  first-class terms. Extra senses append to definitions; never a second row.
- `card_state` — word_id (unique) → word, ease, interval_days, due_at,
  reps. One row per word, created when the word enters a deck as `learning`.
- `review_log` — **append-only** (no UPDATE/DELETE ever): word_id, ts,
  direction (`w2d`|`d2w`), grade (`fail`|`good`|`easy` ≈ SM-2 2/4/5),
  ease_after, interval_after, origin (`review`|`quiz`|`manual_demotion`).
  The schedule must be recomputable from this log alone.
- `grammar_category` — name, sort_order. Seeded by the curriculum prompt.
- `grammar_topic` — category_id → grammar_category, name, description,
  mastery (REAL 0–1), seen_in_lessons (count). The suggested-practice queue
  derives from mastery + recency at read time, not a stored queue.
- `lesson` — topic_id → grammar_topic, content (JSON: explanation, examples,
  quiz spec), cached forever; regenerate only on explicit request (new row,
  old kept).
- `quiz_question` — word_id or topic_id (one nullable), style
  (`def_match`|`cloze`|`fill_in`|`conjugation`|`free_text`), payload (JSON:
  stem, options, correct, distractor source), explanation (TEXT, generated
  **at the same time** as the question, never lazily), flagged (bool —
  flagged questions are excluded from serving, never deleted).
- `quiz_attempt` — quiz metadata (deck_id/topic_id, style, direction) +
  answers (JSON per question: question_id, given, correct). Misses also
  write `review_log` rows and pull the word's `card_state.due_at` to now.
- `lesson_insight` — source_id → source, type
  (`flagged_word`|`correction`|`struggle_sentence`|`topic_covered`),
  payload (JSON), word_id / topic_id nullable links. (Phase 2.)
- `chat_thread` — page_context (JSON ref: kind + id), title.
  `chat_message` — thread_id, role, content, tool_calls (JSON). (Phase 2.)
- `suggestion` — item_type (`word`|`grammar_topic`), payload (JSON), status
  (`pending`|`added`|`skipped`), UNIQUE(item_type, normalized_key) so
  nothing is ever suggested twice, skips included. (Phase 2.)
- `job` — type, payload (JSON), status
  (`queued`|`running`|`done`|`failed`|`cancelled`), progress (JSON:
  step/total + per-chunk completion so jobs resume from the last completed
  chunk), error (TEXT with stack), attempts. Jobs survive restarts: on boot,
  `running` jobs revert to `queued`.
- `llm_call` / `transcription_call` — task, provider, model, tokens_in/out
  (or minutes), latency_ms, cache_hit (bool), cost_estimate_usd. Written by
  the adapter layer on every call, no exceptions.
- `setting` — key (unique), value (JSON). Holds: definition display
  preference, new-cards/day (default 20), active LLM provider/model **per
  task**, transcription provider/model.

## Conventions

- **IDs:** SQLite `INTEGER PRIMARY KEY AUTOINCREMENT`. No UUIDs.
- **Timestamps:** TEXT ISO-8601 UTC (`2026-06-10T12:00:00Z`) everywhere.
- **Deletion:** hard delete for `word` (review_log rows remain, flagged
  orphaned via nullable FK with `ON DELETE SET NULL`); everything else is
  effectively append-or-update. `review_log` is never deleted or updated.
- **Migrations:** numbered SQL files in `/server/src/db/migrations/`
  (`001_init.sql`, …), applied in order by the in-house runner, recorded in
  a `migration` table. Additive only unless the schema gate approves
  otherwise. A timestamped DB backup is written automatically before every
  migration run.
- **Naming:** snake_case tables/columns; camelCase in TypeScript; API JSON
  is camelCase (mapping happens at the query layer in `/server/src/db/`).
- **API:** REST/JSON under `/api/...`, plural resource nouns
  (`/api/words`, `/api/decks/:id/due`). Errors: `{ error: { message, code } }`
  with proper status codes; never a 200 with an error inside.
- **SM-2:** implemented in-house in `/server/src/srs/sm2.ts`, pure
  functions, exhaustively unit-tested (including manual demotion: interval
  reset + ease down one step of 0.15, floor 1.3). No SRS library.
- **LLM layer:** all calls go through `LlmProvider`
  (`complete()`, `vision()`, normalized usage/cost) in
  `/server/src/llm/`; one adapter file per provider; ship `anthropic.ts`.
  Active provider/model per task is config (env defaults + `setting`
  overrides), never hardcoded at call sites. **Default model for the
  `pdf_extraction` (vision/scan-reading) task: `claude-fable-5`**
  (owner feedback 2026-06-10); each task's model is independently
  configurable. Prompt templates live in `/prompts/<task>.md`, versioned in
  git, loaded at call time — no inline prompt strings. Every generated
  artifact (definition, lesson, question, explanation, curriculum,
  suggestion) is persisted and re-served from the DB before any
  regeneration.
- **Transcription layer:** mirrors the LLM pattern in
  `/server/src/transcription/` (`TranscriptionProvider`), Phase 2.
- **Jobs:** anything that can take >2s (LLM batches, PDF pages, fetches,
  transcription) runs as a `job`, enqueued by the API, executed by the
  in-process poller, progress visible via `/api/jobs`. Retry with
  exponential backoff up to `attempts` limit; user input is persisted
  before the job is enqueued, so failure never loses it.
- **Logging:** structured JSON lines to stdout (request, job, llm_call,
  transcription_call, error-with-stack) via a tiny in-house logger.
- **Web:** plain CSS only; every visual value references a design-token
  custom property from the token stylesheet (built from
  `design/tokens.md`). Mobile-first; ≥44px tap targets.
- **Tests:** vitest (one runner for server and web); unit tests colocated
  as `*.test.ts`. `check.sh` = typecheck + build + tests, fast.
- **Secrets:** `.env` only (git-ignored), read once at boot into a typed
  config module. Keys never serialized into API responses or the client
  bundle.

## Boundaries & non-negotiables

- One schema-affecting change in flight, ever — schema changes go through
  the orchestrator's gate; worker briefs say "Schema changes allowed: none"
  unless the gate granted an exact list.
- `review_log` stays append-only; no code path updates or deletes its rows.
- No provider-specific types/options/prompt syntax outside the adapter
  files in `/server/src/llm/` and `/server/src/transcription/`.
- No ORM, no UI component framework, no Tailwind/CSS-in-JS, no SRS library,
  no analytics — per GOAL.md §8.
- The browser never calls a provider API; the server never serves a key.
- All on-disk runtime state stays under `DATA_DIR`.

## Change log

<!-- One line per gated model change: date — change — requested by — outcome. -->

- 2026-06-10 — Initial draft from GOAL.md §8 (orchestrator, iteration 1).
