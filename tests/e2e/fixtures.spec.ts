import { devices, type Page } from '@playwright/test';
import { mockAdminAccounts } from '../browser-gate/kidMocks';
import { newContext, test, expect } from './fixtures';

// #739 — the fixture in ./fixtures.ts turns backdrop-filter off in WebKit only.
// Checked on the built app, because a grep of fixtures.ts cannot show that the
// style lands before the first frame or that it wins over the app's CSS.

test('WebKit pages paint without backdrop-filter from the first frame; Chromium keeps the glass', async ({
  page,
  browserName,
}) => {
  // Registered after the fixture's script, so it runs after it. A frame
  // callback runs just before the browser renders that frame: record whether
  // the style was already there for the very first one.
  await page.addInitScript(() => {
    requestAnimationFrame(() => {
      (window as unknown as { __styleAtFirstFrame: boolean }).__styleAtFirstFrame = !!document.querySelector(
        'style[data-e2e="no-backdrop-filter"]',
      );
    });
  });
  await mockAdminAccounts(page);
  await page.goto('/');
  const tile = page.getByTestId('tool-link').first();
  await expect(tile).toBeVisible();

  const filter = await tile.evaluate((el) => {
    const s = getComputedStyle(el);
    return s.backdropFilter || s.getPropertyValue('-webkit-backdrop-filter');
  });
  const atFirstFrame = await page.evaluate(() => (window as unknown as { __styleAtFirstFrame?: boolean }).__styleAtFirstFrame);

  if (browserName === 'webkit') {
    expect(filter).toBe('none');
    expect(atFirstFrame).toBe(true);
  } else {
    expect(filter).toContain('blur(');
    expect(atFirstFrame).toBe(false);
  }
});

// Removing backdrop-filter also removes a stacking context and a containing
// block. This runs with the REAL styles (Chromium) on the screens the mobile
// specs use, and lists every absolute or fixed element whose containing block
// is a backdrop-filter element, and every positioned element with a z-index
// whose stacking context is one. Today that is only visually hidden .sr-only
// text, which has no size to lay out or click. If a real element shows up, the
// WebKit project no longer tests the layout that ships.
async function placedByGlass(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const glass = (e: Element) => {
      const s = getComputedStyle(e);
      const v = s.backdropFilter || s.getPropertyValue('-webkit-backdrop-filter');
      return !!v && v !== 'none';
    };
    // Anything else that would also be a containing block for fixed content,
    // or a stacking context, so the glass is not the one that matters.
    const otherwise = (e: Element) => {
      const s = getComputedStyle(e);
      return (
        s.transform !== 'none' ||
        (s.filter !== '' && s.filter !== 'none') ||
        s.perspective !== 'none' ||
        /paint|layout|strict|content/.test(s.contain) ||
        /transform|filter|perspective/.test(s.willChange)
      );
    };
    const out: string[] = [];
    for (const el of document.querySelectorAll('body *')) {
      // Visually hidden text (1x1, clipped) has nothing to place or click.
      // Only while it stays that small: a skip link that grows on focus counts.
      const box = el.getBoundingClientRect();
      if (el.classList.contains('sr-only') && box.width <= 1 && box.height <= 1) continue;
      const s = getComputedStyle(el);
      const placed = s.position === 'absolute' || s.position === 'fixed';
      const stacked = s.position !== 'static' && s.zIndex !== 'auto';
      if (!placed && !stacked) continue;
      let needBlock = placed;
      let needStack = stacked;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        // Is `a` this element's containing block or stacking context even
        // without the glass? Then the glass does not decide that.
        const as = getComputedStyle(a);
        const containsAnyway =
          otherwise(a) || (s.position === 'absolute' && as.position !== 'static');
        const stacksAnyway =
          otherwise(a) ||
          (as.position !== 'static' && as.zIndex !== 'auto') ||
          as.position === 'fixed' ||
          as.position === 'sticky' ||
          Number(as.opacity) < 1 ||
          as.isolation === 'isolate' ||
          as.mixBlendMode !== 'normal';
        if (needBlock && containsAnyway) needBlock = false;
        if (needStack && stacksAnyway) needStack = false;
        if (!needBlock && !needStack) break;
        if (glass(a)) {
          out.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} in ${a.tagName.toLowerCase()}.${[...a.classList].join('.')}`);
          break;
        }
      }
    }
    return out;
  });
}

async function walkScreens(page: Page, where: string) {
  await mockAdminAccounts(page);
  await page.goto('/');
  await expect(page.getByTestId('tool-link').first()).toBeVisible();
  expect(await placedByGlass(page), `${where}: dashboard`).toEqual([]);

  await page.getByTestId('user-menu-trigger').click();
  await expect(page.getByTestId('menu-accounts')).toBeVisible();
  expect(await placedByGlass(page), `${where}: user menu`).toEqual([]);

  await page.getByTestId('menu-accounts').click();
  await expect(page.getByRole('heading', { name: 'Accounts', level: 3 })).toBeVisible();
  expect(await placedByGlass(page), `${where}: Admin Panel, Accounts`).toEqual([]);

  await page.getByTestId('account-row').filter({ hasText: 'Maya' }).getByRole('button').click();
  const editor = page.getByRole('dialog', { name: 'Maya' });
  await expect(editor.getByTestId('kid-checklist')).toBeVisible();
  expect(await placedByGlass(page), `${where}: kid editor`).toEqual([]);

  await editor.getByRole('button', { name: 'Sign in this device as Maya' }).click();
  await expect(page.getByRole('alertdialog', { name: 'Sign in this device as Maya?' })).toBeVisible();
  expect(await placedByGlass(page), `${where}: sign-in-here confirm`).toEqual([]);
}

test('the glass places no real element, so WebKit without it lays out the same', async ({
  page,
  browser,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'needs the real styles; WebKit has the glass turned off');
  await walkScreens(page, 'desktop');
  // The mobile project's layout (iPhone 13 size, touch, mobile), in Chromium
  // so the glass is still on.
  const iPhone = { ...devices['iPhone 13'], defaultBrowserType: undefined };
  const phone = await newContext(browser, { ...iPhone, deviceScaleFactor: 1 });
  try {
    await walkScreens(await phone.newPage(), 'iPhone 13 layout');
  } finally {
    await phone.close();
  }
});
