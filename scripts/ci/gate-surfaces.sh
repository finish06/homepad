#!/usr/bin/env bash
# Should the real-browser gate run for this PR? (`.gitea/workflows/browser-gate.yml`)
#
#   bash scripts/ci/gate-surfaces.sh <base-sha> <head-sha> >> "$GITHUB_OUTPUT"
#
# Prints exactly one line, `run=true` or `run=false`. Diagnostics go to stderr.
# The workflow runs the heavy half (npm ci → build → test:gate) only when
# `run=true` and reports the same required check either way: a workflow skipped
# by `on.paths` never reports, and a required check that never reports deadlocks
# every PR waiting for it (SPEC-monorepo-api AC-004).
#
# FAIL CLOSED. "Browser gate / Browser gate (#35 tile/menu/dnd) (pull_request)"
# is a required status check on main. A diff this script cannot compute is not a
# reason to pass — it means nobody knows what changed, so the suite runs. The
# inline `git diff ... | grep -q` this replaces failed open: a missing or
# unreachable base sha emptied the pipe, grep missed, and the gate went green
# without testing anything.
#
# What counts as a gate surface: whatever `tests/browser-gate/` pins. That
# started as tile/menu/dnd (#35) and is now the whole web UI — the header,
# accounts, CSP, the kid board, widgets, backup/import, admin settings. A
# trigger that names fewer files than the suite tests is a gate that skips its
# own tests, so this matches the suite rather than a guess about which
# directories "matter". API-only and docs-only PRs still get the cheap no-op.
set -uo pipefail

base=${1:-} head=${2:-}

# Unknown diff (no base, bad sha, git failure, empty range): run the gate.
if [ -z "$base" ] || [ -z "$head" ]; then
  echo "::warning::no base/head sha (${base:-<none>}...${head:-<none>}); running the browser gate" >&2
  echo run=true
  exit 0
fi

if ! files=$(git diff --name-only "$base...$head" 2>/dev/null); then
  echo "::warning::git diff failed for $base...$head; running the browser gate" >&2
  echo run=true
  exit 0
fi

if [ -z "$files" ]; then
  echo "::warning::empty diff for $base...$head; running the browser gate" >&2
  echo run=true
  exit 0
fi

# Every surface tests/browser-gate/ can observe:
#   src/                     the app the specs drive (grid, app shell, features)
#   tests/browser-gate/      the specs, fixtures and API mocks themselves
#   playwright.gate.config.ts, this workflow, these scripts   the harness
#   package(-lock).json      a dependency bump can change behaviour with no src change
#   vite.config.ts, index.html, public/, nginx*, Dockerfile   what ships and what
#                            serves it (the CSP spec asserts the served headers)
PATTERN='^src/|^tests/browser-gate/|^playwright\.gate\.config\.ts$|^\.gitea/workflows/browser-gate\.yml$|^scripts/ci/(gate-surfaces|playwright-image)|^package(-lock)?\.json$|^vite\.config\.ts$|^index\.html$|^public/|^nginx|^Dockerfile$'

if matches=$(printf '%s\n' "$files" | grep -E "$PATTERN"); then
  count=$(printf '%s\n' "$matches" | awk 'END { print NR }')
  printf 'browser-gate surfaces changed (%s files):\n' "$count" >&2
  printf '%s\n' "$matches" | awk 'NR <= 10 { print "  " $0 }' >&2
  [ "$count" -gt 10 ] && printf '  … and %s more\n' "$((count - 10))" >&2
  echo run=true
else
  echo "no browser-gate surfaces changed; gate is a no-op pass" >&2
  echo run=false
fi
