#!/usr/bin/env bash
# The API half of staging-release (SPEC-monorepo-api AC-005, AC-014, TC-003).
#
# staging-release's `api` job runs scripts/ci/staging-api-rollout.sh; its `web`
# job `needs: api` (scripts/ci/workflows.test.sh pins that). So this script's
# exit code is what keeps the web from rolling onto a broken API: it must fail
# when homepad-api isn't ready, and when the new pod's boot log lacks
# "migrations applied". kubectl is a stub that logs its calls; the manifest is a
# trimmed copy of the shape of Code/homelab apps/homepad/staging/02-api.yaml.
#
#   bash scripts/ci/staging-api-rollout.test.sh
set -euo pipefail

repo="$(cd "$(dirname "$0")/../.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir "$work/bin"
cat > "$work/bin/kubectl" <<'STUB'
#!/usr/bin/env bash
echo "kubectl $*" >> "$STUB_LOG"
case " $* " in
  *" apply -f "*) cp "${@: -1}" "$STUB_APPLIED"; exit "${STUB_APPLY_RC:-0}" ;;
  *" rollout status "*) exit "${STUB_ROLLOUT_RC:-0}" ;;
  *" get pods "*) printf '%s' homepad-api-7d9f-new ;;
  *" logs "*)
    if [ "${STUB_LOGS_RC:-0}" != 0 ]; then
      echo 'Error from server (Forbidden): pods "homepad-api-7d9f-new" is forbidden: cannot get resource "pods/log"' >&2
      exit "$STUB_LOGS_RC"
    fi
    printf '%s\n' "$STUB_BOOT_LOG" ;;
esac
STUB
chmod +x "$work/bin/kubectl"

cat > "$work/02-api.yaml" <<'YAML'
apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    app: homepad-api
  name: homepad-api
  namespace: homepad-staging
spec:
  template:
    spec:
      containers:
      - name: api
        image: registry.example/homepad-api:79e3b03-beta@sha256:ed09cb10cec79fe8d1b09e2620908e5b9bc3450050c534d660c756e967acc14a
        imagePullPolicy: Always
---
apiVersion: v1
kind: Service
metadata:
  name: homepad-api
  namespace: homepad-staging
YAML

pass=0 fail=0
check() { # check <AC id + name> <command...>
  local name=$1; shift
  if "$@"; then pass=$((pass + 1)); echo "ok   - $name"
  else fail=$((fail + 1)); echo "FAIL - $name"; fi
}

BOOT_OK=$'2026/11/23 01:00:00 homepad-api 18.0.1\n2026/11/23 01:00:01 migrations applied (2 new)\n2026/11/23 01:00:01 listening on :8080'
# roll [env assignments...]: exit code in $work/rc, stdout+stderr in $work/out.
roll() {
  : > "$work/calls"; rm -f "$work/applied.yaml"
  set +e
  env PATH="$work/bin:$PATH" STUB_LOG="$work/calls" STUB_APPLIED="$work/applied.yaml" \
    STUB_BOOT_LOG="$BOOT_OK" IMAGE_REF=registry.example/homepad-api:abc1234-beta "$@" \
    bash "$repo/scripts/ci/staging-api-rollout.sh" "$work/02-api.yaml" > "$work/out" 2>&1
  echo $? > "$work/rc"
  set -e
}
ok() { [ "$(cat "$work/rc")" = 0 ]; }
failed() { [ "$(cat "$work/rc")" != 0 ]; }
said() { grep -qF "$1" "$work/out"; }
called() { grep -qF "$1" "$work/calls"; }
not_called() { ! grep -qF "$1" "$work/calls"; }

roll
check "AC-005 a ready API with migrations applied passes" ok
check "AC-005 it applies homelab's Deployment in homepad-staging" called "kubectl -n homepad-staging apply -f"
check "AC-005 the applied Deployment runs this build's image" \
  grep -qxF '        image: registry.example/homepad-api:abc1234-beta' "$work/applied.yaml"
check "AC-005 only the Deployment is applied (the deployer can't patch Services)" \
  bash -c '[ -s "$0" ] && ! grep -q "^kind: Service" "$0"' "$work/applied.yaml"
check "AC-005 it waits on rollout status" called "kubectl -n homepad-staging rollout status deploy/homepad-api"
check "AC-014 it reads the boot log of the newest homepad-api pod" called "kubectl -n homepad-staging logs homepad-api-7d9f-new -c api"
check "AC-014 it shows the migrations line it found" said "migrations applied (2 new)"

roll STUB_ROLLOUT_RC=1
check "AC-005 TC-003 an API that never becomes ready fails the job" failed
check "AC-005 and says so" said "::error::homepad-api did not become ready in homepad-staging"

roll STUB_BOOT_LOG=$'2026/11/23 01:00:00 homepad-api 18.0.1\n2026/11/23 01:00:01 listening on :8080'
check "AC-014 a boot log without 'migrations applied' fails the job" failed
check "AC-014 and says so" said "::error::homepad-api boot log has no 'migrations applied' line"

roll STUB_LOGS_RC=1
check "AC-014 an unreadable boot log fails the job (no silent green)" failed
check "AC-014 and names the missing RBAC" said "get on pods/log in homepad-staging"

roll STUB_APPLY_RC=1
check "AC-005 a refused apply fails the job" failed
check "AC-005 and nothing waits on a rollout that never started" not_called "rollout status"

roll IMAGE_REF=
check "AC-005 no IMAGE_REF fails before touching the cluster" failed
check "AC-005 and kubectl is never called" test ! -s "$work/calls"

printf 'apiVersion: v1\nkind: Service\nmetadata:\n  name: homepad-api\n' > "$work/02-api.yaml"
roll
check "AC-005 a manifest whose first document isn't the Deployment fails" failed
check "AC-005 and applies nothing" not_called apply

echo "# $pass passed, $fail failed"
[ "$fail" -eq 0 ]
