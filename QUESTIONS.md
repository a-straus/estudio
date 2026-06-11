# Questions

<!--
Written by the orchestrator when it hits an escalation boundary (GOAL.md §13)
and cannot proceed without human input.

TO ANSWER:
1. Add your response under the question's "Your answer:" line.
2. Change [PENDING] to [ANSWERED].
3. Save the file. Locally that's enough; in sync mode (ORCH_SYNC=1) you can
   do both steps in the GitHub web editor and commit — the loop pulls before
   every iteration.

No restart needed. The next iteration picks the answer up — typically within
a couple of minutes (the loop slows to 5-minute checks when fully idle). The
orchestrator records the resolution in DECISIONS.md and moves the entry to
## Answered.
-->

## Pending

<!-- Orchestrator writes here when blocked. Answer these to unblock it. -->

### [INFO — no answer required] Phase 1 review checklist (per your "make a list of everything implemented" request)

You asked for "a list of everything that's been implemented and what I need to
work through" so you don't miss checking anything. Here it is. **Nothing here
blocks me** — per your instruction I'm fixing the Phase-1 issues you flagged
and then continuing into Phase 2. Use this as your test plan when you're back;
drop reactions in FEEDBACK.md.

**What Phase 1 ships (all merged, trunk green — 347 tests):**

1. **Ingest** (`/ingest`) — drop a PDF (workbook scans, vision-extracted) or
   paste raw text; language auto-detect/select; pages classified
   (vocab / grammar / other); candidate words → triage.
2. **Triage** (`/triage?source=N`) — know / learn / skip each candidate; batch
   "Keep N"; confirm-time dedupe surfaces collisions (keep/merge).
   *(Being fixed this round: kept word should vanish, post-Keep summary screen,
   Done → go to Review.)*
3. **Library** (`/library`) — all your words; search (accent-insensitive),
   filters, manual add (auto-fills a definition), delete (history retained),
   "I forgot this", provenance on each word.
4. **Review / SRS** (`/review`) — SM-2 spaced repetition; due cards;
   multiple-choice default with flip-card fallback; three grades; "I forgot
   this" demote; cloze questions mixed in from cache.
5. **Quiz** (`/quiz`) — configurable quizzes (def-match / cloze / mixed),
   per-question feedback, cached explanations, results.
   *(Being fixed this round: instant green/red on MC, no Check-Answer click,
   no "I don't know" on MC, show the explanation on a wrong answer, default 10.)*
6. **Grammar** (`/grammar`) — AI-seeded curriculum (categories → topics),
   mastery-derived practice queue, "what your tutor is covering" from your PDFs.
7. **Lessons** (`/grammar/topics/:id/lesson`) — generated lesson (explanation →
   examples → practice), MC / fill-in / conjugation / free-text answering with
   LLM grading + "explain why" on every answer; topic mastery tracked.
8. **System** (`/system`) — LLM spend, job statuses, recent errors, DB backups
   (daily + pre-migration). *(Being added: a Preferences section for
   definition-display + new-cards-per-day.)*
9. **Docs** — `docs/README.md` (clone → run → use on your phone via LAN /
   Tailscale, "where your data lives", backup/restore), `docs/demo.md`,
   `TODO-LATER.md`.

**Known gaps / things I'd specifically check** (most are being fixed now —
see FEEDBACK.md ## Processed for the task each maps to):
- The curriculum is **seeded by a button** on `/grammar`, not automatically.
  This is why "I ingested words and /lesson still doesn't work" (see below) —
  lessons hang off grammar **topics**, and topics come from seeding the
  curriculum + grammar pages in PDFs, not from vocab words.
- Quiz answer pool currently draws only from words you've ingested, so
  definitions can feel repetitive — being widened.
- No global nav bar / home page / footer yet — coming in the design-polish pass
  you authorized.

**Your answer (optional — reactions welcome, but I'm proceeding):**


### [ANSWERED] What is /lesson doing right now? I ingested words and it still doesn't work

> what is /lesson doing right now? Is this is a later phase? I have ingested words and it still doesnt work

**Orchestrator answer:** Not a later phase — lessons shipped (grammar-lessons-quizzes,
merged this run). The reason ingesting **vocabulary words** didn't make `/lesson`
work: lessons are generated per **grammar topic**, and grammar topics come from
**seeding the curriculum** (a button on `/grammar` today) plus grammar pages
detected in PDFs — not from the vocab words you triage. So the path is:
open `/grammar` → "Seed curriculum" → pick a topic → it generates the lesson.
This is also a UX gap I'm closing: the curriculum-seeded-on-first-run vs.
manual-button question (review-03 nit #6) and a clearer empty state, plus the
home/nav work, will make this discoverable instead of a dead end. Flagged in the
Phase-1 review checklist above.

## Answered

<!-- Resolved questions are moved here by the orchestrator for record-keeping. -->

### [ANSWERED] UI visual polish — when and how (human-initiated discussion)

> The code is great and I'm excited to test it. The thing I'm wondering is that when we're done with phase one here Is the UI gonna get an update to make it look a little more professional and polished? Because it does right now kind of just look like a V0 project, which is fine, but I would like to share this with some people, and I don't think it's at that position yet. So, are you aware of that? Are you happy with the design right now and the look of the UI? Do you want to tackle that when we've done phase three? Do you want to tackle it now? I'm curious your answer. But don't begin to make any design tasks until we've both figured this out and discussed it.

**Orchestrator answer (summary):** Gap is real and lives in design/ (tokens.md + components.md), not scattered through code — reviews audited token *conformance*, not aesthetic ambition. Recommended the polish pass at the Phase-1 boundary (upgrade tokens + components → screens inherit → per-screen sweeps), before Phase 2 builds more screens on the V0 look. [Full text in git history.]

**Your answer:**
I like the identity! It's just missing the polish that most sites have like a home page, nav bar, maybe a simple footer. I like https://www.merriam-webster.com/. I'll add that to your egress list. It's a bit too cartoonish and childlike but its a good base, too. Don't change the identity based on merriam webster. To do the design work, imagine you are a designer at apple and want to make this app polished to handoff to your boss.  Take another shot at it.

**Resolution (orchestrator, iteration 55):** Design polish authorized; freeze lifted. Identity (D0/D1) stays. Adding a home/landing page, header nav bar, and simple footer; elevating tokens + components to an Apple-handoff bar; merriam-webster.com used as a *structural* reference only (not its identity — noted too cartoonish). Sequenced after the in-flight Phase-1 bug fixes (same screens/components), then: contract amendment → polish foundation → home/nav/footer → per-screen sweeps. Recorded in DECISIONS.md.

### [ANSWERED] Runtime Anthropic API key for the app's LLM calls

The app's own LLM layer (PDF vision extraction, definitions, quiz generation, …) needs an `ANTHROPIC_API_KEY` at runtime — separate from the worker OAuth token, which only authenticates the build agents. There is no `.env` in the repo yet. Without it, the PDF ingestion pipeline can be built and tested against a mocked provider, but the GOAL.md §15 requirement "validated against the real scans in /docs/fixtures/workbook/" cannot be exercised end-to-end.

Please create `/workspace/.env` (it is git-ignored) containing:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Nothing is blocked in the meantime — pipeline construction proceeds with mocked-provider tests; live validation is queued as its own backlog task.

**Your answer:**
I put it there for you. Build away! You're doing great work i can't wait to see it

### [ANSWERED] Worker auth broken — no API credentials in the container

Every worker spawn failed with `authentication_failed` ("Not logged in", `apiKeySource: none`): no `ANTHROPIC_API_KEY` in the environment, no credentials file, and child `claude -p` processes inherit nothing from the orchestrator session.

**Your answer:** Resolved by action rather than text: commit ac95f66 ("Load credentials from container env file for worker agents") makes `bin/spawn` source `.devcontainer/devcontainer.env` (which provides `CLAUDE_CODE_OAUTH_TOKEN`) inside each worker script. Orchestrator verified on 2026-06-10: `claude -p` with that env file loaded authenticates and responds. Worker spawning is unblocked.
