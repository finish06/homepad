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
import { describe, it, expect } from 'vitest';
import { devices } from '@playwright/test';
import config from '../../playwright.config';

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
