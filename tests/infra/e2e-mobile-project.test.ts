// Guard: the e2e `mobile` project is an iPhone 13 rasterized at 1x.
//
// On the GPU-less CI runner WebKit paints in software, and the app's
// backdrop-filter glass at the iPhone 13's 3x scale made each frame take
// seconds. Playwright's "stable" check waits on requestAnimationFrame, so
// kid-accounts TC-001 timed out at a different step on every retry. 1x keeps
// frames at ~16 ms there. See the comment on the project in playwright.config.ts.
//
// The test also pins the rest of the device so the fix cannot drift into
// "not really a phone any more": same CSS viewport, touch, mobile and WebKit.
//
// #739: 1x was not enough under full-suite load. tests/e2e/fixtures.ts also
// turns backdrop-filter off in WebKit, and only specs that take `test` from
// that file get it. The last block below fails a spec that imports `test` from
// '@playwright/test' instead. tests/e2e/fixtures.spec.ts checks, on the built
// app, that the style really applies.
import { readdirSync, readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { devices } from '@playwright/test';
import config, { E2E_WORKERS } from '../../playwright.config';

const mobile = config.projects?.find((p) => p.name === 'mobile');
const iPhone13 = devices['iPhone 13'];

describe('e2e mobile project (kid-accounts TC-001 CI flake)', () => {
  it('exists', () => {
    expect(mobile, 'playwright.config.ts must define a "mobile" project').toBeTruthy();
  });

  it('rasterizes at 1x', () => {
    expect(mobile?.use?.deviceScaleFactor).toBe(1);
  });

  it('keeps the iPhone 13 layout, touch, UA and WebKit', () => {
    expect(mobile?.use?.viewport).toEqual(iPhone13.viewport);
    expect(mobile?.use?.isMobile).toBe(true);
    expect(mobile?.use?.hasTouch).toBe(true);
    expect(mobile?.use?.userAgent).toBe(iPhone13.userAgent);
    expect(mobile?.use?.defaultBrowserType).toBe('webkit');
  });
});

describe('e2e specs use the shared fixture (#739)', () => {
  const dir = join(__dirname, '..', 'e2e');
  const specs = readdirSync(dir).filter((f) => f.endsWith('.spec.ts'));

  it('finds the specs', () => {
    expect(specs.length).toBeGreaterThan(5);
  });

  it.each(specs)('%s takes test and expect from ./fixtures', (file) => {
    const src = readFileSync(join(dir, file), 'utf8');
    expect(src).toMatch(/^import \{ test, expect \} from '\.\/fixtures';$/m);
    // Types from '@playwright/test' are fine; the runtime `test` is not.
    const direct = [...src.matchAll(/^import \{([^}]*)\} from '@playwright\/test';$/gm)].flatMap((m) =>
      m[1].split(',').map((x) => x.trim()),
    );
    expect(direct.filter((name) => name && !name.startsWith('type '))).toEqual([]);
  });

  it('the fixture turns backdrop-filter off in WebKit only', () => {
    const src = readFileSync(join(dir, 'fixtures.ts'), 'utf8');
    expect(src).toContain("browserName === 'webkit'");
    expect(src).toMatch(/backdrop-filter: none !important/);
  });
});

// #739: Playwright's default worker count reads os.cpus(), which in a
// container is the host's cores, not the CPU limit. The config sizes the pool
// from availableParallelism() (which follows the limit) instead.
describe('e2e worker count follows the CPU limit (#739)', () => {
  it('is half of availableParallelism(), at least 1', () => {
    expect(E2E_WORKERS).toBe(Math.max(1, Math.floor(availableParallelism() / 2)));
    expect(config.workers).toBe(E2E_WORKERS);
  });
});
