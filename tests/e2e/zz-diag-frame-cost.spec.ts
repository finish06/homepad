// TEMPORARY DIAGNOSTIC — not for merge. Measures rAF frame cost on the CI
// runner's WebKit under several variants, and reports via a deliberate failure
// so the numbers land in the job log.
import { test, expect, type Page } from '@playwright/test';
import { mockAdminAccounts } from '../browser-gate/kidMocks';

test.describe.configure({ retries: 0, mode: 'parallel' });

async function frames(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const ts: number[] = [];
    const start = performance.now();
    await new Promise<void>((res) => {
      const f = (t: number) => { ts.push(t); if (ts.length < 11 && performance.now() - start < 15000) requestAnimationFrame(f); else res(); };
      requestAnimationFrame(f);
    });
    const d = ts.slice(1).map((t, i) => Math.round(t - ts[i]));
    const anims = document.getAnimations().length;
    return `rAF ms=[${d.join(',')}] anims=${anims}`;
  });
}

async function trialMs(page: Page, loc: ReturnType<Page['locator']>): Promise<number> {
  const t = Date.now();
  await loc.click({ trial: true, timeout: 60_000 });
  return Date.now() - t;
}

const variants: Record<string, { use?: Record<string, unknown>; css?: string }> = {
  baseline: {},
  reducedMotion: { use: { reducedMotion: 'reduce' } },
  noBackdrop: { css: '*,*::before,*::after{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}' },
  noAnimation: { css: '*,*::before,*::after{animation:none!important;transition:none!important}' },
  dpr1: { use: { deviceScaleFactor: 1 } },
};

for (const [name, v] of Object.entries(variants)) {
  test.describe(name, () => {
    if (v.use) test.use(v.use);
    test(`diag ${name}`, async ({ page }, info) => {
      test.skip(info.project.name !== 'mobile', 'mobile only');
      test.setTimeout(240_000);
      await mockAdminAccounts(page);
      if (v.css) await page.addInitScript((css) => {
        document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); });
      }, v.css);
      await page.goto('/');
      await expect(page.getByTestId('user-menu-trigger')).toBeVisible();
      const out: string[] = [];
      out.push(`home: ${await frames(page)} trial=${await trialMs(page, page.getByTestId('user-menu-trigger'))}ms`);
      await page.getByTestId('user-menu-trigger').click({ timeout: 60_000 });
      await page.getByTestId('menu-accounts').click({ timeout: 60_000 });
      await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible({ timeout: 30_000 });
      const addBtn = page.getByRole('button', { name: '+ Add a kid' });
      out.push(`panel: ${await frames(page)} trial=${await trialMs(page, addBtn)}ms`);
      await addBtn.click({ timeout: 60_000 });
      const dlg = page.getByRole('dialog', { name: 'Add a kid' });
      await dlg.getByLabel('Name').fill('Sam');
      const save = dlg.getByRole('button', { name: 'Save' });
      await expect(save).toBeEnabled();
      out.push(`dialog: ${await frames(page)} trial=${await trialMs(page, save)}ms`);
      expect(`DIAG ${name} :: ${out.join(' | ')}`).toBe('report');
    });
  });
}
