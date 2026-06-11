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
- The code is great and I'm excited to test it. The thing I'm wondering is that when we're done with phase one here Is the UI gonna get an update to make it look a little more professional and polished? Because it does right now kind of just look like a V0 project, which is fine, but I would like to share this with some people, and I don't think it's at that position yet. So, are you aware of that? Are you happy with the design right now and the look of the UI? Do you want to tackle that when we've done phase three? Do you want to tackle it now? I'm curious your answer. But don't begin to make any design tasks until we've both figured this out and discussed it. 
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
