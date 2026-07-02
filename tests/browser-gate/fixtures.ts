import { test as base, expect } from '@playwright/test';
import { execSync } from 'node:child_process';

// Browser acquisition for the #35 real-browser gate.
//
// In CI (and on any host with a launchable Chromium) Playwright launches its own
// browser exactly as normal — nothing here changes that path.
//
// On the QA pods, though, the Playwright-managed Chromium *cannot* launch: the
// app container is missing the system libraries a browser needs and there is no
// sudo to add them (see the "no browser" retro). What every pod DOES ship is a
// Chromium DevTools sidecar in the same Pod, reachable over CDP at
// 127.0.0.1:9222 (CLAUDE.md). Because pod containers share a network namespace,
// that sidecar can also reach the `vite preview` server this gate serves on
// localhost. So when the sidecar is up we attach to it over CDP instead of
// launching a browser — and `npm run test:gate` runs on the pod with no browser
// download, the same specs, same assertions. Fixes homepad issue #202.
//
// Escape hatch: set PW_CDP_ENDPOINT to point at a different CDP endpoint, or to
// `off` to force Playwright's normal launch path even if something is on :9222.
const CDP_ENDPOINT = process.env.PW_CDP_ENDPOINT ?? 'http://127.0.0.1:9222';

function sidecarReachable(endpoint: string): boolean {
  if (process.env.PW_CDP_ENDPOINT === 'off') return false;
  try {
    execSync(`curl -sf --max-time 2 ${endpoint}/json/version`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Only override the built-in `browser` fixture when there's actually a sidecar to
// attach to; otherwise re-export the stock `test`, leaving Playwright's normal
// launch (and all of its launchOptions handling) completely untouched.
export const test = sidecarReachable(CDP_ENDPOINT)
  ? base.extend({
      browser: [
        async ({ playwright }, use) => {
          const browser = await playwright.chromium.connectOverCDP(CDP_ENDPOINT);
          await use(browser);
          // Disconnects from the shared sidecar (does not kill it).
          await browser.close();
        },
        { scope: 'worker' },
      ],
    })
  : base;

export { expect };
