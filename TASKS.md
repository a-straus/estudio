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

- **library-ui**: library screen per design/screens/library.md + word CRUD API: GET/POST/PATCH/DELETE under /api/words, accent-insensitive search (term_normalized/lemma_normalized), filters, manual add with LLM auto-fill defs (word_definition task, prompts/define_word.md), delete (history retained via ON DELETE SET NULL), forgot-this (existing demote endpoint), WordDetail provenance; owns routes/words.ts, db/word-queries.ts, shared/src/library-api.ts, web/src/screens/Library.* + WordDetail.* + libraryApi.ts, prompts/define_word.md — NOT App.tsx/app.ts/llm/*.ts/jobs//migrations/other routes (spawned: 2026-06-11 ~13:10, plain spawn, schema excerpts pasted, `--include design/INDEX.md --include design/tokens.md --include design/screens/library.md --include design/components.md --include design/interaction.md`)
- **raw-text-ingestion**: paste text → same extraction/triage pipeline: POST /api/sources/text (text stored as source type 'text'), text_ingestion job chunking + text_extraction LLM task (prompts/text_extraction.md), language select/auto-detect, ingest screen per design/screens/ingest.md (paste panel + PDF drop wired to existing upload endpoint); carries review-01 #5 (parameterize hardcoded 'es' dedupe lookup) + #13 (delete demo job handler); owns routes/sources.ts, jobs/handlers.ts + jobs/textIngestion.ts, prompts/text_extraction.md, web/src/screens/Ingest.* + ingestApi.ts, shared/src/ingest-api.ts — NOT App.tsx/app.ts/llm/*.ts/migrations/words/triage/srs routes (spawned: 2026-06-11 ~13:10, plain spawn, schema excerpts pasted, `--include design/INDEX.md --include design/tokens.md --include design/screens/ingest.md --include design/components.md --include design/interaction.md`)
- **review-02**: audit integrations 5–9 (srs-api-wiring, triage-ui, review-01-fixes, pdf-ingestion-live-validation, review-ui) against GOAL/ARCHITECTURE/design → REVIEW.md (spawned: 2026-06-11 ~13:10, `--model "$ORCH_MODEL" --effort medium --include GOAL.md --include ARCHITECTURE.md --include design`)


## Backlog

<!-- Phase 1 (GOAL.md §11 order: PDF ingestion → SRS review → raw text → quizzes → grammar); thinnest slice first, riskiest part of each slice first. Format: - description [priority] -->

- **quiz-engine-ui** — quiz config/play/results per design/screens/quiz.md: def-match MC + LLM cloze with cached explanations (generated together), deterministic grading, miss → SRS failure + due now, flag-question, quiz_attempt [Must]
- **grammar-curriculum** — curriculum seeding prompt (/prompts, versioned) → grammar_category/grammar_topic rows; grammar home with mastery-derived practice queue per design/screens/grammar.md; brief also carries review-01 #8 (set source_page.grammar_topic_id — grammar pages link to the curriculum) [Must]
- **grammar-lessons-quizzes** — lesson generation (explanation+examples; quiz as quiz_question rows w/ lesson_id), MC/fill-in/conjugation/free-text grading (LLM), "explain why" everywhere, mastery tracking [Must]
- **system-page** — System page per design/screens/system.md: recent errors (error_log), job statuses, LLM spend, DB/backup status; daily backup job [Must]
- **docs-and-demo** — README cold start (clone→run→phone via LAN/Tailscale, "Where your data lives", backup/restore exercised), TODO-LATER.md, docs/demo.md script; LLM hot-swap proof; covers review-01 #9 (no app README exists yet) [Must — Phase 1 gate]
- review-03 after ~5 more integrations (`--model "$ORCH_MODEL" --effort medium --include GOAL.md --include ARCHITECTURE.md --include design`) [process]
- Phase 2 (lesson audio → Ask → suggestions → voice) and Phase 3 (Gutenberg/KJV, calibration, Mochi-fixture-gated) decomposed when Phase 1 gate nears [later]

Note: `no-design` branch = human sandbox, not a worker branch (see DECISIONS.md); ignore its ORPHAN status in list-agents.

## Done

<!-- Format: - **branch-name**: description (merged: YYYY-MM-DD HH:MM) [task/feature/release done] -->

- **review-01-fixes**: six review-01 findings fixed — migration 002 quiz_question exactly-one CHECK (table rebuild), Multer 413 file_too_large, nowIso ms strip, triage retry ≥44px tap target, WordEntry hero breakpoint → 640px, Button busy default "…" (merged: 2026-06-11 13:04, check.sh green on main — 200 tests) [task done]
- **pdf-ingestion-live-validation**: live end-to-end ingestion of both docs/fixtures/workbook/ PDFs with real Anthropic vision calls; docs/validation-pdf-ingestion.md with per-page outcomes + llm_call cost; fixes: §6.1 {{calibration_sample}} templating, pending rows drop ingestion-time word_id, extractJson fence strip; validate-ingestion.ts script (opt-in, not in check.sh) (merged: 2026-06-11 13:05, check.sh green on main — 200 tests) [task done]
- **review-ui**: SRS review screen at /review per design/screens/review.md over the merged SRS API: due cards, API-assigned direction, MC default + flip-card fallback, three grades, both-definition reveal, "I forgot this" demote (merged: 2026-06-11 13:05, check.sh green on main — 200 tests) [task done]
- **triage-ui**: triage screen end-to-end (routes/triage.ts + db/triage-queries.ts + shared/src/triage-api.ts + web Triage screen): know/learn/skip, batch confirm materializes words with confirm-time lemma dedupe surfaced for keep/merge (merged: 2026-06-11 12:41, check.sh green on main — 179 tests) [task done]
- **srs-api-wiring**: SM-2 engine wired to DB + HTTP: GET /api/decks/:id/due with new-card promotion, POST /api/reviews writing review_log + card_state, POST /api/words/:id/demote; shared/src/srs-api.ts types (merged: 2026-06-11 12:40, check.sh green on main — 179 tests) [task done]
- **review-01**: audit of integrations 1–4 → REVIEW.md, 14 findings (3 contract should-fixes, 3 GOAL-fidelity, 3 design, 5 nits) + extensive clean-bill verification; all findings dispositioned in DECISIONS.md 2026-06-11, REVIEW.md removed (merged: 2026-06-11 12:41) [task done]
- **pdf-ingestion-pipeline**: upload endpoint + ingestion job: PDF stored as source, per-page vision extraction via LlmProvider layer + anthropic adapter, page classification → source_page, candidates → extraction_item; per-page retry; prompts in /prompts; mocked-provider tests (merged: 2026-06-11 11:50, check.sh green on main after npm install — 142 tests; re-spawn 1 resolved the package-lock conflict) [task done]

- **design-foundation**: design/tokens.md materialized as token stylesheet + components.md base components built as composable library in /web, with tests (merged: 2026-06-11, check.sh green on main after npm install — 116 tests) [task done]

- **sm2-engine**: /server/src/srs/ pure SM-2 functions — grade application, manual demotion, maturity ≥21d, review queue builder with new-cards/day promotion; unit tests; new files only (merged: 2026-06-11 18:36, check.sh green on main, 61 tests) [task done]

- **bootstrap**: monorepo scaffold (server/web/shared/prompts) + check.sh + DB layer with migration runner + 001_init.sql (full finalized ARCHITECTURE.md schema) + persistent job queue + structured logger/error_log + config + healthcheck; 20 tests green (merged: 2026-06-11 18:18, after 5 re-spawns — all integration artifacts, not work failures; full history in git log of this file) [task done]

- **arch-critique**: critic pass over ARCHITECTURE.md + seeded design contract (2026-06-10) — all 13 findings adopted and reconciled directly by the orchestrator; branch abandoned after reconciliation (integrate exit 7 was a base-drift artifact; real diff = CRITIQUE.md only — see DECISIONS.md) [task done]

## Blocked

<!-- Format: - description — REASON — needs: what would unblock it -->
