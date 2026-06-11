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

- **review-02-fixes**: review-02 blocker #1 (confirmBatch within-batch + homograph duplicate handling — surface as dedupeHits, never 500/rollback) + should-fixes #2–#7 + nits N1/N2/N4/N6/N7/N10/N12; owns db/triage-queries.ts, db/srs-queries.ts, routes/triage.ts, routes/srs.ts (+tests), shared/src/triage-api.ts + srs-api.ts, llm/service.ts (N4 only), web/src/screens/Review.* + Triage.* + reviewApi/triageApi/libraryApi/ingestApi + new shared web api client — NOT jobs//prompts//App.tsx/app.ts/words.ts/grammar.ts/migrations (spawned: 2026-06-11 ~13:35, `--model "$ORCH_MODEL" --effort high --include design/INDEX.md --include design/tokens.md --include design/screens/review.md --include design/screens/triage.md --include design/components.md --include design/interaction.md`)
- **grammar-curriculum**: curriculum seeding via grammar_curriculum LLM task (prompts/grammar_curriculum.md) → grammar_category/grammar_topic rows; grammar home per design/screens/grammar.md with mastery-derived practice queue; review-01 #8: link grammar pages to topics (source_page.grammar_topic_id) in pdfIngestion; owns routes/grammar.ts, db/grammar-queries.ts, shared/src/grammar-api.ts, jobs/grammarSeed.ts (new) + handlers.ts + server/src/index.ts (registration), jobs/pdfIngestion.ts (#8 only), prompts/grammar_curriculum.md, web/src/screens/Grammar.* + grammarApi.ts — NOT llm/service.ts (task already registered)/App.tsx/app.ts/migrations/triage/srs/words routes (spawned: 2026-06-11 ~13:35, plain spawn, schema excerpts pasted, `--include design/INDEX.md --include design/tokens.md --include design/screens/grammar.md --include design/components.md --include design/interaction.md`)


## Backlog

<!-- Phase 1 (GOAL.md §11 order: PDF ingestion → SRS review → raw text → quizzes → grammar); thinnest slice first, riskiest part of each slice first. Format: - description [priority] -->

- **quiz-engine-ui** — quiz config/play/results per design/screens/quiz.md: def-match MC + LLM cloze with cached explanations (generated together), deterministic grading, miss → SRS failure + due now, flag-question, quiz_attempt; brief also carries review-02 #8 (review screen owes "Explain why" + cached-cloze mix-in once quiz_question rows exist); WAIT for review-02-fixes to land (shares Review.tsx + srs routes/queries) [Must]
- **grammar-lessons-quizzes** — lesson generation (explanation+examples; quiz as quiz_question rows w/ lesson_id), MC/fill-in/conjugation/free-text grading (LLM), "explain why" everywhere, mastery tracking; WAIT for grammar-curriculum [Must]
- **system-page** — System page per design/screens/system.md: recent errors (error_log), job statuses, LLM spend, DB/backup status; daily backup job; WAIT for grammar-curriculum to land (shares jobs/handlers.ts + server/src/index.ts registration) [Must]
- **docs-and-demo** — README cold start (clone→run→phone via LAN/Tailscale, "Where your data lives", backup/restore exercised), TODO-LATER.md, docs/demo.md script; LLM hot-swap proof; covers review-01 #9 (no app README exists yet) [Must — Phase 1 gate]
- review-03 after ~5 more integrations (`--model "$ORCH_MODEL" --effort medium --include GOAL.md --include ARCHITECTURE.md --include design`) [process]
- Phase 2 (lesson audio → Ask → suggestions → voice) and Phase 3 (Gutenberg/KJV, calibration, Mochi-fixture-gated) decomposed when Phase 1 gate nears [later]

Note: `no-design` branch = human sandbox, not a worker branch (see DECISIONS.md); ignore its ORPHAN status in list-agents.

## Done

<!-- Format: - **branch-name**: description (merged: YYYY-MM-DD HH:MM) [task/feature/release done] -->

- **library-ui**: library screen + word CRUD API (/api/words GET/POST/PATCH/DELETE, accent-insensitive search, filters, manual add with word_definition auto-fill, delete with history retained, forgot-this, WordDetail provenance) (merged: 2026-06-11 13:26, check.sh green on main — 254 tests) [task done]
- **raw-text-ingestion**: POST /api/sources/text + text_ingestion job + text_extraction LLM task, Ingest screen (paste panel + PDF drop), language select/auto-detect; carried review-01 #5 + #13 (merged: 2026-06-11 13:26, check.sh green on main — 254 tests) [task done]
- **review-02**: audit of integrations 5–9 → REVIEW.md: 1 blocker (confirmBatch duplicate 500), 7 should-fixes, 12 nits + clean-bill verification; all dispositioned in DECISIONS.md 2026-06-11, REVIEW.md removed (merged: 2026-06-11 13:27) [task done]
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
