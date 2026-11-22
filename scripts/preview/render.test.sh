#!/usr/bin/env bash
# Render check for the per-PR preview templates (SPEC-preview-environments §7).
#
# Renders a scratch copy of tests/fixtures/preview-templates/ (copied from
# Code/homelab apps/homepad/preview/template/ at 447bda2d) through
# scripts/preview/render.sh, the same script mr-staging's deploy-cmd runs, and
# asserts the output is safe to apply. Needs bash + envsubst (gettext-base).
#
#   bash scripts/preview/render.test.sh
set -euo pipefail

repo="$(cd "$(dirname "$0")/../.." && pwd)"
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
    DEPLOYED_AT=2026-11-22T22:00:00Z IMAGE_REF=registry.example/homepad:0123456-test \
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
check "AC-008 IngressRoute host is pr-1.homepad-preview.10.17.2.213.nip.io" \
  grep -qF 'Host(`pr-1.homepad-preview.10.17.2.213.nip.io`)' "$ingress"
check "AC-005 every pr label is the quoted string \"1\"" pr_labels_quoted
check "AC-001 web image is the PR's IMAGE_REF" \
  grep -qF 'image: registry.example/homepad:0123456-test' "$web"
check "AC-006 deployed-at annotation carries DEPLOYED_AT" \
  grep -qF 'homepad.preview/deployed-at: 2026-11-22T22:00:00Z' "$ingress"

echo "# $pass passed, $fail failed"
[ "$fail" -eq 0 ]
