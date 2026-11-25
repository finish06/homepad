#!/usr/bin/env bash
# The browser gate runs inside a Playwright-published container image. That image
# must carry the same @playwright/test version `npm ci` installs, or
# `npx playwright install chromium` quietly downloads ~150 MB from
# cdn.playwright.dev at run time — the #226 flake (5 × 30 s → "Failed to install
# browsers") that pinning the image exists to prevent. The tag is a hard-coded
# string and the lockfile moves on its own, so the two drift silently.
#
#   bash scripts/ci/playwright-image.sh [workflow] [lockfile]
#
# Exits 1 with the exact fix when they disagree.
set -euo pipefail

wf=${1:-.gitea/workflows/browser-gate.yml}
lock=${2:-package-lock.json}

[ -f "$wf" ] || { echo "::error::no workflow at $wf" >&2; exit 1; }
[ -f "$lock" ] || { echo "::error::no lockfile at $lock" >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "::error::node is required to read $lock" >&2; exit 1; }

# `container: mcr.microsoft.com/playwright:v1.60.0-noble` → 1.60.0
image_version=$(
  awk '
    !found && /playwright:v[0-9]/ {
      n = split($0, parts, "playwright:v")
      split(parts[2], rest, "-")
      print rest[1]
      found = 1
    }
  ' "$wf"
)
if [ -z "$image_version" ]; then
  echo "::error::$wf declares no playwright:v<version>-<distro> container tag; the gate would run on the runner image and download Chromium" >&2
  exit 1
fi

image_tag=$(awk '/playwright:v[0-9]/{ n=split($0,a,"playwright:"); split(a[2],b," "); print b[1]; exit }' "$wf")

lock_version=$(
  node -e '
    const lock = require(require("path").resolve(process.argv[1]));
    const pkg = lock.packages && lock.packages["node_modules/@playwright/test"];
    if (!pkg || !pkg.version) { console.error("no node_modules/@playwright/test in " + process.argv[1]); process.exit(2); }
    process.stdout.write(pkg.version);
  ' "$lock"
) || { echo "::error::could not read @playwright/test's resolved version from $lock" >&2; exit 1; }

if [ "$image_version" != "$lock_version" ]; then
  {
    echo "::error::$wf runs in mcr.microsoft.com/playwright:$image_tag"
    echo "::error::but $lock resolves @playwright/test $lock_version."
    echo "::error::A mismatch makes 'npx playwright install chromium' download the browser at run time (#226), and the gate can wedge for ~8 minutes before failing."
    echo "::error::Fix: set the container tag in $wf to playwright:v$lock_version-noble (that image ships the matching Chromium), or pin @playwright/test back to $image_version in package.json and re-run npm install."
  } >&2
  exit 1
fi

echo "container image playwright:$image_tag matches @playwright/test $lock_version in $lock"
