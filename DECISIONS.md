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
- 2026-06-10 — Worker auth fixed by human via commit ac95f66: bin/spawn sources .devcontainer/devcontainer.env (CLAUDE_CODE_OAUTH_TOKEN) in each worker script; verified working. Worker spawning unblocked. (source: QUESTIONS.md "Worker auth broken — no API credentials in the container")
- 2026-06-10 — ARCHITECTURE.md conventions set: integer autoincrement IDs, ISO-8601 UTC text timestamps, snake_case tables / camelCase API JSON, numbered additive SQL migrations with pre-migration backup, hard-delete words with ON DELETE SET NULL review_log orphans, vitest as the test runner, per-task LLM model config. (autonomous per §11; subject to arch-critique reconciliation in iteration 2)
- 2026-06-10 — arch-critique reconciled: all 13 findings adopted (3 blockers: no UNIQUE on normalized lemma / new extraction_item triage table / new source_page table with page→curriculum link; 6 should-fixes incl. error_log + call error states, card lifecycle + maturity ≥21d, lesson quiz questions only in quiz_question, two design↔GOAL conflicts fixed in design/ — quiz SRS writeback on misses, delete microcopy no longer claims history deletion; 4 nits: suggestion.normalized_key defined, prompt_version columns, review_log cloze direction + quiz_question_id, seen_in_lessons derived not stored). ARCHITECTURE.md finalized. (autonomous per §11)
- 2026-06-10 — arch-critique branch disposed by read+abandon rather than merge: integrate exited 7 because the branch predates main's iteration commits, making protected state files appear modified — its real diff was CRITIQUE.md only, whose content was reconciled into ARCHITECTURE.md/design/DECISIONS.md; merging the branch only to git-rm CRITIQUE.md was a worker-run wasted. (autonomous)
- 2026-06-11 — bootstrap re-spawn 3 issued despite the 2-re-spawn guideline: the cap targets repeatedly failing work, but every bootstrap re-spawn succeeded at its goal (re-spawn 2 FINISHED, check.sh green per its log); this exit 7 is pure state-file drift — the sync commit 9ee4644 pinned TASKS.md to main-as-of-iteration-6 and main's TASKS.md moved in iteration 13. Fix is the one integrate itself prescribes (reset TASKS.md to main, commit); escalating a two-command cleanup would violate "default to deciding." (autonomous)
- 2026-06-11 — bootstrap re-spawn 4: exit 7 recurred on DECISIONS.md because re-spawn 3's brief reset only TASKS.md while iteration 14's pre-spawn commit had also touched DECISIONS.md. Same rationale as re-spawn 3 (the work itself keeps succeeding; failures are state-file drift artifacts, not worker failures). Drift loop closed structurally: the brief now resets ALL protected state files to main, the iteration commits its state changes BEFORE spawning and nothing after, and the next iteration integrates before touching any state file. (autonomous)
