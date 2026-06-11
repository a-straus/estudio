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

- **bootstrap**: monorepo scaffold + check.sh + DB layer with migration runner + 001_init.sql (full ARCHITECTURE.md schema) + job queue + logger/error_log + config + healthcheck (spawned: 2026-06-10, `--model "$ORCH_MODEL" --effort high --include ARCHITECTURE.md`) — **re-spawn 1** (2026-06-10): integrate exit 7 from base drift (forked before iteration-5 commit) AND schema built from pre-reconciliation draft (missing extraction_item/source_page/error_log etc.); brief = sync state files to main + update 001_init.sql to finalized ARCHITECTURE.md — **re-spawn 2** (2026-06-11, iteration 13): re-spawn-1 worker FINISHED both fixes (commits 9ee4644 + 6c21c1b, confirmed in its log) but the container rebuild destroyed the worktree before integration → ORPHAN, no .worker-done marker; brief = verify-only (run check.sh, fix anything broken, exit clean so the marker is written)

## Backlog

<!-- Phase 1 (GOAL.md §11 order: PDF ingestion → SRS review → raw text → quizzes → grammar); thinnest slice first, riskiest part of each slice first. Format: - description [priority] -->

- **design-foundation** — materialize design/tokens.md as the token stylesheet and build the components.md base components as a composable library in /web; strong model, deep effort, `--include design/INDEX.md --include design/tokens.md --include design/components.md --include design/interaction.md`. Spawn after bootstrap integrates (touches /web scaffold) [Must]
- **pdf-ingestion-pipeline** — upload endpoint + job: PDF stored as source, per-page vision extraction (LlmProvider + anthropic adapter, task `pdf_extraction` default model `claude-fable-5`), page classification vocab|grammar → source_page, candidates → extraction_item with definitions/level/likely_known; per-page retry; prompts in /prompts; validate against docs/fixtures/workbook/ incl. worst scan [Must — riskiest, after bootstrap]
- **triage-ui** — batched (~50) triage screen per design/screens/triage.md: know/learn/skip, likely-known grouping, bulk actions, undo, batch confirm materializes word rows + dedupe surfacing [Must]
- **sm2-engine** — /server/src/srs/sm2.ts pure functions + review queue builder (new-cards/day promotion, maturity ≥21d, manual demotion); exhaustive unit tests [Must]
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

- **arch-critique**: critic pass over ARCHITECTURE.md + seeded design contract (2026-06-10) — all 13 findings adopted and reconciled directly by the orchestrator; branch abandoned after reconciliation (integrate exit 7 was a base-drift artifact; real diff = CRITIQUE.md only — see DECISIONS.md) [task done]

## Blocked

<!-- Format: - description — REASON — needs: what would unblock it -->
