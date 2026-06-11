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

- **design-foundation**: materialize design/tokens.md as the token stylesheet + build components.md base components as a composable library in /web (spawned: 2026-06-11 18:25, `--model "$ORCH_MODEL" --effort high --include design/INDEX.md --include design/tokens.md --include design/components.md --include design/interaction.md`)
- **pdf-ingestion-pipeline**: upload endpoint + ingestion job: PDF stored as source, per-page vision extraction via new LlmProvider layer + anthropic adapter, page classification → source_page, candidates → extraction_item; per-page retry; prompts in /prompts; mocked-provider tests (no runtime API key yet — see QUESTIONS.md) (spawned: 2026-06-11 18:25, `--model "$ORCH_MODEL" --effort high`, schema excerpts pasted in brief)
## Backlog

<!-- Phase 1 (GOAL.md §11 order: PDF ingestion → SRS review → raw text → quizzes → grammar); thinnest slice first, riskiest part of each slice first. Format: - description [priority] -->

- **pdf-ingestion-live-validation** — once ANTHROPIC_API_KEY lands in .env (QUESTIONS.md): run the real ingestion end-to-end against both docs/fixtures/workbook/ PDFs, tune prompts, verify extraction quality [Must — gates Phase 1]
- **triage-ui** — batched (~50) triage screen per design/screens/triage.md: know/learn/skip, likely-known grouping, bulk actions, undo, batch confirm materializes word rows + dedupe surfacing [Must]
- **srs-api-wiring** — wire /server/src/srs/ pure functions to the DB and HTTP API (due-queue endpoint, grade submission writing review_log + card state); deferred from sm2-engine which was new-files-only; must wait for pdf-ingestion-pipeline to land (it owns /server routes in flight) [Must]
- **review-ui** — review screen per design/screens/review.md: due cards, random direction, MC default + flip-card fallback, three grades, both-definition reveal, "I forgot this"; review_log writes [Must]
- **library-ui** — library per design/screens/library.md: CRUD, accent-insensitive search, filters, manual add with auto-fill defs, delete (history retained), forgot-this, WordDetail provenance [Must]
- **raw-text-ingestion** — paste text → same extraction/triage pipeline, language select/auto-detect [Must]
- **quiz-engine-ui** — quiz config/play/results per design/screens/quiz.md: def-match MC + LLM cloze with cached explanations (generated together), deterministic grading, miss → SRS failure + due now, flag-question, quiz_attempt [Must]
- **grammar-curriculum** — curriculum seeding prompt (/prompts, versioned) → grammar_category/grammar_topic rows; grammar home with mastery-derived practice queue per design/screens/grammar.md [Must]
- **grammar-lessons-quizzes** — lesson generation (explanation+examples; quiz as quiz_question rows w/ lesson_id), MC/fill-in/conjugation/free-text grading (LLM), "explain why" everywhere, mastery tracking [Must]
- **system-page** — System page per design/screens/system.md: recent errors (error_log), job statuses, LLM spend, DB/backup status; daily backup job [Must]
- **docs-and-demo** — README cold start (clone→run→phone via LAN/Tailscale, "Where your data lives", backup/restore exercised), TODO-LATER.md, docs/demo.md script; LLM hot-swap proof [Must — Phase 1 gate]
- review-01 after ~5 integrations (`--model "$ORCH_MODEL" --effort medium --include GOAL.md --include design`) [process]
- Phase 2 (lesson audio → Ask → suggestions → voice) and Phase 3 (Gutenberg/KJV, calibration, Mochi-fixture-gated) decomposed when Phase 1 gate nears [later]

Note: `no-design` branch = human sandbox, not a worker branch (see DECISIONS.md); ignore its ORPHAN status in list-agents.

## Done

<!-- Format: - **branch-name**: description (merged: YYYY-MM-DD HH:MM) [task/feature/release done] -->

- **sm2-engine**: /server/src/srs/ pure SM-2 functions — grade application, manual demotion, maturity ≥21d, review queue builder with new-cards/day promotion; unit tests; new files only (merged: 2026-06-11 18:36, check.sh green on main, 61 tests) [task done]

- **bootstrap**: monorepo scaffold (server/web/shared/prompts) + check.sh + DB layer with migration runner + 001_init.sql (full finalized ARCHITECTURE.md schema) + persistent job queue + structured logger/error_log + config + healthcheck; 20 tests green (merged: 2026-06-11 18:18, after 5 re-spawns — all integration artifacts, not work failures; full history in git log of this file) [task done]

- **arch-critique**: critic pass over ARCHITECTURE.md + seeded design contract (2026-06-10) — all 13 findings adopted and reconciled directly by the orchestrator; branch abandoned after reconciliation (integrate exit 7 was a base-drift artifact; real diff = CRITIQUE.md only — see DECISIONS.md) [task done]

## Blocked

<!-- Format: - description — REASON — needs: what would unblock it -->
