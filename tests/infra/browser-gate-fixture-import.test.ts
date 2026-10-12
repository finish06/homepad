import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// #452 (and the #455 / #507 it caused). Every browser-gate spec must take `test`
// from ./fixtures. The fixture attaches to the QA pod's Chromium sidecar over CDP,
// because the pod can't launch Playwright's bundled browser: it lacks the system
// libraries (#507, "libglib-2.0.so.0") and the browser download (#455). A spec
// that imports `test` straight from @playwright/test skips the fixture, so in the
// pod it fails before it runs a single assertion, and the failure reads as an
// environment bug rather than the one-line import it is.
//
// Five specs had drifted onto the direct import by 2026-10-12. A comment in
// fixtures.ts saying "use this" didn't stop that, so this test enforces it instead.
// Type-only imports (`import type { Page } from '@playwright/test'`) carry no
// runtime value and are fine.

const DIR = join(__dirname, '..', 'browser-gate');
const specs = readdirSync(DIR).filter((f) => f.endsWith('.spec.ts'));

// Any import from @playwright/test that is not `import type …`.
const VALUE_IMPORT = /^\s*import\s+(?!type\b)[^;]*?from\s+['"]@playwright\/test['"]/m;

describe('browser-gate specs import test from ./fixtures (#452)', () => {
  it('finds the gate specs (guards against a vacuous pass)', () => {
    expect(specs.length).toBeGreaterThanOrEqual(15); // 18 on 2026-10-12
  });

  it.each(specs)('%s takes no runtime import from @playwright/test', (file) => {
    const src = readFileSync(join(DIR, file), 'utf8');
    expect(src, `${file}: import test/expect from './fixtures', not '@playwright/test'`).not.toMatch(VALUE_IMPORT);
  });

  it.each(specs)('%s imports from ./fixtures', (file) => {
    const src = readFileSync(join(DIR, file), 'utf8');
    expect(src).toMatch(/from\s+['"]\.\/fixtures['"]/);
  });
});
