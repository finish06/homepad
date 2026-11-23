#!/usr/bin/env bash
# Roll homepad-api in homepad-staging and prove it booted, for staging-release's
# `api` job (SPEC-monorepo-api AC-005, AC-014). The `web` job `needs: api`, so a
# failure here is what keeps the web from rolling onto a broken API.
#
#   IMAGE_REF=<registry>/homepad-api:<sha>-beta bash scripts/ci/staging-api-rollout.sh <02-api.yaml>
#
# <02-api.yaml> is Code/homelab apps/homepad/staging/02-api.yaml. Its first
# document is the Deployment; it is applied with this build's image, so homelab's
# spec (env, probes) converges in the same rollout. The Service after it is left
# alone: the staging deployer can't patch Services.
# Then: rollout status must pass, and the newest pod's boot log must say
# "migrations applied (N new)". The API exits on a failed migration, so a failed
# migration surfaces as an API that never becomes ready.
set -euo pipefail
: "${IMAGE_REF:?IMAGE_REF not set}"
manifest=$1
ns=homepad-staging
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

sed '/^---$/q' "$manifest" | sed '/^---$/d' > "$work/deploy.yaml"
if ! grep -q '^kind: Deployment$' "$work/deploy.yaml" || ! grep -qE '^  name: homepad-api$' "$work/deploy.yaml"; then
  echo "::error::the first document of $manifest is not the homepad-api Deployment" >&2
  exit 1
fi
sed -i -E "s#^( +image: ).*homepad-api.*#\1$IMAGE_REF#" "$work/deploy.yaml"
kubectl -n "$ns" apply -f "$work/deploy.yaml"

# newest_pod_log: the boot log of the most recently created homepad-api pod.
newest_pod_log() {
  local pod
  pod=$(kubectl -n "$ns" get pods -l app=homepad-api --sort-by=.metadata.creationTimestamp \
    -o jsonpath='{.items[-1:].metadata.name}')
  kubectl -n "$ns" logs "$pod" -c api
}

if ! kubectl -n "$ns" rollout status deploy/homepad-api --timeout=120s; then
  echo "::error::homepad-api did not become ready in $ns on $IMAGE_REF; the web will not roll. A failed migration stops the API at boot; its log:" >&2
  newest_pod_log 2>&1 | tail -n 30 >&2 || :
  exit 1
fi
if ! log=$(newest_pod_log); then
  echo "::error::could not read homepad-api's boot log; the staging deployer needs get on pods/log in homepad-staging" >&2
  exit 1
fi
if ! grep -F 'migrations applied' <<<"$log"; then
  echo "::error::homepad-api boot log has no 'migrations applied' line; treating the migration as failed" >&2
  tail -n 30 <<<"$log" >&2
  exit 1
fi
echo "homepad-api is ready in $ns on $IMAGE_REF"
