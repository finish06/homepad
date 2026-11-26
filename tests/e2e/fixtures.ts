import { test as base, expect, type Browser, type BrowserContext, type BrowserContextOptions } from '@playwright/test';

// Every tests/e2e spec takes `test` from here, not from '@playwright/test', and
// makes any extra context with newContext() below, not browser.newContext().
// tests/infra/e2e-mobile-project.test.ts enforces both.
//
// #739: in WebKit (the `mobile` project) every page gets a stylesheet that
// turns backdrop-filter off. The CI and QA runners have no GPU, so WebKit
// paints each blur in software. The dashboard stacks about 22 of them: one per
// tile, one per section, the header and the health bar, then the Admin Panel's
// glass and a scrim per dialog on top. Every change under an open dialog makes
// WebKit filter that whole stack again. Playwright waits for animation frames
// before each click, so kid-accounts TC-001 spent most of its 30 s on painting,
// and under full-suite load it ran out of time at whichever step was next
// (a click, a check, or the kid board still empty after the reload).
//
// Measured in the Playwright Linux image with 2 CPUs, running only TC-001
// with 2 workers (to isolate the blur's cost, not the suite's setting):
//   - with the blur, TC-001 took 19 to 29 s, and 4 of 30 runs failed;
//   - without it, the same run took about 11 s, and 0 of 30 failed;
//   - the first frame of the admin dashboard alone took 3.9 s with the blur.
// Stopping the header's 1 s clock made no real difference (18.5 s against 20 s).
// This alone did not hold for the full suite with 4 workers on 2 CPUs; the
// other half of the fix is the worker count in playwright.config.ts, which
// gives 1 worker there (its own comment has those numbers).
//
// What else changes: an element with backdrop-filter is also a stacking
// context and the containing block for its absolute and fixed descendants.
// Without it, those descendants are placed and stacked against an ancestor
// instead. tests/e2e/fixtures.spec.ts checks, with the real styles, that on the
// screens these specs use the only such descendants are .sr-only text and none
// sets a z-index, so the layout and hit targets the tests see are the same.
// No e2e spec checks pixels or the glass. Desktop Chromium keeps the real
// styles.
const NO_BACKDROP_FILTER =
  '*, *::before, *::after { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }';

function addNoBackdropFilter(css: string) {
  const add = () => {
    const style = document.createElement('style');
    style.dataset.e2e = 'no-backdrop-filter';
    style.textContent = css;
    (document.head ?? document.documentElement).appendChild(style);
  };
  // Init scripts run before the document has an <html> element. Add the style
  // as soon as there is one. A MutationObserver callback is a microtask, and
  // microtasks run before the browser's next chance to render, so the style is
  // in place before the first frame (fixtures.spec.ts checks this).
  if (document.documentElement) {
    add();
    return;
  }
  const observer = new MutationObserver(() => {
    if (!document.documentElement) return;
    observer.disconnect();
    add();
  });
  observer.observe(document, { childList: true });
}

async function prepare(context: BrowserContext, browserName: string): Promise<BrowserContext> {
  if (browserName === 'webkit') await context.addInitScript(addNoBackdropFilter, NO_BACKDROP_FILTER);
  return context;
}

// newContext — use this instead of browser.newContext(), so a context a spec
// makes itself is painted the same way as the `page` fixture's.
export async function newContext(browser: Browser, options?: BrowserContextOptions): Promise<BrowserContext> {
  return prepare(await browser.newContext(options), browser.browserType().name());
}

export const test = base.extend({
  context: async ({ context, browserName }, provide) => {
    await provide(await prepare(context, browserName));
  },
});

export { expect };
