# Shared helpers for the sandbox orchestration scripts.
# Sourced by spawn / integrate / abandon / list-agents / orchestrate.
# Not executable on its own.

# Where worker worktrees live. Deliberately OUTSIDE /workspace so workers do
# not inherit the orchestrator's CLAUDE.md from an ancestor directory.
WORKTREE_ROOT="${WORKTREE_ROOT:-$HOME/worktrees}"

# Execution environment: 'container' (the network-firewalled devcontainer) or
# 'local' (a bare machine — e.g. an isolated always-on Mac mini, where workers
# also get browser access). Auto-detected; set ORCH_ENV=local|container to
# override. Container mode is what enables the firewall refresh cycle; local
# mode has NO network firewall, so run it only on an isolated machine.
if [[ "${ORCH_ENV:-}" != "local" && "${ORCH_ENV:-}" != "container" ]]; then
    if [[ -f /.dockerenv || -x /usr/local/bin/init-firewall.sh ]]; then
        ORCH_ENV=container
    else
        ORCH_ENV=local
    fi
fi
export ORCH_ENV

# Credentials/identity for headless `claude -p` runs. Claude Code scrubs auth
# tokens from child-process environments, so headless runners load them from a
# gitignored env file: .orchestrator.env at the repo root (local mode), falling
# back to .devcontainer/devcontainer.env (container mode). A token already in
# the environment wins — the file is only read when none is set.
load_auth_env() {   # load_auth_env <root>
    [[ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}${ANTHROPIC_API_KEY:-}" ]] && return 0
    local f
    for f in "$1/.orchestrator.env" "$1/.devcontainer/devcontainer.env"; do
        if [[ -f "$f" ]]; then set -a; . "$f"; set +a; return 0; fi
    done
    return 0
}

die() { echo "ERROR: $*" >&2; exit 1; }

# Root of the main working tree, even when called from inside a linked worktree.
repo_root() {
    git rev-parse --path-format=absolute --git-common-dir 2>/dev/null \
        | sed 's|/\.git$||'
}

# The branch the main worktree has checked out (the integration target).
base_branch() {
    git -C "$1" symbolic-ref --short HEAD 2>/dev/null || echo main
}

# Branch names double as tmux window names and worktree directory names, so
# keep them simple: kebab-case, no slashes.
valid_branch() {
    [[ "$1" =~ ^[a-z0-9][a-z0-9._-]*$ ]] && [[ "$1" != *..* ]] && [[ "$1" != *.lock ]]
}

worktree_path() {   # worktree_path <root> <branch>
    echo "$WORKTREE_ROOT/$(basename "$1")--$2"
}

# All local branches except the base branch.
worker_branches() { # worker_branches <root>
    local base; base="$(base_branch "$1")"
    git -C "$1" for-each-ref refs/heads --format='%(refname:short)' \
        | grep -vx "$base" || true
}

# ── tmux helpers (always matched by exact window name, operated on by id) ────

window_id() {       # window_id <name> → @id or empty; always exits 0 —
    # callers test the output, and under `set -euo pipefail` a missing tmux
    # server/session must not abort the caller mid-cleanup.
    tmux list-windows -t agents -F '#{window_id} #{window_name}' 2>/dev/null \
        | awk -v n="$1" '$2 == n {print $1; exit}' || true
}

worker_window_live() {  # worker_window_live <branch>
    [[ -n "$(window_id "$1")" ]]
}

kill_branch_windows() { # kill_branch_windows <branch>
    local name id
    for name in "$1" "done-$1"; do
        id="$(window_id "$name")"
        if [[ -n "$id" ]]; then tmux kill-window -t "$id" 2>/dev/null || true; fi
    done
}

# ── worker state ─────────────────────────────────────────────────────────────

# .worker-done is written by the worker wrapper when claude exits; it contains
# the exit code. Its presence — not tmux window state — is the completion
# signal, so it survives container/tmux restarts.
worker_done_file() {    # worker_done_file <root> <branch>
    echo "$(worktree_path "$1" "$2")/.worker-done"
}

branch_blocked() {  # branch committed a BLOCKED.md?
    git -C "$1" cat-file -e "$2:BLOCKED.md" 2>/dev/null
}

running_workers() { # running_workers <root> → count of live worker windows
    local n=0 b
    while IFS= read -r b; do
        [[ -n "$b" ]] || continue
        if worker_window_live "$b" && [[ ! -f "$(worker_done_file "$1" "$b")" ]]; then
            n=$((n+1))
        fi
    done < <(worker_branches "$1")
    echo "$n"
}

# ── orchestration state hygiene ──────────────────────────────────────────────

# State files (GOAL.md, TASKS.md, QUESTIONS.md, DECISIONS.md) ARE committed —
# that's what makes remote operation work: push them and GitHub becomes the
# dashboard. Only runtime artifacts stay out of git: logs (huge transcripts),
# worker markers, and loop control files. Uses .git/info/exclude (shared by
# all worktrees) so workers running `git add -A` can never commit these.
ensure_excludes() { # ensure_excludes <root>
    local gitdir exclude line tmp
    gitdir="$(git -C "$1" rev-parse --path-format=absolute --git-common-dir)"
    exclude="$gitdir/info/exclude"
    mkdir -p "$gitdir/info"
    touch "$exclude"
    # Migration: earlier revisions excluded the state files — un-exclude them.
    tmp="$exclude.tmp"
    grep -vx -e GOAL.md -e TASKS.md -e QUESTIONS.md -e DECISIONS.md \
        "$exclude" > "$tmp" 2>/dev/null || true
    mv "$tmp" "$exclude"
    for line in logs/ STOP .release-done .orchestrator.pid .orchestrator.env '.worker-*'; do
        grep -qxF "$line" "$exclude" 2>/dev/null || echo "$line" >> "$exclude"
    done
}

# Cheap digest of everything the orchestrator reacts to. Used by the outer
# loop to back off polling when nothing is changing.
state_fingerprint() {   # state_fingerprint <root>
    local b
    {
        git -C "$1" rev-parse HEAD 2>/dev/null
        git -C "$1" for-each-ref refs/heads --format='%(refname) %(objectname)'
        cat "$1/TASKS.md" "$1/QUESTIONS.md" "$1/DECISIONS.md" "$1/ARCHITECTURE.md" \
            "$1/FEEDBACK.md" "$1"/design/*.md "$1"/design/screens/*.md 2>/dev/null
        while IFS= read -r b; do
            [[ -n "$b" ]] || continue
            if [[ -f "$(worker_done_file "$1" "$b")" ]]; then echo "done:$b"; fi
        done < <(worker_branches "$1")
        true
    } | cksum
}

# Digest of the human-editable inputs (GOAL edits, question answers, feedback).
# A change here must always wake the LLM orchestrator.
human_state_digest() { # human_state_digest <root>
    cat "$1/GOAL.md" "$1/QUESTIONS.md" "$1/FEEDBACK.md" 2>/dev/null | cksum
}

# True when at least one worker branch exists and every one of them is
# mid-flight: live tmux window, no .worker-done marker, no committed
# BLOCKED.md. In that state there is nothing to integrate, repair, or
# re-spawn — the orchestrator would wake only to conclude "nothing to do".
# Any FINISHED / BLOCKED / FAILED / STALE / ORPHAN branch makes this false.
all_workers_mid_flight() { # all_workers_mid_flight <root>
    local b n=0
    while IFS= read -r b; do
        [[ -n "$b" ]] || continue
        n=$((n+1))
        worker_window_live "$b" || return 1
        [[ -f "$(worker_done_file "$1" "$b")" ]] && return 1
        branch_blocked "$1" "$b" && return 1
    done < <(worker_branches "$1")
    (( n > 0 ))
}

# timeout(1) exists in the container (coreutils) but not on stock macOS;
# degrade to no timeout rather than failing. -k: SIGKILL 30s after the TERM
# if the command ignores it — a hung claude must never outlive its budget.
run_with_timeout() {    # run_with_timeout <secs> <cmd...>
    local secs="$1"; shift
    if command -v timeout >/dev/null 2>&1; then
        timeout -k 30 "$secs" "$@"
    else
        "$@"
    fi
}

# True when the Anthropic API answers at the TCP/TLS level within seconds.
# Any HTTP response counts (401/404 are fine — we only care that the
# connection is not refused or black-holed). Without this probe, a dead
# network burns ~30 minutes inside claude's internal retry stack (0 tokens)
# before surfacing as "API Error: Unable to connect (ConnectionRefused)".
api_reachable() {
    curl -s -o /dev/null --connect-timeout 5 --max-time 15 \
        "${ANTHROPIC_BASE_URL:-https://api.anthropic.com}/v1/models"
}
