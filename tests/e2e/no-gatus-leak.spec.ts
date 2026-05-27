import { test, expect } from '@playwright/test';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// AC A11 (frontend half) — The built bundle must not contain the Gatus URL.
// The backend half lives in `homepad-api/internal/api/security_test.go`.

const SENTINEL_GATUS_URL = 'gatus.10.17.2.213.nip.io';

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

test('built bundle does not contain the Gatus URL', async () => {
  const dist = join(process.cwd(), 'dist');

  // Skip in CI if the build step hasn't run; in CI we require `npm run build` first.
  test.skip(!existsSync(dist), 'no dist/ — run `npm run build` first (AC A11 unverified for this run)');

  const files = walk(dist).filter((f) => /\.(js|html|css|map|json)$/.test(f));
  expect(files.length, 'expected at least one built asset under dist/').toBeGreaterThan(0);

  for (const f of files) {
    const content = readFileSync(f, 'utf8');
    expect(
      content.includes(SENTINEL_GATUS_URL),
      `built asset ${f} contains the Gatus URL (${SENTINEL_GATUS_URL}); v1 forbids it`,
    ).toBe(false);
  }
});
