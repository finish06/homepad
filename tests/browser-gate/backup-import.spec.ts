import { test, expect } from './fixtures';
import type { Locator, Page } from '@playwright/test';
import { BACKUP_FILE, mockTransfer, SERVICES_YAML } from './transferMocks';

// SPEC-backup-import TASK-308 — the Backup and import section and both flows in a
// real browser, at the iPad portrait width the UX was checked at (§7: "the modals
// work at 820px wide") and at desktop. The API is mocked (transferMocks.ts).

// The panels open with a short scale-in animation; measure after it ends, or a
// 44px button reads as 43.
async function settled(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
}

async function openSection(page: Page, w: number, h: number) {
  await page.setViewportSize({ width: w, height: h });
  const mock = await mockTransfer(page);
  await page.goto('/');
  await page.getByTestId('user-menu-trigger').click();
  await page.getByTestId('menu-admin-settings').click();
  const panel = page.getByRole('dialog', { name: 'Admin Panel' });
  await expect(panel).toBeVisible();
  const section = page.getByTestId('settings-backup');
  await section.scrollIntoViewIfNeeded();
  await settled(page);
  return { mock, panel, section };
}

async function fitsViewport(el: Locator, w: number, h: number, what: string) {
  await settled(el.page());
  const box = (await el.boundingBox())!;
  expect(box.x, `${what} starts off-screen`).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, `${what} runs past the right edge`).toBeLessThanOrEqual(w + 0.5);
  expect(box.height, `${what} is taller than the viewport`).toBeLessThanOrEqual(h + 0.5);
}

async function tall(el: Locator, what: string) {
  await settled(el.page());
  expect((await el.boundingBox())!.height, `${what} is under 44px`).toBeGreaterThanOrEqual(44);
}

for (const [label, w, h] of [
  ['iPad 820', 820, 1180],
  ['desktop 1440', 1440, 900],
] as const) {
  test.describe(`Backup and import — ${label}`, () => {
    test('the section is last, styled from its lazy stylesheet, with 44px buttons', async ({ page }) => {
      const { panel, section } = await openSection(page, w, h);
      const titles = await panel.locator('h3.settings-section-title').allTextContents();
      expect(titles[titles.length - 1]).toBe('Backup and import');
      for (const name of ['Download backup', 'Restore from file…', 'Import…']) {
        await tall(section.getByRole('button', { name }), name);
      }
      // The row layout comes from backup-import.css: if the lazy stylesheet did
      // not load, the rows would stack as plain blocks.
      const row = section.locator('.bi-row').first();
      expect(await row.evaluate((el) => getComputedStyle(el).display)).toBe('flex');
      await expect(section.getByText('The file will include email addresses. Keep it private.')).toBeVisible();
      await section.getByRole('checkbox', { name: /Include people/ }).uncheck();
      await expect(section.getByText('No emails or personal settings.')).toBeVisible();
    });

    test('restore: pick, Replace, type REPLACE, done — and the modal fits', async ({ page }) => {
      const { mock, section } = await openSection(page, w, h);
      await section.getByRole('button', { name: 'Restore from file…' }).click();
      const dialog = page.getByRole('dialog', { name: /Restore from backup/ });
      await expect(dialog).toBeVisible();
      await fitsViewport(dialog, w, h, 'restore modal');
      await dialog.getByLabel('Backup file').setInputFiles({
        name: 'homepad-backup-2026-11-07.json',
        mimeType: 'application/json',
        buffer: Buffer.from(BACKUP_FILE),
      });
      await expect(dialog.getByTestId('restore-file-meta')).toContainText('7 Nov 2026');
      await dialog.getByRole('radio', { name: /Replace/ }).check();
      await dialog.getByRole('button', { name: 'Preview' }).click();
      await expect(page.getByRole('heading', { name: 'Restore from backup, step 2 of 3' })).toBeFocused();
      await fitsViewport(dialog, w, h, 'restore preview');
      await expect(dialog.getByTestId('plan-group-toggle').first()).toHaveText(/Delete/);
      const replace = dialog.getByRole('button', { name: 'Replace', exact: true });
      await expect(replace).toBeDisabled();
      await tall(dialog.getByRole('button', { name: 'Back', exact: true }), 'Back');
      await dialog.getByLabel('Type REPLACE to confirm').fill('REPLACE');
      await replace.click();
      await expect(dialog.getByText('Restored.')).toBeVisible();
      expect(mock.restores.map((r) => r.path)).toEqual([
        '/api/admin/restore/preview?mode=replace',
        '/api/admin/restore?mode=replace&plan=hash-replace',
      ]);
      expect(mock.restores[1].body).toBe(BACKUP_FILE);
      await dialog.getByRole('button', { name: 'Done' }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole('dialog', { name: 'Admin Panel' })).toBeVisible();
    });

    test('Homepage import: paste, preview with status checks, import', async ({ page }) => {
      const { mock, section } = await openSection(page, w, h);
      await section.getByRole('button', { name: 'Import…' }).click();
      const dialog = page.getByRole('dialog', { name: /Import from Homepage/ });
      await fitsViewport(dialog, w, h, 'import modal');
      await dialog.getByRole('textbox', { name: 'services.yaml' }).fill(SERVICES_YAML);
      await dialog.getByRole('button', { name: 'Preview' }).click();
      await expect(page.getByRole('heading', { name: 'Import from Homepage, step 2 of 3' })).toBeFocused();
      await fitsViewport(dialog, w, h, 'import preview');
      await expect(dialog.getByTestId('plan-summary')).toHaveText('Add 3 sections · Add 4 apps');
      await expect(dialog.getByTestId('plan-row-app-Plex')).toContainText('Shows initials (mdi-plex).');
      const snippet = dialog.getByRole('textbox', { name: 'Gatus endpoints' });
      await expect(snippet).toHaveValue(/name: Router/);
      await tall(dialog.getByRole('button', { name: 'Copy' }), 'Copy');
      await dialog.getByRole('button', { name: 'Import 4 apps' }).click();
      await expect(dialog.getByText('Imported 4 apps into 3 new sections.')).toBeVisible();
      expect(mock.imports[0].body).toEqual({ services: SERVICES_YAML });
      expect(mock.imports[1].path).toBe('/api/admin/import/homepage?plan=hash-import');
    });

    test('Escape closes one layer at a time', async ({ page }) => {
      const { section } = await openSection(page, w, h);
      await section.getByRole('button', { name: 'Import…' }).click();
      const dialog = page.getByRole('dialog', { name: /Import from Homepage/ });
      await expect(dialog).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole('dialog', { name: 'Admin Panel' })).toBeVisible();
    });
  });
}

test('a parse error selects the line in the pasted file (UX §4.1)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockTransfer(page, {
    importError: { status: 422, code: 'not_homepage_services', message: 'not a list', file: 'services', line: 2 },
  });
  await page.goto('/');
  await page.getByTestId('user-menu-trigger').click();
  await page.getByTestId('menu-admin-settings').click();
  await page.getByTestId('settings-backup').getByRole('button', { name: 'Import…' }).click();
  const box = page.getByRole('textbox', { name: 'services.yaml' });
  await box.fill('services:\n  web:\n    image: nginx\n');
  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.getByText(/It should be a list of groups\. \(line 2\)/)).toBeVisible();
  await expect(box).toBeFocused();
  expect(await box.evaluate((el: HTMLTextAreaElement) => el.value.slice(el.selectionStart, el.selectionEnd))).toBe('  web:');
});
