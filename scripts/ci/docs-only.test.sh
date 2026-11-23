#!/usr/bin/env bash
# The docs-only rule homepad's PRs are judged by (SPEC-monorepo-api AC-018).
#
# A docs-only PR skips mr-staging's build, preview and QA and is auto-approved.
# That rule is not in this repo: it is the "Detect docs-only diff" step of the
# ci-shared mr-staging action that .gitea/workflows/mr-staging.yml uses. So this
# test fetches that action at the exact ref the workflow pins, extracts the step's
# script, and runs it against stubbed diffs. With the API in api/, a migration
# must never be docs-only (it would merge with no build and no QA), while API
# markdown and api/docs/ are. The action's address comes from the workflow's own
# `uses:` line, so a re-pin is tested as it lands.
#
#   bash scripts/ci/docs-only.test.sh          # fetches the action (needs Gitea)
#   ACTION_YML=<file> bash scripts/ci/docs-only.test.sh   # a local copy
set -euo pipefail

repo="$(cd "$(dirname "$0")/../.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

if [ -n "${ACTION_YML:-}" ]; then
  cp "$ACTION_YML" "$work/action.yml"
else
  uses=$(grep -oE 'uses: +[^ ]+/Code/ci-shared/mr-staging@[^ ]+' "$repo/.gitea/workflows/mr-staging.yml" | awk '{print $2}')
  base=${uses%%/Code/ci-shared/*} ref=${uses##*@}
  url="$base/api/v1/repos/Code/ci-shared/raw/mr-staging/action.yml?ref=$ref"
  echo "# docs-only rule from ci-shared mr-staging@$ref"
  curl -sSf -o "$work/action.yml" "$url"
fi

# The step's `run: |` body, de-indented: every line after `run: |` up to the
# next line indented less than the body.
awk '
  /- name: Detect docs-only diff$/ { step = 1; next }
  step && !body && /^ +run: \|$/ { body = 1; next }
  body {
    if ($0 ~ /^ *$/) { print ""; next }
    match($0, /^ */)
    if (!ind) ind = RLENGTH
    if (RLENGTH < ind) exit
    print substr($0, ind + 1)
  }
' "$work/action.yml" > "$work/detect.sh"
grep -q 'docs_only=' "$work/detect.sh" || { echo "FAIL - no 'Detect docs-only diff' step in the action" >&2; exit 1; }

mkdir "$work/bin"
cat > "$work/bin/git" <<'STUB'
#!/usr/bin/env bash
printf '%s' "$STUB_FILES"
STUB
chmod +x "$work/bin/git"

pass=0 fail=0
check() { # check <AC id + name> <command...>
  local name=$1; shift
  if "$@"; then pass=$((pass + 1)); echo "ok   - $name"
  else fail=$((fail + 1)); echo "FAIL - $name"; fi
}
# docs_only <expected true|false> <changed file>...
docs_only() {
  local want=$1; shift
  : > "$work/out"
  PATH="$work/bin:$PATH" STUB_FILES="$(printf '%s\n' "$@")" GITHUB_OUTPUT="$work/out" \
    BASE_SHA=1111111111111111111111111111111111111111 HEAD_SHA=2222222222222222222222222222222222222222 \
    bash "$work/detect.sh" > /dev/null
  [ "$(cat "$work/out")" = "docs_only=$want" ]
}

check "AC-018 api/migrations/*.sql is never docs-only" docs_only false api/migrations/0042_add_widget.sql
check "AC-018 a migration with docs is not docs-only" docs_only false api/README.md api/migrations/0042_add_widget.sql
check "AC-018 api/README.md is docs-only" docs_only true api/README.md
check "AC-018 api/docs/x.md is docs-only" docs_only true api/docs/x.md
check "AC-018 anything under api/docs/ is docs-only" docs_only true api/docs/diagram.png
check "AC-018 API markdown plus root specs is docs-only" docs_only true api/README.md specs/SPEC-monorepo-api.md
check "AC-018 API Go code is not docs-only" docs_only false api/internal/api/server.go
check "AC-018 api/go.mod is not docs-only" docs_only false api/go.mod
check "AC-018 api/Dockerfile is not docs-only" docs_only false api/Dockerfile
check "AC-018 web code is not docs-only" docs_only false src/app/App.tsx

echo "# $pass passed, $fail failed"
[ "$fail" -eq 0 ]
