#!/usr/bin/env bash
# Ownership check in mr-staging's deploy failure trap (#632).
#
# Two runs for the same PR deployed pr-632 seconds apart; the one whose seed
# failed tore down the preview the other had just deployed, and QA met 404s.
# scripts/preview/teardown-if-owner.sh deletes the preview only when the web
# Deployment still carries THIS run's stamp. kubectl is stubbed: the stub prints
# $STUB_OWNER for the `get` (empty = no web Deployment), exits $STUB_GET_RC, and
# logs every call.
#
#   bash scripts/preview/teardown-if-owner.test.sh
set -euo pipefail

repo="$(cd "$(dirname "$0")/../.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir "$work/bin"
cat > "$work/bin/kubectl" <<'STUB'
#!/usr/bin/env bash
echo "$*" >> "$STUB_LOG"
case " $* " in
  *" get "*) printf '%s' "$STUB_OWNER"; exit "${STUB_GET_RC:-0}" ;;
esac
STUB
chmod +x "$work/bin/kubectl"

pass=0 fail=0
check() { # check <AC id + name> <command...>
  local name=$1; shift
  if "$@"; then pass=$((pass + 1)); echo "ok   - $name"
  else fail=$((fail + 1)); echo "FAIL - $name"; fi
}

# run_trap <owner "run|deployed-at|sha"> [get exit code]: this run is 7069-1,
# stamped 2026-11-22T23:28:40Z.
run_trap() {
  : > "$work/calls"
  PATH="$work/bin:$PATH" STUB_LOG="$work/calls" STUB_OWNER=$1 STUB_GET_RC=${2:-0} \
    PR_NUMBER=632 PREVIEW_RUN=7069-1 DEPLOYED_AT=2026-11-22T23:28:40Z \
    bash "$repo/scripts/preview/teardown-if-owner.sh" > "$work/out" 2>&1 || :
}
deleted() { grep -q '^-n homepad-preview delete deployment,service,configmap,ingressroute -l pr=632$' "$work/calls"; }
kept() { [ -s "$work/calls" ] && ! grep -q ' delete ' "$work/calls"; }
warned() { grep -qF '::warning::a newer deploy owns pr-632; not tearing down' "$work/out"; }

run_trap '7069-1|2026-11-22T23:28:40Z|5babf60'
check "AC-007 this run's own preview is torn down" deleted

# The #632 race: same sha, same second, another run.
run_trap '7071-1|2026-11-22T23:28:40Z|5babf60'
check "AC-007 another run's preview (same second) is kept" kept
check "AC-007 keeping it prints the newer-deploy warning" warned

# Templates from before homelab adds homepad.preview/run: fall back to deployed-at.
run_trap '|2026-11-22T23:28:40Z|5babf60'
check "AC-007 no run annotation, same deployed-at: torn down" deleted
run_trap '|2026-11-22T23:29:05Z|5babf60'
check "AC-007 no run annotation, other deployed-at: kept" kept

# A refused 4th preview (quota) never got its web Deployment; the rest goes.
run_trap ''
check "AC-007 no web Deployment: leftovers torn down" deleted

run_trap '' 1
check "AC-007 owner unreadable (kubectl get fails): kept" kept

# Wiring: the trap must go through the check, never delete directly.
wf="$repo/.gitea/workflows/mr-staging.yml"
check "AC-007 mr-staging's trap calls teardown-if-owner.sh" \
  grep -qF 'bash scripts/preview/teardown-if-owner.sh' "$wf"
check "AC-007 mr-staging deletes nothing itself" \
  bash -c '! grep -nE "kubectl .*delete" "$1"' _ "$wf"
check "mr-staging runs one deploy per PR at a time" \
  grep -qF 'group: preview-pr-${{ github.event.pull_request.number }}' "$wf"

echo "# $pass passed, $fail failed"
[ "$fail" -eq 0 ]
