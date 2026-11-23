#!/usr/bin/env bash
# Which side of the repo a PR changed (SPEC-monorepo-api AC-004).
#
#   bash scripts/ci/changed-sides.sh <base-sha> <head-sha> >> "$GITHUB_OUTPUT"
#
# Prints `web=true|false` and `api=true|false`. Every PR workflow triggers on
# every PR (a workflow skipped by on.paths never reports, and a required check
# that never reports deadlocks the PR), and each job skips its own steps, green,
# when its side is false.
#   api/…                                 API
#   .gitea/ .github/ scripts/ci/ compose.yaml   both: they wire or ship both sides
#   anything else                         web (the web app lives at the root)
# Only the PR's own commits count (diff from the merge-base), so a branch that is
# behind main isn't charged with main's changes. Fail safe: an empty or unknown
# diff runs both sides.
set -uo pipefail

base=${1:-} head=${2:-}
if ! files=$(git diff --name-only "$base...$head" 2>/dev/null) || [ -z "$base" ] || [ -z "$files" ]; then
  echo "::warning::no diff for ${base:-<none>}...${head:-<none>}; running both sides" >&2
  echo web=true
  echo api=true
  exit 0
fi

web=false api=false
while IFS= read -r f; do
  case "$f" in
    api/*) api=true ;;
    .gitea/*|.github/*|scripts/ci/*|compose.yaml) web=true api=true ;;
    *) web=true ;;
  esac
done <<<"$files"
echo "changed sides: web=$web api=$api" >&2
echo "web=$web"
echo "api=$api"
