#!/usr/bin/env bash
# QA seed (#623) — the one command CI runs on a fresh per-PR preview:
#
#   QA_EMAIL=… QA_PASSWORD=… bash scripts/seed-qa.sh <homepad-url>
#
# Registers the QA admin (the first account on an empty install becomes
# admin), signs in and creates the fixture in docs/qa-seed.md through the
# public API. Safe to re-run: a second run changes nothing. Exits non-zero
# with the reason on any unexpected answer. SEED_WAIT_SECONDS (default 60)
# bounds how long it waits for the API to come up.
#
# The work is in seed-qa.js (plain Node >= 20, no npm install needed); this
# wrapper only checks node is there, so a runner without it fails clearly.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! command -v node >/dev/null 2>&1; then
  echo "seed-qa: FAILED: node is not installed (needs Node 20 or newer)" >&2
  exit 1
fi
major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$major" -lt 20 ]; then
  echo "seed-qa: FAILED: node $(node -v) is too old (needs Node 20 or newer)" >&2
  exit 1
fi
exec node "$here/seed-qa.js" "$@"
