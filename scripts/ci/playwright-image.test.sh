#!/usr/bin/env bash
# The container-pin check for the browser gate.
#
# The gate's image tag is a literal and package-lock.json moves on its own. When
# they disagree, `npx playwright install chromium` downloads the browser at run
# time (#226) instead of using the one baked into the image. This proves the
# check catches that, in both directions, and that the repo's real pin is sound.
#
#   bash scripts/ci/playwright-image.test.sh
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
# status <workflow> <lockfile>: the script's exit status.
status() { bash "$repo/scripts/ci/playwright-image.sh" "$@" >/dev/null 2>&1; }
# said <pattern> <workflow> <lockfile>: what it told the reader.
# said <pattern> <workflow> <lockfile>: what it told the reader. The script is
# expected to fail here, so its stderr is captured rather than piped (pipefail
# would report the script's status, not grep's).
said() {
  local out
  out=$(bash "$repo/scripts/ci/playwright-image.sh" "$2" "$3" 2>&1 || true)
  printf '%s\n' "$out" | grep -qE "$1"
}
fails() { ! status "$@"; }

wf_image() { # wf_image <file> <tag>
  printf 'jobs:\n  browser-gate:\n    container: mcr.microsoft.com/playwright:v%s-noble\n' "$2" > "$1"
}
lock_image() { # lock_image <file> <version>
  printf '{"packages":{"node_modules/@playwright/test":{"version":"%s"}}}\n' "$2" > "$1"
}

wf_image "$work/wf-ok.yml" 1.60.0
lock_image "$work/lock-ok.json" 1.60.0
wf_image "$work/wf-driftyml" 1.61.0
lock_image "$work/lock-bumped.json" 1.61.0
printf 'jobs:\n  browser-gate:\n    runs-on: ubuntu-latest\n' > "$work/wf-nocontainer.yml"

check "matching image tag and lockfile pass" status "$work/wf-ok.yml" "$work/lock-ok.json"
check "…and it says which versions agree" said "matches @playwright/test 1\.60\.0" "$work/wf-ok.yml" "$work/lock-ok.json"
check "a lockfile bump with a stale image tag fails" fails "$work/wf-ok.yml" "$work/lock-bumped.json"
check "…naming the image the job would use" said "playwright:v1\.60\.0-noble" "$work/wf-ok.yml" "$work/lock-bumped.json"
check "…naming the version npm would install" said "@playwright/test 1\.61\.0" "$work/wf-ok.yml" "$work/lock-bumped.json"
check "…and the fix" said "playwright:v1\.61\.0-noble" "$work/wf-ok.yml" "$work/lock-bumped.json"
check "an image bump with a stale lockfile fails the other way" fails "$work/wf-driftyml" "$work/lock-ok.json"
check "a workflow with no container tag fails (the gate would download Chromium)" fails "$work/wf-nocontainer.yml" "$work/lock-ok.json"
check "…saying so" said "no playwright:v<version>" "$work/wf-nocontainer.yml" "$work/lock-ok.json"
check "a missing lockfile fails" fails "$work/wf-ok.yml" "$work/nope.json"
check "a missing workflow fails" fails "$work/nope.yml" "$work/lock-ok.json"

# The pin this repo actually ships: if this fails, every gate run re-downloads
# Chromium and the 2-minute guard is the only thing between CI and an 8-minute
# hang.
check "the repo's own pin agrees with its lockfile" \
  status "$repo/.gitea/workflows/browser-gate.yml" "$repo/package-lock.json"

echo "# $pass passed, $fail failed"
[ "$fail" -eq 0 ]
