import { test as base, expect, type Browser, type PlaywrightWorkerArgs } from '@playwright/test';
import { decideGateCdp } from './sidecar';
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
//
// #524: WHETHER to attach is decided once, in playwright.gate.config.ts, and
// arrives here via the environment (see sidecar.ts). It used to be a per-worker
// 2s probe that, under load, quietly fell back to a browser the pod can't run.
// The fallback is gone: once a sidecar was detected, a worker attaches to it or
// fails loudly saying so.
const CDP_ENDPOINT = decideGateCdp(process.env);

// #344: resolve the sidecar's raw ws:// debugger URL and connect to THAT directly.
// connectOverCDP(<http url>) makes playwright do its own /json/version discovery +
// http→ws upgrade, which intermittently times out (30s) against the Chrome 148
// sidecar (148.0.7778.97) even though the ws connect itself works. A ws:// endpoint
// is passed straight through; any discovery failure falls back to the original
// endpoint so this is never worse than before.
function resolveWsEndpoint(endpoint: string): string {
  if (/^wss?:\/\//i.test(endpoint)) return endpoint;
  try {
    const out = execSync(`curl -sf --max-time 5 ${endpoint.replace(/\/+$/, '')}/json/version`, {
      encoding: 'utf8',
    });
    const ws = JSON.parse(out).webSocketDebuggerUrl;
    return typeof ws === 'string' && ws ? ws : endpoint;
  } catch {
    return endpoint;
  }
}

async function attach(playwright: PlaywrightWorkerArgs['playwright'], endpoint: string): Promise<Browser> {
  let last: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await playwright.chromium.connectOverCDP(resolveWsEndpoint(endpoint), { timeout: 30_000 });
    } catch (err) {
      last = err;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  throw new Error(
    `The CDP sidecar at ${endpoint} was detected when the gate started, but this worker ` +
      `could not attach to it after 3 attempts. Not falling back to Playwright's bundled ` +
      `browser, which a QA pod can't run (#524/#507). Last error: ${String(last)}`,
  );
}

// Only override the built-in `browser` fixture when the gate decided to use the
// sidecar; otherwise re-export the stock `test`, leaving Playwright's normal
// launch (and all of its launchOptions handling) completely untouched.
export const test =
  CDP_ENDPOINT !== 'off'
    ? base.extend({
        browser: [
          async ({ playwright }, use) => {
            const browser = await attach(playwright, CDP_ENDPOINT);
            await use(browser);
            // Disconnects from the shared sidecar (does not kill it).
            await browser.close();
          },
          { scope: 'worker' },
        ],
      })
    : base;

export { expect };
