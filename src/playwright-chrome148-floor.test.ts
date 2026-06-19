// Guard: homepad's declared Playwright floor must support the Chrome 148 sidecar.
//
// #56 — the Chromium QA sidecar runs Chrome 148, but our tooling declared a
// Playwright floor (`@playwright/test: ^1.48.0`) old enough to resolve a build
// that predates Chrome-148 support, and `playwright-core` (which qa-kit/cdp.js
// require()s for real-browser QA) wasn't pinned at all. A resolve below the
// Chrome-148 floor reproduces the issue's symptom: connectOverCDP establishes
// the WebSocket but times out on the protocol handshake.
//
// Per Playwright's release notes, 1.60 is the first release bundling Chromium
// 148 (148.0.7778.96) and the floor that supports the Chrome 148 sidecar. This
// test locks both declared playwright deps at >= that floor so the tree can
// never drift back under the sidecar's Chrome version.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

// First Playwright release that bundles / supports Chromium 148.
const CHROME_148_FLOOR = [1, 60, 0] as const;

const pkg = JSON.parse(
  readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
) as { devDependencies?: Record<string, string>; dependencies?: Record<string, string> };

const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

// Lowest version a range like "^1.60.0" / "~1.60.0" / ">=1.60.0" can resolve to.
function rangeFloor(range: string): [number, number, number] {
  const m = range.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!m) throw new Error(`unparseable version range: ${range}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function gte(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return true;
}

describe('Playwright tooling floor supports the Chrome 148 QA sidecar (#56)', () => {
  // qa-kit/cdp.js does `require("playwright-core")` directly, so it must be a
  // pinned, Chrome-148-capable dependency — not left to transitive resolution.
  it('pins playwright-core at >= the Chrome 148 floor', () => {
    const range = allDeps['playwright-core'];
    expect(range, 'playwright-core must be a declared dependency').toBeTruthy();
    expect(
      gte(rangeFloor(range), CHROME_148_FLOOR),
      `playwright-core floor ${range} must be >= ${CHROME_148_FLOOR.join('.')}`,
    ).toBe(true);
  });

  it('declares @playwright/test at >= the Chrome 148 floor', () => {
    const range = allDeps['@playwright/test'];
    expect(range, '@playwright/test must be a declared dependency').toBeTruthy();
    expect(
      gte(rangeFloor(range), CHROME_148_FLOOR),
      `@playwright/test floor ${range} must be >= ${CHROME_148_FLOOR.join('.')}`,
    ).toBe(true);
  });
});
