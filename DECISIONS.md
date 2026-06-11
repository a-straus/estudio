# Decisions

<!--
Owned by the orchestrator — the project's working memory of settled questions.

One entry per decision resolved through QUESTIONS.md, or made autonomously
within GOAL.md §11 tradeoff rules when worth recording. The orchestrator
reads this every iteration so resolved questions never get re-litigated.

GOAL.md remains the read-only source of truth for scope; this file never
overrides it. Humans: read freely, edit via QUESTIONS.md answers instead.

Format:
- YYYY-MM-DD — <decision> (source: QUESTIONS.md "<title>" | autonomous per §11)
-->

- 2026-06-10 — The `no-design` git branch is a human sandbox (orchestration-infra variant, predates this run), not a worker branch; `list-agents` reports it as ORPHAN but it is never integrated or abandoned — leave it untouched. (autonomous)
- 2026-06-10 — App's `pdf_extraction` (vision/scan-reading) LLM task defaults to `claude-fable-5`; LLM model config is per-task, validated against `docs/fixtures/workbook/`. (source: FEEDBACK.md 2026-06-10)
- 2026-06-10 — Human-seeded design/ contract adopted as-is (★ files all present and filled, synced to GOAL v2). Known deliberate gap per its Change log: Phase 2 surfaces (Ask, Suggestions, lesson audio, voice questions) unspecified — orchestrator extends the contract when Phase 2 approaches. (autonomous per §11)
- 2026-06-10 — ARCHITECTURE.md conventions set: integer autoincrement IDs, ISO-8601 UTC text timestamps, snake_case tables / camelCase API JSON, numbered additive SQL migrations with pre-migration backup, hard-delete words with ON DELETE SET NULL review_log orphans, vitest as the test runner, per-task LLM model config. (autonomous per §11; subject to arch-critique reconciliation in iteration 2)
