#!/usr/bin/env bash
# Render the per-PR preview templates (Code/homelab apps/homepad/preview/template/)
# for one PR, for mr-staging's deploy-cmd (SPEC-preview-environments §7).
#
#   PR_NUMBER=… PR_SHA=… DEPLOYED_AT=… IMAGE_REF=… API_IMAGE=… \
#     bash scripts/preview/render.sh <template-dir> <out-dir>
#
# envsubst gets the explicit variable list ON PURPOSE. A bare envsubst also
# replaces nginx's own $host, $remote_addr, $uri … in 03-web.yaml's ConfigMap
# with empty strings (`proxy_set_header Host ;`). scripts/preview/render.test.sh
# guards this.
set -euo pipefail

in=$1 out=$2
: "${PR_NUMBER:?}" "${PR_SHA:?}" "${DEPLOYED_AT:?}" "${IMAGE_REF:?}" "${API_IMAGE:?}"

for f in 01-db 02-api 03-web 04-ingress; do
  envsubst '${PR_NUMBER} ${PR_SHA} ${DEPLOYED_AT} ${IMAGE_REF} ${API_IMAGE}' \
    < "$in/$f.yaml" > "$out/$f.yaml"
done
