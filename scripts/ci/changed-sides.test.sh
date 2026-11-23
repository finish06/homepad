#!/usr/bin/env bash
# Change detection for the always-on PR workflows (SPEC-monorepo-api AC-004).
#
# Every PR workflow triggers on every PR (no on.paths: a workflow skipped that
# way never reports, and a required check that never reports deadlocks the PR).
# Each job instead asks scripts/ci/changed-sides.sh which side the PR touched and
# skips its steps, green, when its side didn't change. Runs against a scratch git
# repo, so the diffs are real.
#
#   bash scripts/ci/changed-sides.test.sh
set -euo pipefail

repo="$(cd "$(dirname "$0")/../.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

pass=0 fail=0
check() { # check <AC id + name> <command...>
  local name=$1; shift
  if "$@"; then pass=$((pass + 1)); echo "ok   - $name"
  else fail=$((fail + 1)); echo "FAIL - $name"; fi
}

g() { git -C "$work/r" -c user.name=t -c user.email=t@example.invalid "$@"; }
git init -q -b main "$work/r"
mkdir -p "$work/r/src" "$work/r/api/internal" "$work/r/api/migrations"
echo a > "$work/r/src/App.tsx"; echo a > "$work/r/api/internal/x.go"
g add -A; g commit -qm base
base=$(g rev-parse HEAD)

# commit_on <branch> <file>...: a branch off base that changes the given files.
commit_on() {
  local b=$1; shift
  g checkout -q -b "$b" "$base"
  for f in "$@"; do mkdir -p "$work/r/$(dirname "$f")"; echo "$b" >> "$work/r/$f"; done
  g add -A; g commit -qm "$b"
  g rev-parse HEAD
}
sides() { (cd "$work/r" && bash "$repo/scripts/ci/changed-sides.sh" "$@" 2>/dev/null); }
is() { [ "$(sides "$1" "$2" | sort | tr '\n' ' ')" = "$3" ]; }

web_only=$(commit_on web-only src/App.tsx)
api_only=$(commit_on api-only api/internal/x.go)
both=$(commit_on both src/App.tsx api/migrations/0042_x.sql)
workflow=$(commit_on workflow .gitea/workflows/ci.yml)
github=$(commit_on github .github/workflows/ghcr-release.yml)
ciscript=$(commit_on ciscript scripts/ci/changed-sides.sh)
compose=$(commit_on compose compose.yaml)
apidocs=$(commit_on apidocs api/README.md)
rootdocs=$(commit_on rootdocs specs/SPEC-x.md)

check "AC-004 TC-001 a src/ change is web only" is "$base" "$web_only" "api=false web=true "
check "AC-004 TC-002 an api/internal change is API only" is "$base" "$api_only" "api=true web=false "
check "AC-004 a web + migration change is both" is "$base" "$both" "api=true web=true "
check "AC-004 a .gitea workflow change runs both sides" is "$base" "$workflow" "api=true web=true "
check "AC-004 a .github workflow change runs both sides" is "$base" "$github" "api=true web=true "
check "AC-004 a scripts/ci change runs both sides" is "$base" "$ciscript" "api=true web=true "
check "AC-004 a compose.yaml change runs both sides" is "$base" "$compose" "api=true web=true "
check "AC-004 api/README.md is an API change" is "$base" "$apidocs" "api=true web=false "
check "AC-004 a root spec is a web change (as before: CI ran web on every PR)" is "$base" "$rootdocs" "api=false web=true "

# Fail safe: anything that leaves the diff unknown runs both sides.
check "AC-004 an empty diff runs both sides" is "$base" "$base" "api=true web=true "
check "AC-004 an unknown base sha runs both sides" is 0000000000000000000000000000000000000000 "$web_only" "api=true web=true "
check "AC-004 a missing base sha runs both sides" is "" "$web_only" "api=true web=true "

# Only the PR's own commits count. main moved on in api/ after this branch was
# cut; a two-dot diff would call the web-only PR an API change too.
g checkout -q main; echo later >> "$work/r/api/internal/x.go"; g commit -qam "main moves api"
main_now=$(g rev-parse HEAD)
check "AC-004 a web-only PR behind main stays web only" is "$main_now" "$web_only" "api=false web=true "

check "AC-004 output is GITHUB_OUTPUT lines" bash -c '[ "$(echo "$0" | grep -cE "^(web|api)=(true|false)$")" = 2 ]' "$(sides "$base" "$web_only")"

echo "# $pass passed, $fail failed"
[ "$fail" -eq 0 ]
