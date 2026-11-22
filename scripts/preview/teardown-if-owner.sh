#!/usr/bin/env bash
# Tear down this PR's preview, but only if THIS run still owns it. Called by
# mr-staging's deploy failure trap.
#
#   PR_NUMBER=… PREVIEW_RUN=… DEPLOYED_AT=… bash scripts/preview/teardown-if-owner.sh
#
# Two runs for one PR can deploy the same preview seconds apart (#632: runs 7069
# and 7071). The one that failed deleted the preview the other had just deployed,
# and QA found 404s. The web Deployment is the last Deployment applied and is
# stamped with the deploying run, so it names the owner:
#   - stamp is this run's: delete.
#   - no web Deployment (e.g. a 4th preview refused by quota): delete the leftovers.
#   - another run's stamp: keep it.
#   - stamp unreadable: keep it; the 48h preview-janitor is the backstop.
# Templates from before homelab added homepad.preview/run carry no run stamp;
# then deployed-at, the only other per-deploy value, decides.
set -uo pipefail
: "${PR_NUMBER:?}" "${PREVIEW_RUN:?}" "${DEPLOYED_AT:?}"

if ! owner=$(kubectl -n homepad-preview get deployment "homepad-web-pr-$PR_NUMBER" --ignore-not-found \
  -o jsonpath='{.metadata.annotations.homepad\.preview/run}|{.metadata.annotations.homepad\.preview/deployed-at}|{.metadata.annotations.homepad\.preview/sha}'); then
  echo "::warning::could not read who owns pr-$PR_NUMBER; not tearing down (the preview-janitor removes it after 48h)"
  exit 0
fi
IFS='|' read -r run at sha <<<"$owner"
if [ -n "$owner" ] && [ "$run" != "$PREVIEW_RUN" ] && { [ -n "$run" ] || [ "$at" != "$DEPLOYED_AT" ]; }; then
  echo "::warning::a newer deploy owns pr-$PR_NUMBER; not tearing down"
  echo "Its web Deployment is run ${run:-?} (deployed-at $at, sha $sha); this run is $PREVIEW_RUN (deployed-at $DEPLOYED_AT)."
  exit 0
fi
kubectl -n homepad-preview delete deployment,service,configmap,ingressroute -l pr="$PR_NUMBER"
