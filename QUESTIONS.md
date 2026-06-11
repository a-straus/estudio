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

- what is /lesson doing right now? Is this is a later phase? I have ingested words and it still doesnt work

## Pending

<!-- Orchestrator writes here when blocked. Answer these to unblock it. -->

### [PENDING] UI visual polish — when and how (human-initiated discussion)

> The code is great and I'm excited to test it. The thing I'm wondering is that when we're done with phase one here Is the UI gonna get an update to make it look a little more professional and polished? Because it does right now kind of just look like a V0 project, which is fine, but I would like to share this with some people, and I don't think it's at that position yet. So, are you aware of that? Are you happy with the design right now and the look of the UI? Do you want to tackle that when we've done phase three? Do you want to tackle it now? I'm curious your answer. But don't begin to make any design tasks until we've both figured this out and discussed it.

**Orchestrator answer:**

Honest assessment: yes, I'm aware, and no, I wouldn't call the current look "done." Everything was built with strict token/component discipline against the seeded design contract, and the reviews audited *conformance* (no raw values, component reuse, microcopy) — but conformance to a functional-first contract produces exactly what you're seeing: clean, consistent, V0. The contract's tokens and components were scoped to "usable on your phone," not "shareable." So the gap you're seeing is real and it lives in design/ (tokens.md + components.md), not scattered through the code — which is the good news.

My recommendation: **do the polish pass at the Phase-1 boundary — i.e., right after your upcoming Phase-1 review, before Phase 2 build starts.** Two reasons:

1. **It's cheapest now.** Because every screen composes the token stylesheet and shared component library, a polish pass is mostly: upgrade tokens.md (type scale, spacing rhythm, color depth, elevation, motion) + restyle the ~15 base components, and the seven existing screens inherit it. Per-screen sweeps after that are small. Waiting until Phase 3 means Ask/Lessons/Suggestions get built on the V0 look and retrofitted later — more screens to sweep, same work plus rework.
2. **It matches your goal.** You want to share Phase 1 with people; Phase 1 *is* the screens that need to look good.

What I need from you to do it well (drop answers here or in FEEDBACK.md after you've played with the app):
- Which screens feel worst / matter most to show people?
- Any reference apps whose look you'd point at (e.g. Duolingo's warmth, Anki's density, Linear's restraint)? One or two anchors beat adjectives.
- Whether the seeded identity (design/INDEX.md D0/D1 — its personality and principles) still feels right, or whether the polish pass may evolve it. Replacing it wholesale is your call, not mine; evolving within it I can do.

Sequencing if you agree: you do the Phase-1 review (that [PENDING] post is coming once review-03 + docs-and-demo land) → your reactions + the answers above become the polish contract amendments → one strong-model design-polish foundation task (tokens + components) → quick per-screen sweeps → then Phase 2, built against the upgraded contract.

Until you reply here, I'm queuing **no** design tasks, as you asked.

**Your answer:**
I like the identity! It's just missing the polish that most sites have like a home page, nav bar, maybe a simple footer. I like https://www.merriam-webster.com/. I'll add that to your egress list. It's a bit too cartoonish and childlike but its a good base, too. Don't change the identity based on merriam webster. To do the design work, imagine you are a designer at apple and want to make this app polished to handoff to your boss.  Take another shot at it.
## Answered

<!-- Resolved questions are moved here by the orchestrator for record-keeping. -->

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
