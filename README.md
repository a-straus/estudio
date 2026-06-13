# claude-sandbox

> **Looking for the app?** This repo's workspace contains **Estudio**, the
> Spanish/English vocabulary + grammar study app currently under construction by
> the orchestrator below. For app setup, run, phone access, backups, and a demo
> script, see **[docs/README.md](docs/README.md)**. The rest of this file
> documents the orchestration sandbox that builds it, not the app.

An autonomous AI orchestration environment. You define a product goal; the
orchestrator decomposes it into tasks, spawns parallel worker agents to build
them, integrates the results, and loops until done — with a clear channel back
to you when it needs a decision. Designed for true walk-away operation,
including on a remote server you only touch over SSH.

---

## How it works

```
You fill in GOAL.md
        ↓
orchestrate /workspace/projects/yourproject
        ↓
A bash loop runs one headless orchestrator iteration at a time:
  claude -p "<one pass>"  →  reads GOAL/TASKS/QUESTIONS/DECISIONS + list-agents
                          →  integrates finished branches (gated by check.sh)
                          →  spawns headless workers (own branch + worktree each)
                          →  escalates to QUESTIONS.md when GOAL.md §13 says so
                          →  updates TASKS.md, commits state, exits
        ↓
Loop sleeps, backs off when idle, re-invokes — until GOAL.md §15 is met
(.release-done) or you touch STOP
```

Two properties make this survive long runs:

- **All state lives in files and git, none in a session.** Every iteration
  starts fresh and reconstructs the picture from `GOAL.md`, `TASKS.md`,
  `QUESTIONS.md`, `DECISIONS.md`, and `list-agents`. Crashes, container
  restarts, and context limits cannot lose the plot — the loop just picks up
  where the files say it was.
- **Workers signal completion with files, not process state.** Each worker is
  a headless `claude -p` run that commits its work and exits; a wrapper drops
  a `.worker-done` marker. `integrate` refuses to merge anything unverified:
  no marker, a committed `BLOCKED.md`, no commits, modified state files, or a
  red `check.sh` all block the merge with a reason the orchestrator acts on.

### Design first: two minds, then a locked architecture

Before any feature work, the first two iterations are a design phase: the
orchestrator drafts `ARCHITECTURE.md` from your GOAL.md §8 (entities,
relationships, conventions) — and, when the product has a UI, settles
the design contract in `design/` in the same pass (see below) — then spawns a **fresh-context
critic on the strong model** whose only job is to attack the draft — missing
entities, scope creep, simpler alternatives. The orchestrator reconciles the
critique, records contested calls in `DECISIONS.md`, and only then decomposes
the backlog. Two minds, one uncontaminated by the other's assumptions.

### The design contract (design/)

`design/` is to the UI what `ARCHITECTURE.md` is to the data model: the
contract that keeps N parallel workers building one product instead of
N products. It is a directory of templates — `INDEX.md` (identity,
principles, file map), `tokens.md` (**design tokens**), `screens/` (one
file per screen), `components.md`, `interaction.md` (microcopy),
`mockups.md` — split into files so each worker loads only the sections its
task needs instead of the whole spec. Three ways to use it:

- **You have a design** → fill the files (or paste a spec covering the same
  sections) before starting. It becomes the law for everything user-facing.
- **UI product, no design** → leave the template unfilled; the orchestrator
  drafts every section in the design phase and you review it at the
  first-hour checkpoint alongside ARCHITECTURE.md.
- **No UI** → ignore it; it stays inert.

How it stays in sync with the build, without ceremony: the first UI task
(strong model, deep effort) materializes the token block verbatim as the
project's stylesheet and builds
the base components; later briefs name the design files they implement;
workers
compose tokens and components, and **extrapolate from the identity and
principles for anything the contract doesn't specify** — they are never blocked
on a missing definition and you are never asked to approve a component. The
orchestrator is the file's only writer after the draft: it folds genuinely
new components and tokens back in as they land, with a change-log line each,
so the contract and the product never drift more than an iteration apart.
Mechanically enforced like everything else: `integrate` refuses any worker
branch that touches `design/`. Steer the design the usual way — small
changes via
`FEEDBACK.md`, identity-level changes by editing the `design/` files
yourself between runs.

> **No frontend at all?** The `no-design` branch is this same sandbox with
> the design machinery stripped out entirely — clone from it for
> backend-only projects.

### Worker context isolation

Workers get all of the code and none of the orchestration context. `spawn`
gives each worktree a sparse checkout that drops `CLAUDE.md`, `GOAL.md`, the
state files (TASKS/QUESTIONS/DECISIONS/FEEDBACK), and `design/`; the
orchestrator grants back exactly the files a brief names with
`spawn --include <path>` — the named design files for a UI task, `GOAL.md`
plus all of `design/` for reviewers and the critic. The brief is a worker's
whole instruction set; what it doesn't name isn't in the tree to wander into.

Source code is deliberately **never** excluded. Files sitting in a worktree
cost no context until the model chooses to read them, a frontend worker
being able to read the backend interface it imports against prevents bad
commits, and `check.sh` has to run on the full tree. If worker token usage
ever shows agents reading far outside their task, per-directory excludes
would be the next lever — not before.

### The schema gate

The data model is the one piece of state every task shares, so changes to it
are serialized — **one model change in flight, ever, applied while nothing
else runs**:

1. A worker that needs a schema change doesn't make it — it commits a
   `BLOCKED.md` starting with `type: model-change` and exits.
2. The orchestrator stops spawning, lets running workers finish, and
   integrates them (drain).
3. It then decides the request **on its own authority** against GOAL.md and
   ARCHITECTURE.md — you are not asked.
4. If approved: ARCHITECTURE.md is updated, and a single strong-model task
   applies the migration + adapts all affected code, alone, gated by
   check.sh.
5. Work resumes; re-spawned workers get briefs quoting the new model.
   Queued change requests go one per cycle, each re-justified against the
   post-change world.

Enforcement is mechanical, not aspirational: `integrate` refuses any worker
branch that touches ARCHITECTURE.md (or any other state file).

### When does it ask you questions?

Almost never — that's the contract. Technical and data-model decisions are
delegated to the orchestrator and logged in `DECISIONS.md` for you to audit
asynchronously. `QUESTIONS.md` is reserved for GOAL.md §13 triggers only: a
non-goal would be crossed, a genuinely irreversible one-way door (data loss,
external contracts, paid dependencies), or GOAL.md contradicting itself. The
better you fill §3/§8/§11/§13, the closer questions get to zero.

### Who runs on what

| Role | Default | Knobs |
|------|---------|-------|
| Orchestrator iterations (routine) | `opus` at `max` effort | `ORCH_MODEL`, `ORCH_EFFORT` |
| Orchestrator iterations (design phase, schema gate) | `opus` at `high` effort | `ORCH_DESIGN_EFFORT` |
| Trivial tasks (1–2 files, mechanical) | `sonnet` — routed per task | `spawn --model sonnet` |
| Routine feature workers | `opus` at `medium` effort | `WORKER_MODEL`, `WORKER_EFFORT` |
| Reviews | `opus` at `max` effort — routed per task | `spawn --model "$ORCH_MODEL" --effort medium` |
| Trunk fixes, hard tasks, architecture | `opus` at `high` effort — routed per task | `spawn --model "$ORCH_MODEL" --effort high` (`xhigh` for the deepest) |

> **FABLE-DISABLED (2026-06-13):** `fable` was the top tier for the design
> phase, schema gate, and hardest tasks. Anthropic disabled `claude-fable-5`
> (U.S. government directive), so those rows route to `opus` (the strongest
> model still available). Restore `fable` here when it returns — see
> `DECISIONS.md` (iteration 149).

The orchestrator decides the routing; the loop just passes the flags. Effort
levels (`low|medium|high|xhigh|max`) set thinking depth per invocation. The
budget tiering when opus workers burn too hot: `WORKER_MODEL=sonnet
WORKER_EFFORT=max`.

---

## One-time setup

### 1. Create a dedicated GitHub account for the agent

The agent will commit code and push state. Give it its own identity so its
activity is clearly attributed and its permissions are independently scoped.

1. Create a new GitHub account — e.g. `yourname-agent`
2. On that account: **Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token**
   - Resource owner: the org or user whose repos the agent will work on
   - Repository access: only the specific repos you want it to touch
   - Permissions needed: **Contents** (read/write), **Pull requests**
     (read/write), **Metadata** (read-only). Optionally **Issues**
     (read/write) if you want question notifications via `gh issue create`.
3. Copy the token — you won't see it again

You'll paste it into the env file in step 2.

### 2. Fill in the container env file

All identity and secrets enter the container through one gitignored file,
read by Docker at container creation (`--env-file`) — no host shell exports,
nothing depending on how VS Code was launched. macOS gotcha this avoids:
`~/.zshrc` exports never reach Dock-launched apps, so `${localEnv:...}`
silently bakes empty values into the container.

```sh
cp .devcontainer/devcontainer.env.example .devcontainer/devcontainer.env
$EDITOR .devcontainer/devcontainer.env
```

Fill in:

- `GIT_AUTHOR_NAME` / `GIT_AUTHOR_EMAIL` / `GIT_COMMITTER_NAME` /
  `GIT_COMMITTER_EMAIL` — the agent account's identity
- `GH_TOKEN` — the token from step 1 (`gh` and git-over-HTTPS use it; on
  every container start `gh auth setup-git` wires it into git automatically)
- `CLAUDE_CODE_OAUTH_TOKEN` — a long-lived subscription token: run
  `claude setup-token` on the host and paste the result

Changed the file later? **Rebuild the container** — it's read at creation.

> **Prefer API billing?** Leave `CLAUDE_CODE_OAUTH_TOKEN` empty and add
> `ANTHROPIC_API_KEY=...` to the env file instead. `api.anthropic.com` is
> already allowlisted, and the loop's `MAX_COST_USD` ceiling becomes
> meaningful.

### 3. Open the container

```sh
# VS Code
code .   # → "Reopen in Container" when prompted

# OR headless (laptop or server)
npm i -g @devcontainers/cli
devcontainer up --workspace-folder .
devcontainer exec --workspace-folder . zsh
```

First build: a few minutes. The container keeps running after you disconnect
(`"shutdownAction": "none"`), so tmux sessions survive. First creation also
seeds the Claude config (`seed-claude-config.sh`) so no agent ever stalls on a
first-run dialog — fresh sandboxes are fully headless-operable.

Verify inside the container:

```sh
claude -p "say ok"   # proves auth works end-to-end, no dialogs
gh auth status       # should show yourname-agent, not your personal account
git config user.name # should show yourname-agent
```

---

## Starting a project

### Step 1 — Clone your project inside the container

```sh
git clone https://github.com/you/yourproject /workspace/projects/yourproject
```

`/workspace` is this repo folder bind-mounted from the host, so the clone is
visible (and editable) on the host too; `/projects/` is gitignored so it never
pollutes the sandbox repo. Worker worktrees live elsewhere (`~/worktrees`,
container-local) — workers never inherit the orchestrator's CLAUDE.md.

### Step 2 — Fill in GOAL.md

The single source of truth for what to build. Copy the template in and edit:

```sh
cp /workspace/GOAL.md /workspace/projects/yourproject/GOAL.md
```

The sections marked ★ are required for autonomous operation — `orchestrate`
refuses to start while they're empty:

| Section | What to write | Why it matters |
|---------|--------------|----------------|
| §3 Non-goals | What you are NOT building | Without this the orchestrator expands scope forever |
| §5 User stories | As a / I want / so that + acceptance criteria | Defines what "task done" looks like for workers |
| §6 Functional requirements | What the system must do, grouped by feature | The backlog source |
| §8 Tech constraints | Stack, architecture, hard limits | Workers make every implementation decision based on this |
| §11 Tradeoff rules | Speed vs polish, build vs reuse, etc. | Resolves ambiguity without asking you |
| §12 Quality bar | What "acceptable" and "good" look like | Injected into every worker's brief |
| §13 Escalation boundaries | When to stop and ask vs proceed | The most important section for unsupervised runs |
| §15 Definition of done | Task / Feature / Release done criteria | The loop stop condition |
| §17 Open questions | What's still unknown | The orchestrator weighs these instead of silently assuming |

> Every section of the template carries inline guidance and examples.
> Anything you leave vague, the agent fills with the most generic plausible
> answer — make the implicit explicit.

**GOAL.md is read-only for every agent.** The orchestrator commits it once at
adoption and the loop keeps it `chmod 444` as a tripwire; `integrate` refuses
any worker branch that modifies it; an agent that wants the plan changed must
ask you in QUESTIONS.md. When *you* edit it locally: `chmod u+w GOAL.md`,
edit, commit. In sync mode, just edit it on GitHub — the loop pulls it.

**Optional — bring a design.** If the product has a UI and you care how it
looks, also copy in and fill the `design/` templates (identity, tokens,
screens, components, microcopy):

```sh
cp -R /workspace/design /workspace/projects/yourproject/design
```

Whatever you leave unfilled, the orchestrator designs in the first iteration
— see "The design contract" above.

### Step 3 — Start the orchestrator

```sh
cd /workspace/projects/yourproject
orchestrate                     # relaunches itself into tmux session "orchestrator"
```

Useful variants:

```sh
WORKER_MODEL=sonnet WORKER_EFFORT=max orchestrate   # cheaper workers, deepest thinking
ORCH_SYNC=1 orchestrate                             # remote mode: sync via origin
MAX_ITERATIONS=30 MAX_COST_USD=25 orchestrate       # bounded experiment
orchestrate --fg                                    # run in the foreground (debugging)
```

All knobs are documented at the top of `bin/orchestrate`. Preflight checks
(filled GOAL.md, git identity, gh auth, claude present) fail fast and loudly
— before the run, not three hours into it.

### Step 4 — Watch, pause, resume

```sh
tmux attach -t orchestrator   # the loop: one status block per iteration
tmux attach -t agents         # live workers, one window per branch
list-agents                   # branch states: RUNNING/FINISHED/BLOCKED/FAILED/STALE/ORPHAN
```

State files update in real time — `TASKS.md` is the live board,
`DECISIONS.md` the log of resolved questions. Full transcripts land in
`logs/`: `logs/<branch>.<ts>.jsonl` per worker, `logs/orchestrator/iter-N.json`
per iteration (each contains a `session_id` — replay any iteration with
`claude --resume <id>`).

- **Pause:** `touch STOP` in the project dir — the loop exits cleanly after
  the current iteration. Resume: `rm STOP` and re-run `orchestrate`.
- **Budgets:** the loop stops at `MAX_ITERATIONS` or `MAX_COST_USD`;
  re-running continues from file state. Re-running is always safe — that's
  the point of the design.
- **Done:** when GOAL.md §15 is fully met (and your FEEDBACK.md inbox is
  empty) the orchestrator writes `.release-done` and the loop exits with a
  summary.

---

## The first hour

Don't start unbounded. Start with the design phase only:

```sh
MAX_ITERATIONS=3 orchestrate          # draft → critique → reconcile, then stops
```

That gives you a built-in human checkpoint at the moment of highest
leverage, before any product code exists. Read these files:

- `ARCHITECTURE.md` — is the design sane? Are the conventions what you'd pick?
- `design/` (UI products) — is the visual identity yours? Tokens, screens,
  components specified the way you'd want them built?
- `DECISIONS.md` — were the contested calls between drafter and critic reasonable?
- `TASKS.md` — is the backlog actually your product, sliced sensibly?

Happy? `orchestrate` again with a real budget — re-running always continues
from file state. Not happy? Edit GOAL.md (`chmod u+w` first) or drop notes
in `FEEDBACK.md`, then re-run; the next iteration folds them in.

**What you should see, in order:** the state-adoption commit → iteration 1
commits ARCHITECTURE.md (and design/, for UI products) and an
`arch-critique` window appears → iteration 2
integrates the critique and fills the backlog → up to 3 worker windows →
`check.sh` lands → the first `Integrate:` merge → check stays green.

**Where to look while it runs:**

```sh
tmux attach -t orchestrator      # one narrated status block per iteration
git log --oneline                # ground truth: Integrate: merges landing
list-agents                      # branch states at a glance
tmux attach -t agents            # live worker streams
tail -f logs/<branch>.*.jsonl    # a specific worker's full transcript
```

**Warning signs:** consecutive `FAILED` iterations in `logs/orchestrator.log`
(read the matching `iter-N.err`), the same branch re-spawned 3+ times, an
unnoticed `[PENDING]` in QUESTIONS.md. And remember **quiet ≠ dead**: when
nothing changes the loop backs off to 5-minute sleeps — check the last
timestamp in `orchestrator.log` before assuming a hang. To intervene:
`touch STOP`, investigate, fix, `rm STOP`, re-run.

---

## Steering it

Three channels, by altitude — pick the one that matches the change:

| You want to… | Channel | What happens |
|---|---|---|
| Change what the product *is*: new scope, new stories, new definition of done | **GOAL.md** (yours alone; `chmod u+w` locally, or edit on GitHub in sync mode) | Next iteration re-decomposes the delta into the backlog |
| Fix, tweak, or extend within current scope ("shuffle the quiz answers", "add a streak counter") | **FEEDBACK.md → `## Inbox`** | Each item becomes prioritized backlog tasks next iteration, then moves to `## Processed` with a note. Schema-touching items go through the schema gate; non-goal-crossing items come back as questions |
| Answer something it asked | **QUESTIONS.md** | Flip to `[ANSWERED]`, next iteration proceeds |

**After a release** ("v1 works — then what?"): add the next wave to GOAL.md
and/or FEEDBACK.md, `rm .release-done`, re-run `orchestrate`. The Done
history stays; the delta becomes the new backlog. GOAL.md is versioned in
git, so v2 of the product is literally v2 of the file.

---

## Running on a remote server (SSH-only)

The intended end state: the sandbox runs on a server, you check in from
anywhere, and GitHub is the dashboard.

1. On the server: clone this repo, fill in
   `.devcontainer/devcontainer.env` (setup §2), `devcontainer up
   --workspace-folder .`
2. Inside the container, clone the project and push-capable remote, then:

   ```sh
   ORCH_SYNC=1 orchestrate /workspace/projects/yourproject
   ```

3. Disconnect. With `ORCH_SYNC=1` the **outer loop** (deterministic bash, not
   the model) does `git pull --rebase` from origin before every iteration and
   pushes state + integrated work after every iteration. That means, from any
   browser:
   - **Watch progress:** read `TASKS.md` / `DECISIONS.md` / commit history on GitHub
   - **Answer questions:** edit `QUESTIONS.md` in the GitHub web editor
     (write the answer, flip `[PENDING]` → `[ANSWERED]`, commit) — the next
     iteration pulls it and proceeds
   - **Change the plan:** edit `GOAL.md` the same way — yours is the only
     hand that ever touches it
4. SSH in for anything deeper: `tmux attach -t orchestrator`, `tail -f logs/…`,
   `touch STOP`.

Logs deliberately stay out of git (multi-MB transcripts per worker would
bloat the repo); they live on the server's disk under `logs/`.

---

## Answering the orchestrator's questions

When the orchestrator hits a decision it cannot make autonomously (a one-way
door, a missing design constraint, a non-goal boundary, or anything that
would require changing GOAL.md), it writes to `QUESTIONS.md` and pauses that
line of work — other independent tasks continue:

```markdown
### [PENDING] Which auth approach?
The task requires auth but GOAL.md §8 doesn't specify OAuth2 vs API keys.
Options: (a) OAuth2 with refresh tokens, (b) short-lived API keys, (c) both.

**Your answer:**
```

To respond: write your answer, change `[PENDING]` to `[ANSWERED]`, save (and
commit, if you're editing via GitHub in sync mode). The next iteration reads
it, records the decision in `DECISIONS.md`, and resumes. If everything is
blocked on you, the loop polls cheaply in bash — no tokens burned while it
waits.

---

## File reference

| File | Who owns it | Purpose |
|------|-------------|---------|
| `GOAL.md` | You | Product vision, constraints, autonomy rules — **read-only for all agents** |
| `TASKS.md` | Orchestrator | Live task board — committed, don't edit during a run |
| `QUESTIONS.md` | Shared | Orchestrator asks; you answer |
| `FEEDBACK.md` | Shared | You ask; orchestrator acts — your steering inbox for changes within scope |
| `DECISIONS.md` | Orchestrator | One line per resolved decision — its durable memory |
| `ARCHITECTURE.md` | Orchestrator | The technical design: entities, conventions, boundaries. Amended only through the schema gate |
| `design/` | You (seed) / Orchestrator | The UI design contract, one file per concern (identity/principles, tokens, screens, components, microcopy). Fill it if you have a design; otherwise drafted in the design phase and kept in sync as the build evolves. Workers read only the files their brief names and never modify any of it |
| `check.sh` | Orchestrator | The project's build+test gate; `integrate` runs it before every merge |
| `CLAUDE.md` | Sandbox | The canonical iteration spec — loaded automatically every iteration |
| `bin/orchestrate` | — | Preflight + the outer loop |
| `bin/spawn` | Orchestrator | Launch a headless worker (`--model` to route harder tasks, `--include` to grant context files into its tree) |
| `bin/integrate` | Orchestrator | Gate + merge a finished branch (refuses unverified work) |
| `bin/abandon` | Orchestrator | Discard a branch without merging |
| `bin/list-agents` | — | Classify every worker branch and what it needs |
| `bin/usage` | You | Read-only token/cost report over `logs/`: per iteration, per worker run, totals, per-model rollup |
| `bin/agent` | You | Freeform interactive Claude session in tmux |
| `bin/_lib.sh` | — | Shared helpers (worktree paths, markers, fingerprints) |

Runtime artifacts (`logs/`, `STOP`, `.release-done`, `.worker-*`,
`.orchestrator.pid`) are kept out of git via `.git/info/exclude`,
re-applied automatically on every `orchestrate` start.

> **Context isolation:** `README.md` is listed in `.claudeignore` — Claude
> does not read it. It is for humans only.

---

## Firewall

The container blocks all outbound traffic except:

- GitHub (API, git over HTTPS, web)
- npm registry
- Anthropic API / claude.ai
- VS Code marketplace

There is deliberately **no SSH egress** — git runs over HTTPS via the `gh`
credential helper, and an open port 22 to anywhere would be a generic tunnel
out of an otherwise allowlisted box.

The allowlist pins IPs at resolution time and CDN IPs rotate, so the loop
re-runs the firewall script every `FIREWALL_EVERY` (default 10) iterations.
If networking misbehaves in a shell, re-apply manually:
`sudo /usr/local/bin/init-firewall.sh`

To allow another host (PyPI, a private registry, etc.), add it to the
`for domain in` list in `.devcontainer/init-firewall.sh` and rebuild.

Verify inside the container:

```sh
curl https://example.com          # blocked — should fail
curl https://api.github.com/zen   # allowed — should return a zen quote
```

---

## Verifying web apps

The image ships a system Chromium (`CHROME_PATH=/usr/bin/chromium`) so
workers can actually *run* what they build: Playwright/Puppeteer are
configured via env to skip their own browser downloads (their CDNs aren't
allowlisted) and use the system binary — point Playwright at it with
`executablePath: process.env.CHROME_PATH`. Encourage verification in GOAL.md
§12: workers are already instructed that a clean compile is not proof.

---

## Reset

`/workspace` is a bind mount of this repo folder on the host — **rebuilding
the container does not delete your projects** (that's also what makes
crash-resume work). What lives where:

- Project clones (`/workspace/projects/...`): host disk — survive rebuilds.
  Throw one away with `rm -rf /workspace/projects/yourproject`
- Worker worktrees (`~/worktrees`): container disk — wiped by a rebuild;
  `orchestrate` prunes the stale references and `list-agents` reports the
  affected branches as ORPHAN for re-spawning
- Claude config/auth: named volume — survives rebuilds of the same sandbox
- The image + firewall: rebuilt by Dev Containers → Rebuild Container

---

## More sandboxes

Mark this repo a GitHub template (Settings → Template repository), or copy the
folder. Each copy runs as its own isolated container with its own firewall and
its own orchestrator session — and thanks to the config seeding, a fresh copy
is immediately walk-away-capable with zero interactive setup.
