import { test, expect } from './fixtures';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// AC A11 (frontend half) — The built bundle must not contain the Gatus URL.
// The backend half lives in `homepad-api/internal/api/security_test.go`.
//
// #498 — this guard used to `test.skip()` when dist/ was absent, and
// playwright.config.ts served `npm run dev`, which never produces a dist/. So on
// a clean checkout the one check standing between an internal hostname and a
// public bundle SKIPPED, and the run was green. A security guard that opts out
// when its subject is missing is worse than no guard: it reports the absence of
// evidence as evidence of absence.
//
// The suite now serves `vite preview` (dist/), so dist/ necessarily exists when
// these tests run. A missing dist/ is therefore a genuine failure, not a reason
// to stand down.

// The deployed Gatus host is gatus.<IPv4>.nip.io. Match that shape rather than
// the literal, so the internal cluster address stays out of this public repo;
// the pattern still catches that address (and any other IP-based Gatus host).
const SENTINEL_GATUS_HOST = /gatus\.\d{1,3}(\.\d{1,3}){3}\.nip\.io/;

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

  expect(
    existsSync(dist),
    'no dist/ — run `npm run build` first. This is a FAILURE, not a skip: AC A11 is ' +
      'unverified without it, and reporting that as a pass is how an internal hostname ' +
      'reaches a public bundle (#498).',
  ).toBe(true);

  const files = walk(dist).filter((f) => /\.(js|html|css|map|json)$/.test(f));
  expect(files.length, 'expected at least one built asset under dist/').toBeGreaterThan(0);

  for (const f of files) {
    const content = readFileSync(f, 'utf8');
    const leaked = content.match(SENTINEL_GATUS_HOST);
    expect(
      leaked,
      `built asset ${f} contains the Gatus URL (${leaked?.[0]}); v1 forbids it`,
    ).toBeNull();
  }
});
