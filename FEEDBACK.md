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
- When you're done with Phase 1, stop and let me review
## Processed

<!-- Moved here by the orchestrator with what it did about each. -->

- 2026-06-10 — Vision-path PDF extraction, default scan-reading model `claude-fable-5` → folded into ARCHITECTURE.md (LLM-layer conventions: per-task model config; `pdf_extraction` task defaults to `claude-fable-5`) and recorded in DECISIONS.md. Validation against `docs/fixtures/workbook/` will be an acceptance criterion on the Phase 1 PDF-ingestion task when the backlog is decomposed (iteration 2 of the first-iterations protocol).
