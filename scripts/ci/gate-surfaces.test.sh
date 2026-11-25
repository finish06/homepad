#!/usr/bin/env bash
# Trigger for the real-browser gate (`.gitea/workflows/browser-gate.yml`).
#
# The gate is a required status check on main, so its trigger has two jobs:
# run the suite when the PR can break something the suite pins, and never turn
# an unreadable diff into a silent green. Runs against a scratch git repo, so
# the diffs are real.
#
#   bash scripts/ci/gate-surfaces.test.sh
set -euo pipefail

repo="$(cd "$(dirname "$0")/../.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

pass=0 fail=0
check() { # check <name> <command...>
  local name=$1; shift
  if "$@"; then pass=$((pass + 1)); echo "ok   - $name"
  else fail=$((fail + 1)); echo "FAIL - $name"; fi
}

g() { git -C "$work/r" -c user.name=t -c user.email=t@example.invalid "$@"; }
git init -q -b main "$work/r"
mkdir -p "$work/r/src/grid" "$work/r/api/internal" "$work/r/docs" "$work/r/specs"
echo a > "$work/r/src/grid/AppGrid.tsx"; echo a > "$work/r/api/internal/x.go"
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
run_for() { (cd "$work/r" && bash "$repo/scripts/ci/gate-surfaces.sh" "$@" 2>/dev/null); }
is() { [ "$(run_for "$1" "$2")" = "$3" ]; }

# --- the surfaces the suite pins --------------------------------------------
grid=$(commit_on grid src/grid/AppGrid.tsx)
grid_math=$(commit_on grid-math src/grid/appGridLayout.ts)
app=$(commit_on app src/app/App.tsx)
accounts=$(commit_on accounts src/accounts/Users.tsx)
widgets=$(commit_on widgets src/widgets/StatusWidget.tsx)
specs_=$(commit_on specs tests/browser-gate/header-zindex.spec.ts)
mock=$(commit_on mock tests/browser-gate/mockApi.ts)
gatecfg=$(commit_on gatecfg playwright.gate.config.ts)
gatewf=$(commit_on gatewf .gitea/workflows/browser-gate.yml)
gatescript=$(commit_on gatescript scripts/ci/gate-surfaces.sh)
pkg=$(commit_on pkg package.json)
lock=$(commit_on lock package-lock.json)
vite=$(commit_on vite vite.config.ts)
nginx=$(commit_on nginx nginx.conf)
docker=$(commit_on docker Dockerfile)

check "the grid (tiles, dnd, layout) runs the gate" is "$base" "$grid" "run=true"
check "grid layout math runs the gate" is "$base" "$grid_math" "run=true"
check "the app shell runs the gate" is "$base" "$app" "run=true"
check "accounts run the gate (accounts-*.spec.ts pins them)" is "$base" "$accounts" "run=true"
check "widgets run the gate (status-widgets.spec.ts pins them)" is "$base" "$widgets" "run=true"
check "the gate's specs run the gate" is "$base" "$specs_" "run=true"
check "the gate's API mocks run the gate" is "$base" "$mock" "run=true"
check "the gate's Playwright config runs the gate" is "$base" "$gatecfg" "run=true"
check "the gate's own workflow runs the gate" is "$base" "$gatewf" "run=true"
check "the gate's own detection script runs the gate" is "$base" "$gatescript" "run=true"
check "a package.json change runs the gate" is "$base" "$pkg" "run=true"
check "a lockfile change runs the gate" is "$base" "$lock" "run=true"
check "a Vite config change runs the gate (chunk/lazy specs)" is "$base" "$vite" "run=true"
check "an nginx change runs the gate (csp.spec.ts asserts served headers)" is "$base" "$nginx" "run=true"
check "a Dockerfile change runs the gate" is "$base" "$docker" "run=true"

# --- what may skip it ------------------------------------------------------
api=$(commit_on api api/internal/x.go)
docs=$(commit_on docs docs/cicd.md)
spec=$(commit_on spec specs/SPEC-app-grid.md)
deploy=$(commit_on deploy deploy/manifest.yaml)

check "an API-only change is a no-op pass" is "$base" "$api" "run=false"
check "a docs-only change is a no-op pass" is "$base" "$docs" "run=false"
check "a spec-only change is a no-op pass" is "$base" "$spec" "run=false"
check "a deploy-only change is a no-op pass" is "$base" "$deploy" "run=false"

# --- fail closed: a required check must never pass on an unknown diff ------
check "an empty diff runs the gate" is "$base" "$base" "run=true"
check "an unknown base sha runs the gate" is 0000000000000000000000000000000000000000 "$grid" "run=true"
check "a missing base sha runs the gate" is "" "$grid" "run=true"
check "a missing head sha runs the gate" is "$grid" "" "run=true"

# Only the PR's own commits count: main moved on in src/ after this branch was
# cut, and the API-only PR must still skip. A two-dot diff would charge it with
# main's web changes and run the gate on every stale branch.
g checkout -q main; echo later >> "$work/r/src/grid/AppGrid.tsx"; g commit -qam "main moves the grid"
main_now=$(g rev-parse HEAD)
check "an API-only PR behind a main that changed src/ still skips" is "$main_now" "$api" "run=false"

# The workflow reads this with `>> "$GITHUB_OUTPUT"`: exactly one key=value line.
check "output is a single run=true|false line" \
  bash -c '[ "$(printf "%s" "$1" | grep -cE "^run=(true|false)$")" = 1 ] && [ "$(printf "%s\n" "$1" | wc -l | tr -d " ")" = 1 ]' _ "$(run_for "$base" "$grid")"
check "a warning is printed when the diff fails" \
  bash -c '(cd "$0" && bash "$1/scripts/ci/gate-surfaces.sh" "" "" 2>&1 >/dev/null | grep -q "::warning::")' "$work/r" "$repo"

echo "# $pass passed, $fail failed"
[ "$fail" -eq 0 ]
