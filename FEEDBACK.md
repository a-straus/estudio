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

- 2026-06-10 — PDF processing must go through the vision path (GOAL §6.1 already mandates the vision-capable LLM, no OCR step). Model preference for the scan-reading task: Anthropic reports Claude Fable 5 (`claude-fable-5`) is strong at vision — default the app's PDF-extraction LLM config to a Fable-class model and validate it against the fixtures in `docs/fixtures/workbook/`. This is the app's `LlmProvider` config, not the worker/orchestrator models.

## Processed

<!-- Moved here by the orchestrator with what it did about each. -->
