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
  audio + voice questions), duration_minutes (REAL, nullable; lesson-audio
  recording length in minutes, computed at ingestion and read by the
  Lessons list for the "· N min" row label).
- `source_page` — source_id → source, page_no, kind (`vocab`|`grammar`),
  status (`pending`|`done`|`failed`), error (TEXT nullable),
  grammar_topic_id → grammar_topic (nullable; set when a grammar page is
  linked to the curriculum). Gives per-page processing/retry a queryable
  home and carries the GOAL.md §5 page→curriculum link; the grammar home's
  "what the tutor is covering" reads off it.
- `extraction_item` — source_id → source, term, lemma, part_of_speech,
  definition_es, definition_en, example, level, likely_known (REAL),
  batch_no, decision (`pending`|`know`|`learn`|`skip`), decided_at (TEXT
  nullable), word_id → word (nullable; set when a `learn`/`know` decision
  materializes a word row at batch confirm). The persistent home of
  extraction candidates and triage state: Today's "N words waiting" nudge,
  batch progress, undo, the Phase 3 coverage indicator, and
  never-re-extract-what-was-skipped are all queries over it. Undecided
  candidates never become `word` rows.
- `word` — term (as encountered), lemma, language, part_of_speech,
  definition_es, definition_en, example, level (CEFR estimate, owner-
  overridable), status (`new`|`learning`|`mature`|`known`|`suspended`),
  deck_id → deck, source_id → source (nullable), definition_origin
  (`llm`|`owner`), owner_edited_at (TEXT nullable — set by the library edit
  path; powers the WordDetail provenance line and the §14
  definitions-accepted-unedited metric), prompt_version (TEXT nullable —
  template hash of the defining prompt when definition_origin = `llm`).
  Plus `term_normalized` and `lemma_normalized`: plain **indexed** columns,
  written as lowercase + accent-strip at write time (SQLite has no
  `unaccent`; these make accent-insensitive search and dedupe cheap).
  Stored text keeps accents. Uniqueness: **UNIQUE(term, language)
  exact-match only** — never on normalized forms (`más` vs `mas` are
  different words; GOAL.md §16). Lemma-based dedupe is an ingestion-time
  *check* whose hits are surfaced in triage for a human merge/keep
  decision, never a constraint. Multi-word expressions are first-class
  terms. Extra senses append to definitions; never a second row.
  Lifecycle: triage "learn" → status `new` (no card_state yet); the review
  queue builder promotes up to `new_cards_per_day` `new` words at session
  start (deterministic, no cron), creating card_state with due = now and
  setting status `learning`; the SM-2 module sets `mature` when
  interval_days ≥ 21 and demotes back to `learning` on failure. Triage
  "know" → status `known`, no card_state.
- `card_state` — word_id (unique) → word, ease, interval_days, due_at,
  reps. One row per word, created by the review queue builder when it
  promotes a `new` word to `learning` (see `word` lifecycle above).
- `review_log` — **append-only** (no UPDATE/DELETE ever): word_id, ts,
  direction (`w2d`|`d2w`|`cloze`), grade (`fail`|`good`|`easy` ≈ SM-2
  2/4/5), ease_after, interval_after, origin
  (`review`|`quiz`|`manual_demotion`), quiz_question_id → quiz_question
  (nullable — set for cloze/quiz-rendered reviews so the rendered form is
  recoverable; the log is append-only, so this exists from migration 001).
  The schedule must be recomputable from this log alone.
- `grammar_category` — name, sort_order. Seeded by the curriculum prompt.
- `grammar_topic` — category_id → grammar_category, name, description,
  mastery (REAL 0–1). The suggested-practice queue derives from mastery +
  recency at read time, not a stored queue; likewise "seen in lessons" is
  derived at read time from `lesson_insight` (type `topic_covered`) and
  `source_page` links — no stored counter to drift.
- `lesson` — topic_id → grammar_topic, content (JSON: **explanation and
  examples only** — lesson quiz questions are `quiz_question` rows, never
  embedded, so flagging, cached explanations, "explain why", and
  reuse-before-regeneration work identically everywhere), prompt_version,
  cached forever; regenerate only on explicit request (new row, old kept).
- `quiz_question` — word_id or topic_id (one nullable), lesson_id → lesson
  (nullable — set for a lesson's quiz so it is retrievable as a set), style
  (`def_match`|`cloze`|`fill_in`|`conjugation`|`free_text`), payload (JSON:
  stem, options, correct, distractor source), explanation (TEXT, generated
  **at the same time** as the question, never lazily), prompt_version,
  flagged (bool — flagged questions are excluded from serving, never
  deleted).
- `quiz_attempt` — quiz metadata (deck_id/topic_id, style, direction) +
  answers (JSON per question: question_id, given, correct). `style` allows
  `mixed` in addition to the per-question styles — an attempt records what
  was actually run; code never writes a fabricated single style for a
  mixed session (lesson quizzes are `mixed`). Misses also
  write `review_log` rows and pull the word's `card_state.due_at` to now.
- `note` — quiz_question_id → quiz_question, body (TEXT NOT NULL). Owner
  self-note attached to an answered question (correct or incorrect);
  browsable per word/topic by joining through the question's word_id /
  topic_id links (no duplicate links to drift); fed as context into future
  quiz and lesson generation.
- `lesson_insight` — source_id → source, type
  (`flagged_word`|`correction`|`struggle_sentence`|`topic_covered`),
  payload (JSON), word_id / topic_id nullable links. (Phase 2.)
- `chat_thread` — page_context (JSON ref: kind + id), title.
  `chat_message` — thread_id, role, content, tool_calls (JSON). (Phase 2.)
- `suggestion` — item_type (`word`|`grammar_topic`), normalized_key (TEXT
  NOT NULL — for words the lowercase+accent-stripped lemma, identical to
  the `word` normalization rule; for grammar topics the normalized topic
  name), payload (JSON), status (`pending`|`added`|`skipped`),
  UNIQUE(item_type, normalized_key) so nothing is ever suggested twice,
  skips included. Suggest-time generation additionally excludes anything
  already in a deck (join against `word.lemma_normalized`). (Phase 2.)
- `job` — type, payload (JSON), status
  (`queued`|`running`|`done`|`failed`|`cancelled`), progress (JSON:
  step/total + per-chunk completion so jobs resume from the last completed
  chunk), error (TEXT with stack), attempts. Jobs survive restarts: on boot,
  `running` jobs revert to `queued`.
- `llm_call` / `transcription_call` — task, provider, model, prompt_version
  (template file content hash), tokens_in/out (or minutes), latency_ms,
  cache_hit (bool), cost_estimate_usd, status (`ok`|`error`), error (TEXT
  nullable). Written by the adapter layer on every call — successes and
  failures alike, no exceptions.
- `error_log` — ts, scope (`request`|`job`|`llm`|`transcription`), message,
  detail (TEXT — stack/context), capped (oldest rows pruned past ~1000).
  Written by the logger alongside stdout; the System page's "recent
  errors" reads it directly.
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
  `pdf_extraction` (vision/scan-reading) task and the other quality-critical
  tasks: `claude-opus-4-8`** — the strongest model available (FABLE-DISABLED
  2026-06-13: owner feedback 2026-06-10 set these to `claude-fable-5`, which
  Anthropic has since disabled; revert via the `FABLE_REPLACEMENT` constant in
  `server/src/llm/service.ts` when it returns — see DECISIONS.md). Each task's
  model is independently configurable. Prompt templates live in `/prompts/<task>.md`, versioned in
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
  transcription_call, error-with-stack) via a tiny in-house logger; errors
  are additionally written to the capped `error_log` table so the System
  page can show them.
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
- 2026-06-12 — Schema gate (orchestrator-approved batch, iteration 88; nothing else in flight): new `note` entity (per-answer self-notes feeding future generation — FEEDBACK 2026-06-11); `quiz_attempt.style` gains `mixed` (review-03 S5 — stop falsifying mixed/lesson attempts); migration 003 also materializes the already-specified Phase-2 tables `transcription_call`, `chat_thread`, `chat_message`, `suggestion` so Phase-2 build tasks need no schema grants and can run in parallel.
- 2026-06-12 — Schema gate (orchestrator-approved, iteration 112; nothing else in flight): `source.duration_minutes` (REAL, nullable) added via migration 004 — a plain additive `ALTER TABLE source ADD COLUMN` (no table rebuild, unlike 002/003 which altered CHECKs). Fulfills review-05 S7: the Lessons list spec (lessons.md) leads each row with "· N min", but `lesson-queries.ts` hardcoded `durationMinutes:null` and `source` had no duration column (the per-call `minutes` REAL lives on `transcription_call`, which is the spend log, not a durable per-recording domain fact). The value is already computed at ingestion (`jobs/lessonAudioIngestion.ts` → `readAudioDuration`); it was simply never persisted. Requested by: review-05 audit. Outcome: approved — additive, within §8, existing rows get NULL (the UI already renders null as no-duration). Task: `schema-gate-004` (ORCH_MODEL/high, ran alone).
- 2026-06-13 — FABLE-DISABLED (orchestrator, iteration 149; FEEDBACK 2026-06-13): Anthropic disabled `claude-fable-5` (U.S. government directive). The 8 quality-critical task defaults that used it (`pdf_extraction`, `page_classification`, `text_extraction`, `word_definition`, `grammar_curriculum`, `grammar_lesson`, `quiz_cloze`, `lesson_analysis`) now default to `claude-opus-4-8` (strongest available) via the `FABLE_REPLACEMENT` constant in `service.ts`. Not a schema change. Fully reversible — flip the one constant; all change sites are tagged `FABLE-DISABLED` (`grep -rni FABLE-DISABLED`). See DECISIONS.md (iteration 149).
- 2026-06-10 — Critique reconciliation (arch-critique, all 13 findings adopted): no UNIQUE on normalized lemma — UNIQUE(term, language) exact + indexed normalized columns + triage-surfaced dedupe; new `extraction_item` (triage state), `source_page` (page classification, per-page retry, page→curriculum link), `error_log`; llm/transcription calls get status/error + prompt_version; word gets definition_origin/owner_edited_at/prompt_version; word↔card_state lifecycle + maturity (interval ≥ 21d) specified; lesson quiz questions live only in quiz_question (nullable lesson_id); review_log direction gains `cloze` + nullable quiz_question_id; suggestion.normalized_key defined; grammar_topic.seen_in_lessons dropped (derived).
