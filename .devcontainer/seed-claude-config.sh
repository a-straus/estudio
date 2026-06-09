#!/usr/bin/env bash
# Pre-accept Claude Code's first-run prompts (onboarding, bypass-permissions
# acceptance) so headless agents never stall on an interactive dialog — a
# fresh sandbox must be fully operable over SSH with no TTY dialogs.
#
# Only merges two flags into .claude.json; auth still comes from
# CLAUDE_CODE_OAUTH_TOKEN. The container (firewall, isolated FS, scoped
# tokens) is the actual safety boundary that makes pre-accepting sane.
# Runs once per config volume via postCreateCommand.
set -euo pipefail

dir="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
f="$dir/.claude.json"
mkdir -p "$dir"
[[ -s "$f" ]] || echo '{}' > "$f"
jq '.hasCompletedOnboarding = true | .bypassPermissionsModeAccepted = true' \
    "$f" > "$f.tmp"
mv "$f.tmp" "$f"
echo "Seeded $f (onboarding + bypass-permissions pre-accepted)"
