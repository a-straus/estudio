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

- **arch-critique**: critic pass over ARCHITECTURE.md draft + seeded design contract; findings → CRITIQUE.md; seeded design challenged for feasibility/GOAL conflicts only (spawned: 2026-06-10, `--model "$ORCH_MODEL" --effort high --include GOAL.md --include design`; brief in single quotes)

## Backlog

<!-- Format: - description [priority: Must/Should/Could] -->

- Iteration 2 (after critique integrates): reconcile critique → finalize ARCHITECTURE.md, then decompose GOAL.md Phase 1 into worker-sized backlog tasks — bootstrap+check.sh first, design-foundation (strong model, deep effort), then PDF ingestion (vision path, `claude-fable-5` default, validate against docs/fixtures/workbook/) → SRS review loop → raw text → quizzes → grammar, per §11 order [priority: Must]

Note: `no-design` branch = human sandbox, not a worker branch (see DECISIONS.md); ignore its ORPHAN status in list-agents.

## Done

<!-- Format: - **branch-name**: description (merged: YYYY-MM-DD HH:MM) [task/feature/release done] -->

## Blocked

<!-- Format: - description — REASON — needs: what would unblock it -->

<!-- (empty) — worker-auth blocker resolved 2026-06-10 via commit ac95f66; arch-critique re-spawned, see In Progress -->
