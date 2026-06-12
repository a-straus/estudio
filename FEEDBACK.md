# Feedback

<!--
Your inbox to the orchestrator — the steering channel for everything that
does not change what the product IS (that's GOAL.md, which only you edit).

Add items under ## Inbox any time — while it runs or between runs. Bugs,
tweaks, "make this better", feature asks within scope. Locally: edit and
save. Remote (ORCH_SYNC=1): edit on GitHub and commit.

Every iteration the orchestrator empties the inbox: each item becomes
prioritized backlog tasks (or a schema-gate cycle if it touches the data
model), then moves to ## Processed with a disposition note. Items that
would cross a GOAL.md §3 non-goal are escalated to QUESTIONS.md instead of
silently acted on or ignored. The loop will not declare Release done while
the inbox is non-empty.

Altitude guide:
  "the conjugation drill should shuffle answers"     → here
  "add a listening-comprehension mode"               → here (becomes an epic)
  "the product should also teach French"             → GOAL.md (changes the goal)
-->

## Inbox

<!-- - one item per dash; date them if you like -->
- we need a hamburger menu or something to nav on mobile
- navbar disappears on /review
- the 'i forgot' button that pops up is on top of the LEARNING text on /library. It should be horizontally on the side
## Processed

<!-- Moved here by the orchestrator with what it did about each. -->

- 2026-06-11 (iteration 55) — **MASTER DIRECTIVE** "if this is still here, continue into phase 2 … fix the issues … make a list of things to review … then continue phase 2 as much as you can" → Acted on: this supersedes the Phase-1 freeze gate (DECISIONS.md). The 12 issue items below are converted to a prioritized Phase-1-fix backlog (ahead of Phase 2); a Phase-1 review checklist is posted in QUESTIONS.md ("[INFO] Phase 1 review checklist"); Phase 2 spawning is unblocked and resumes once the flagged fixes are in flight / capacity frees.
- 2026-06-11 — "real progress bar on PDF page reading + curriculum building" → **ingestion-progress-and-topic-link** task (per-page / per-topic progress reported by the jobs and rendered on Ingest + Grammar; also fixes review-03 nit#3 90%-stall). [Should]
- 2026-06-11 — "after 'learn' the word should disappear; possible second-word-skipped bug; horrible post-Keep screen; Done should go to Review; /triage?source=1 isn't a proper redirect" → **triage-fixes** task (spawned this iteration). [Must]
- 2026-06-11 — "we need a header nav bar" + "the / url should be navigable, not open to what it does" → folded into the authorized **design polish**: a home/landing overview + global **home-nav-footer** task. [Must — after fixes land]
- 2026-06-11 — "/library mobile: missing the horizontal divider between all/learning in the 2×2 select control" → **library-mobile-separator** task (SegmentedControl row divider on mobile wrap). [Should — trivial]
- 2026-06-11 — "wrong-reason takes too long to generate; use a smaller/faster model — sonnet low thinking, fable is overkill" → **lesson-grading-fixes** (spawned): quiz_grading LLM task → sonnet at low effort; consider streaming/pre-generation. [Must]
- 2026-06-11 — "notes section on answers (correct or incorrect) that the app later uses as context when generating quizzes" → **notes-on-answers** NEW FEATURE; needs a `note` table → routed through the schema gate. [Should — Phase-1 polish, schema-gated]
- 2026-06-11 — "free-response grading sometimes returns an answer unrelated to what I wrote; should consider what the user said; if I'm 'close', figure out the correct way to say what I meant" → **lesson-grading-fixes** (spawned): grading prompt must ground on the user's actual answer + add a "close → here's how you'd say it" rephrase (ties to review-03 S7 Partly-right tier). [Must]
- 2026-06-11 — "/quiz MC should color green/red instantly on click (no Check-Answer button); remove the 'I don't know' option on MC" → **quiz-ux-fixes** (spawned). [Must]
- 2026-06-11 — "/quiz answer pool is limited to ingested content; build a wider bank at generation time so definitions aren't repetitive" → **quiz-caching-and-bank** task (ties to review-03 S1 cache-reuse + nit#10 distractor quality). [Must]
- 2026-06-11 — "lag between 'check answer' and the color is too long; should be instantaneous" → **quiz-ux-fixes** (spawned): MC correctness decided client-side and colored immediately; persistence happens async. [Must]
- 2026-06-11 — "I need a list of everything implemented + what to work through at a checkpoint" → satisfied now by the **Phase-1 review checklist** in QUESTIONS.md; will be regenerated at each future checkpoint. [done this iteration]

- 2026-06-11 — "When you're done with Phase 1, stop and let me review" → Phase-1 review gate recorded in TASKS.md and DECISIONS.md: once the Phase-1 Musts (grammar-lessons-quizzes, review-03, docs-and-demo) are done and trunk is green, the orchestrator posts a [PENDING] "Phase 1 ready for your review" entry in QUESTIONS.md and spawns no Phase-2 work until you answer. (iteration 51)

- 2026-06-10 — Vision-path PDF extraction, default scan-reading model `claude-fable-5` → folded into ARCHITECTURE.md (LLM-layer conventions: per-task model config; `pdf_extraction` task defaults to `claude-fable-5`) and recorded in DECISIONS.md. Validation against `docs/fixtures/workbook/` will be an acceptance criterion on the Phase 1 PDF-ingestion task when the backlog is decomposed (iteration 2 of the first-iterations protocol).
