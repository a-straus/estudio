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

### [PENDING] Worker auth broken — no API credentials in the container

Every worker spawn fails instantly with `authentication_failed` ("Not logged in · Please run /login", `apiKeySource: none`). Verified directly: `echo 'say ok' | claude -p` fails the same way, so this is the container environment, not a flaky worker — there is no `ANTHROPIC_API_KEY` in the environment and no `~/.claude/.credentials.json`. The orchestrator session itself is authenticated through its own SDK entrypoint, but child `claude -p` processes inherit nothing.

This blocks ALL worker-based progress (the iteration-1 arch-critique spawn died; its branch was abandoned and the task parked under TASKS.md ## Blocked). Orchestrator-side work (ARCHITECTURE.md draft, design adoption, feedback processing) is done and committed.

Fix options I can see — this is your infrastructure, so it's your call:
1. Provide `ANTHROPIC_API_KEY` to the container via the docker `--env-file` mechanism your recent commits reference ("Container secrets via docker --env-file"), then restart the loop.
2. Or run an interactive `claude /login` inside the container so a credentials file exists for child processes.

I am not touching the devcontainer/firewall config per the hard rules. Once credentials are present, the next iteration re-spawns arch-critique automatically (re-spawn command recorded in TASKS.md ## Blocked).

**Your answer:**

## Answered

<!-- Resolved questions are moved here by the orchestrator for record-keeping. -->
