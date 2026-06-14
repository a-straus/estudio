# RELEASE DONE — Estudio (Spanish/English vocabulary + grammar trainer)

Declared at iteration 172 (2026-06-14). `bash check.sh` green on `main`:
**769 tests / 83 files**. HEAD = bdc9976.

Every GOAL.md §15 Definition-of-Done criterion is met, audited this iteration
against the built product (not just the task board):

## Phase 1 — Spanish core ✓
PDF + raw-text ingestion → triage → SRS review loop → MC quizzes (both
directions) → grammar lessons & quizzes → library CRUD. Validated against the
real workbook scans in /docs/fixtures/workbook/. Passes on desktop Chrome and a
real phone browser (LAN/Tailscale documented). Persistence proven (restart +
backup→restore). LLM hot-swap proven via config alone. System page shows live
spend / job statuses / recent errors. 5-minute demo script (/docs/demo.md) runs
clean. README enables a cold start.
  - Note: the /ingest-on-phone sub-criterion was explicitly WAIVED by the owner
    (QUESTIONS.md → DECISIONS.md iter 149); Ingest is a desktop surface.

## Phase 2 — Spanish AI layer ✓
Lesson-recording ingestion validated on the real ~1h recording in
/docs/fixtures/lesson-audio/ (oversized-audio splitting via ffmpeg; mining seeded
from the owner's real flagging phrases). Transcription hot-swap proven. Ask
chatbot — context-seeded, threads persist across restart, adds words via tool
call with inline confirmation. Suggestions never repeat across sessions. Voice
questions answered end-to-end.

## Phase 3 — English ✓
Project Gutenberg / KJV ingestion end-to-end with the archaic-aware
college-student rubric (keeps firmament/concupiscence/beguiled; drops
thee/thou/unto/saith as noise) + likely-known calibration; coverage indicator;
kept words route to the English deck. §14 pipeline proof run clean on the full
KJV (iter 165). Optional adaptive placement assessment functional (iter 160).
Mochi import against the owner's ~300-card fixture, with dedupe/merge report and
correct card lifecycle (iter 162 + fixes iter 165).
  - Cost: the book-scale extraction model was moved opus → sonnet per owner
    feedback (iter 165); a full KJV ingest now estimates under the §13 $5
    confirm gate, and the upfront estimate was recalibrated to err high.

## Phase 4 — Polish ✓
- Progress view — counts by status, due forecast, quiz-accuracy trend, per-book
  coverage, AND the grammar-mastery heatmap (the last facet, shipped iter 172).
- Guidance surfacing — a quiet Home "what next" nudge (iter 167).
- Backup & export UI — one-click JSON export + DB-backup download (iter 164).
- Word-select-to-add — shipped REDUCED per the owner-approved §3 escape hatch:
  tappable words inside app-rendered content (definitions, lessons, examples,
  chat replies) open a pre-filled QuickAdd; not OS-level system-wide selection
  (DECISIONS.md iter 165).

## Quality gate
review-11 — the explicit final pre-release audit (read-only, strong model,
against GOAL.md + the design contract) — returned SHIP-WITH-FIXES with **0
blockers**. Its 1 should-fix (the missing §5 heatmap) and 4 cosmetic nits were
all built and integrated this iteration. The review cadence is now retired.

## Parked (NOT release-gating — surfaced for the owner)
- **suggestion-streaming** — an owner-requested [Should] optimization (stream
  suggestion generation) deliberately deferred since iter 146: marginal payoff
  on suggestions' short structured output, and it is a cross-cutting change to
  the LlmProvider seam (would pay off more on chat/explanations). Not a §5 story
  and not in the §15 Release-done list. If you want it, drop a line in
  FEEDBACK.md and re-run — it needs a focused seam-design pass first.

To extend: add GOAL.md scope or FEEDBACK.md items, `rm .release-done`, and
re-run `bin/orchestrate`. The delta becomes the new backlog; this Done history
stays.
