#!/usr/bin/env bash
# Run every repo gate CI runs, on this machine, and say plainly which ones could
# not run here and why (SPEC-test-infra-18.3.0 AC-007).
#
#   npm run test:all
#
# It installs nothing. A gate whose tools are missing is reported NOT RUN with
# what it needs; it is never counted as passed.
#
# Exit: 0 every gate ran and passed. 1 a gate failed. 2 nothing failed, but at
# least one gate did not run, so this machine's result is incomplete.
#
# CI (.gitea/workflows/ci.yml) is the authoritative gate; docs/testing.md says
# which gates run where.
set -uo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo" || exit 1
log="$(mktemp -d)"
trap 'rm -rf "$log"' EXIT

names=() results=()
record() { names+=("$1"); results+=("$2"); }

# run <name> <command...>: run it, keep its output, record PASS or FAIL.
run() {
  local name=$1; shift
  local out="$log/${#names[@]}.log"
  echo "==> $name"
  if "$@" >"$out" 2>&1; then
    record "$name" "PASS"
  else
    tail -n 30 "$out"
    record "$name" "FAIL (output above)"
  fi
}
skip() { echo "==> $1: NOT RUN, $2"; record "$1" "NOT RUN: $2"; }

# --- web ---------------------------------------------------------------------
if [ ! -d node_modules ]; then
  for g in "npm run lint" "npm run typecheck" "vitest run --coverage"; do
    skip "$g" "node_modules is missing (run npm ci)"
  done
else
  run "npm run lint" npm run lint
  run "npm run typecheck" npm run typecheck
  # Builds the app itself for the bundle-budget and pwa-icons suites; no
  # `npm run build` needed first.
  run "vitest run --coverage" npx vitest run --coverage
fi

# --- shell tests (the same list as ci.yml's web job) -------------------------
for t in scripts/preview/render.test.sh scripts/preview/teardown-if-owner.test.sh \
  scripts/preview/api-image.test.sh scripts/ci/changed-sides.test.sh \
  scripts/ci/gate-surfaces.test.sh scripts/ci/playwright-image.test.sh \
  scripts/ci/staging-api-rollout.test.sh scripts/ci/workflows.test.sh; do
  run "bash $t" bash "$t"
done
# docs-only.test.sh fetches the ci-shared action from Gitea. Off that network
# it cannot fetch, which is not a failure of the rule it tests.
out="$log/docs-only.log"
echo "==> bash scripts/ci/docs-only.test.sh"
if bash scripts/ci/docs-only.test.sh >"$out" 2>&1; then
  record "bash scripts/ci/docs-only.test.sh" "PASS"
elif grep -q "^curl: " "$out"; then
  skip "bash scripts/ci/docs-only.test.sh" "cannot reach Gitea to fetch the ci-shared action (set ACTION_YML to a local copy)"
else
  tail -n 30 "$out"
  record "bash scripts/ci/docs-only.test.sh" "FAIL (output above)"
fi

# --- API (the same steps as ci.yml's api job) --------------------------------
if ! command -v go >/dev/null 2>&1; then
  for g in "go vet ./..." "go build ./..." "go test ./..."; do
    skip "$g" "no Go toolchain (needs Go 1.25+)"
  done
else
  run "go vet ./..." bash -c 'cd api && go vet ./...'
  run "go build ./..." bash -c 'cd api && go build ./...'
  # Without DATABASE_URL the integration tests skip and go test still prints
  # ok, so that run would prove little. Say so instead.
  if [ -z "${DATABASE_URL:-}" ]; then
    skip "go test ./..." "DATABASE_URL is unset (cd api && make test-db runs it on a throwaway Postgres)"
  else
    run "go test ./..." bash -c 'cd api && go test ./... -count=1'
  fi
fi

# --- summary -----------------------------------------------------------------
echo
echo "test:all summary"
failed=0 notrun=0
for i in "${!names[@]}"; do
  printf '  %-45s %s\n' "${names[$i]}" "${results[$i]}"
  case ${results[$i]} in
    FAIL*) failed=1 ;;
    NOT\ RUN*) notrun=1 ;;
  esac
done
echo "  (browser gate and e2e are separate: npm run test:gate, npm run test:e2e)"
if [ "$failed" = 1 ]; then echo "RESULT: FAILED"; exit 1; fi
if [ "$notrun" = 1 ]; then echo "RESULT: INCOMPLETE, some gates did not run here; CI runs them all"; exit 2; fi
echo "RESULT: all gates ran and passed"
