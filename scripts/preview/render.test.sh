#!/usr/bin/env bash
# Render check for the per-PR preview templates (SPEC-preview-environments §7).
#
# Renders a scratch copy of tests/fixtures/preview-templates/ (copied from
# Code/homelab apps/homepad/preview/template/ at 447bda2d, plus the
# homepad.preview/run annotation that lands in homelab alongside #632's fix, with the
# ingress host domain swapped for the placeholder cluster.example so the
# internal cluster address stays out of this public repo) through
# scripts/preview/render.sh, the same script mr-staging's deploy-cmd runs, and
# asserts the output is safe to apply. Needs bash + envsubst (gettext-base).
#
#   bash scripts/preview/render.test.sh
set -euo pipefail

repo="$(cd "$(dirname "$0")/../.." && pwd)"

# No envsubst on PATH (a QA runner, a non-root shell): fetch the pinned one into
# a folder this user can write and use it (#639, #681). If that fails too, stop
# with a FAIL. Never skip: a render check that didn't render proves nothing.
if ! command -v envsubst >/dev/null 2>&1; then
  if ! bindir="$(bash "$repo/scripts/preview/install-envsubst.sh")"; then
    echo "FAIL - envsubst is not on PATH and could not be installed (see above); nothing was checked"
    exit 1
  fi
  PATH="$bindir:$PATH"
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cp -R "$repo/tests/fixtures/preview-templates" "$work/templates"
mkdir "$work/out"

pass=0 fail=0
check() { # check <AC id + name> <command...>
  local name=$1; shift
  if "$@"; then pass=$((pass + 1)); echo "ok   - $name"
  else fail=$((fail + 1)); echo "FAIL - $name"; fi
}

render() {
  PR_NUMBER=1 PR_SHA=0123456789abcdef0123456789abcdef01234567 \
    DEPLOYED_AT=2026-11-22T22:00:00Z PREVIEW_RUN=7071-2 IMAGE_REF=registry.example/homepad:0123456-test \
    API_IMAGE=registry.example/homepad-api:abc1234-beta \
    bash "$repo/scripts/preview/render.sh" "$work/templates" "$work/out"
}
check "render.sh exits 0" render

rendered=("$work"/out/*.yaml)
web="$work/out/03-web.yaml"
ingress="$work/out/04-ingress.yaml"

no_placeholder_left() { [ -s "$web" ] && ! grep -n '${' "${rendered[@]}"; }
# Every pr / homepad.preview/pr label must be the quoted string "1": unquoted, YAML
# reads it as an int and the API server rejects the label. The teardown and the
# janitor select on pr=<n>, so these labels are what make cleanup find a preview.
pr_labels_quoted() {
  local labels
  labels=$(grep -hE '^ *(homepad\.preview/)?pr:' "${rendered[@]}") || return 1
  ! grep -vqE '^ *(homepad\.preview/)?pr: "1"$' <<<"$labels"
}

check "renders all four templates" test "${#rendered[@]}" -eq 4
check "AC-008 no \${ placeholder left in any rendered file" no_placeholder_left
# A bare envsubst blanks nginx's own variables: `proxy_set_header Host ;`.
check "AC-008 nginx \$host survives in 03-web.yaml" \
  grep -qF 'proxy_set_header Host $host;' "$web"
check "AC-008 nginx \$remote_addr survives in 03-web.yaml" \
  grep -qF 'proxy_set_header X-Real-IP $remote_addr;' "$web"
check "AC-008 nginx \$uri survives in 03-web.yaml" \
  grep -qF 'try_files $uri $uri/ /index.html;' "$web"
check "AC-008 IngressRoute host is pr-1.homepad-preview.cluster.example" \
  grep -qF 'Host(`pr-1.homepad-preview.cluster.example`)' "$ingress"
check "AC-005 every pr label is the quoted string \"1\"" pr_labels_quoted
check "AC-001 web image is the PR's IMAGE_REF" \
  grep -qF 'image: registry.example/homepad:0123456-test' "$web"
check "AC-006 deployed-at annotation carries DEPLOYED_AT" \
  grep -qF 'homepad.preview/deployed-at: 2026-11-22T22:00:00Z' "$ingress"
# The deploy's failure trap compares this to decide whether THIS run owns the
# preview (#632). Quoted so YAML never reads it as a number, which an
# annotation value can't be.
check "AC-007 web Deployment's run annotation is the quoted PREVIEW_RUN" \
  grep -qF 'homepad.preview/run: "7071-2"' "$web"

echo "# $pass passed, $fail failed"
[ "$fail" -eq 0 ]
