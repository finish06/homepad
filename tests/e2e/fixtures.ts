import { test as base, expect } from '@playwright/test';

// Every tests/e2e spec imports `test` and `expect` from here, not from
// '@playwright/test' (tests/infra/e2e-mobile-project.test.ts enforces it).
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
// Measured in the Playwright Linux image with 2 CPUs and 2 workers:
//   - with the blur, TC-001 took 19 to 29 s, and 4 of 30 runs failed;
//   - without it, the same run took about 11 s, and 0 of 30 failed;
//   - the first frame of the admin dashboard alone took 3.9 s with the blur.
// Stopping the header's 1 s clock made no real difference (18.5 s against 20 s).
// This alone did not hold with 4 workers on 2 CPUs; the other half of the fix
// is the worker count in playwright.config.ts.
//
// No e2e spec checks pixels or the glass, so this changes how the page is
// painted, not what it does. Desktop Chromium keeps the real styles. A
// context a spec makes itself with browser.newContext() does not get this.
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
  // as soon as there is one, so even the first paint has no blur.
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

export const test = base.extend({
  context: async ({ context, browserName }, provide) => {
    if (browserName === 'webkit') await context.addInitScript(addNoBackdropFilter, NO_BACKDROP_FILTER);
    await provide(context);
  },
});

export { expect };
