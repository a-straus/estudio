# Task Board

<!--
Owned and maintained by the orchestrator. Do not edit manually during a run.

Done levels (from GOAL.md §15):
  Task done   — acceptance criteria met, tests pass
  Feature done — all stories shipped, NFRs met, docs updated
  Release done — feature done + success metrics instrumented + GOAL.md §15 release criteria met
                 (this is when the orchestrator stops its loop)
-->

## In Progress

<!-- Format: - **branch-name**: description (spawned: YYYY-MM-DD HH:MM) -->

- **triage-ui**: batched (~50) triage screen per design/screens/triage.md: know/learn/skip, likely-known grouping, bulk actions, undo, batch confirm materializes word rows + dedupe surfacing; fills routes/triage.ts stub + shared/src/triage-api.ts; owns /web App.tsx + screens this round (spawned: 2026-06-11 ~11:55, plain spawn, schema excerpts pasted, `--include design/INDEX.md --include design/tokens.md --include design/screens/triage.md --include design/components.md --include design/interaction.md`)
- **srs-api-wiring**: wire /server/src/srs/ pure functions to DB + HTTP: due-queue endpoint w/ new-card promotion, grade submission writing review_log + card_state, "forgot this" manual demotion; fills routes/srs.ts stub + shared/src/srs-api.ts; server-only, no /web (spawned: 2026-06-11 ~11:55, plain spawn, schema excerpts pasted, no --include)
- **review-01**: audit the 4 integrations (bootstrap, sm2-engine, design-foundation, pdf-ingestion-pipeline) against GOAL.md/ARCHITECTURE.md/design — token discipline, component reuse, microcopy; findings → REVIEW.md (spawned: 2026-06-11 ~11:55, `--model "$ORCH_MODEL" --effort medium --include GOAL.md --include ARCHITECTURE.md --include design`)

## Backlog

<!-- Phase 1 (GOAL.md §11 order: PDF ingestion → SRS review → raw text → quizzes → grammar); thinnest slice first, riskiest part of each slice first. Format: - description [priority] -->

- **pdf-ingestion-live-validation** — once ANTHROPIC_API_KEY lands in .env (QUESTIONS.md): run the real ingestion end-to-end against both docs/fixtures/workbook/ PDFs, tune prompts, verify extraction quality [Must — gates Phase 1]
- **review-ui** — review screen per design/screens/review.md: due cards, random direction, MC default + flip-card fallback, three grades, both-definition reveal, "I forgot this"; review_log writes [Must]
- **library-ui** — library per design/screens/library.md: CRUD, accent-insensitive search, filters, manual add with auto-fill defs, delete (history retained), forgot-this, WordDetail provenance [Must]
- **raw-text-ingestion** — paste text → same extraction/triage pipeline, language select/auto-detect [Must]
- **quiz-engine-ui** — quiz config/play/results per design/screens/quiz.md: def-match MC + LLM cloze with cached explanations (generated together), deterministic grading, miss → SRS failure + due now, flag-question, quiz_attempt [Must]
- **grammar-curriculum** — curriculum seeding prompt (/prompts, versioned) → grammar_category/grammar_topic rows; grammar home with mastery-derived practice queue per design/screens/grammar.md [Must]
- **grammar-lessons-quizzes** — lesson generation (explanation+examples; quiz as quiz_question rows w/ lesson_id), MC/fill-in/conjugation/free-text grading (LLM), "explain why" everywhere, mastery tracking [Must]
- **system-page** — System page per design/screens/system.md: recent errors (error_log), job statuses, LLM spend, DB/backup status; daily backup job [Must]
- **docs-and-demo** — README cold start (clone→run→phone via LAN/Tailscale, "Where your data lives", backup/restore exercised), TODO-LATER.md, docs/demo.md script; LLM hot-swap proof [Must — Phase 1 gate]
- review-02 after ~5 more integrations (`--model "$ORCH_MODEL" --effort medium --include GOAL.md --include ARCHITECTURE.md --include design`) [process]
- Phase 2 (lesson audio → Ask → suggestions → voice) and Phase 3 (Gutenberg/KJV, calibration, Mochi-fixture-gated) decomposed when Phase 1 gate nears [later]

Note: `no-design` branch = human sandbox, not a worker branch (see DECISIONS.md); ignore its ORPHAN status in list-agents.

## Done

<!-- Format: - **branch-name**: description (merged: YYYY-MM-DD HH:MM) [task/feature/release done] -->

- **pdf-ingestion-pipeline**: upload endpoint + ingestion job: PDF stored as source, per-page vision extraction via LlmProvider layer + anthropic adapter, page classification → source_page, candidates → extraction_item; per-page retry; prompts in /prompts; mocked-provider tests (merged: 2026-06-11 11:50, check.sh green on main after npm install — 142 tests; re-spawn 1 resolved the package-lock conflict) [task done]

- **design-foundation**: design/tokens.md materialized as token stylesheet + components.md base components built as composable library in /web, with tests (merged: 2026-06-11, check.sh green on main after npm install — 116 tests) [task done]

- **sm2-engine**: /server/src/srs/ pure SM-2 functions — grade application, manual demotion, maturity ≥21d, review queue builder with new-cards/day promotion; unit tests; new files only (merged: 2026-06-11 18:36, check.sh green on main, 61 tests) [task done]

- **bootstrap**: monorepo scaffold (server/web/shared/prompts) + check.sh + DB layer with migration runner + 001_init.sql (full finalized ARCHITECTURE.md schema) + persistent job queue + structured logger/error_log + config + healthcheck; 20 tests green (merged: 2026-06-11 18:18, after 5 re-spawns — all integration artifacts, not work failures; full history in git log of this file) [task done]

- **arch-critique**: critic pass over ARCHITECTURE.md + seeded design contract (2026-06-10) — all 13 findings adopted and reconciled directly by the orchestrator; branch abandoned after reconciliation (integrate exit 7 was a base-drift artifact; real diff = CRITIQUE.md only — see DECISIONS.md) [task done]

## Blocked

<!-- Format: - description — REASON — needs: what would unblock it -->
