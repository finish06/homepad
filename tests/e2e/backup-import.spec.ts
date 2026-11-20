import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { BACKUP_FILE, mockTransfer, SERVICES_YAML } from '../browser-gate/transferMocks';

// SPEC-backup-import — end to end against the BUILT app (vite preview), with the
// homepad-api contract mocked (tests/browser-gate/transferMocks.ts). Runs on both
// projects in playwright.config.ts: desktop 1440 and iPhone 13.

async function openBackupSection(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByTestId('user-menu-trigger').click();
  await page.getByTestId('menu-admin-settings').click();
  const section = page.getByTestId('settings-backup');
  await section.scrollIntoViewIfNeeded();
  return section;
}

test('TC-001/TC-002 — download a backup with and without people', async ({ page }) => {
  const mock = await mockTransfer(page);
  const section = await openBackupSection(page);

  const first = page.waitForEvent('download');
  await section.getByRole('button', { name: 'Download backup' }).click();
  const dl = await first;
  expect(dl.suggestedFilename()).toBe('homepad-backup-2026-11-07.json');
  expect(JSON.parse(readFileSync((await dl.path())!, 'utf8')).format).toBe('homepad-backup');

  await section.getByRole('checkbox', { name: /Include people/ }).uncheck();
  const second = page.waitForEvent('download');
  await section.getByRole('button', { name: 'Download backup' }).click();
  await second;
  expect(mock.exports).toEqual(['?people=true', '?people=false']);
});

test('TC-003 — restore a backup in Merge mode', async ({ page }) => {
  const mock = await mockTransfer(page);
  const section = await openBackupSection(page);
  await section.getByRole('button', { name: 'Restore from file…' }).click();
  const dialog = page.getByRole('dialog', { name: /Restore from backup/ });
  await dialog.getByLabel('Backup file').setInputFiles({
    name: 'homepad-backup-2026-11-07.json',
    mimeType: 'application/json',
    buffer: Buffer.from(BACKUP_FILE),
  });
  await dialog.getByRole('button', { name: 'Preview' }).click();
  await expect(dialog.getByTestId('plan-summary')).toHaveText('Add 1 app · Add 1 kid');
  await expect(dialog.getByText('Nothing changes until you select Restore.')).toBeVisible();
  expect(mock.restores).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(dialog.getByText('Restored.')).toBeVisible();
  await expect(dialog.getByText('Added 1 kid: Sam. Sign their device in from Accounts.')).toBeVisible();
  expect(mock.restores[1].path).toBe('/api/admin/restore?mode=merge&plan=hash-merge');
});

test('TC-008 — import a Homepage services.yaml', async ({ page }) => {
  const mock = await mockTransfer(page);
  const section = await openBackupSection(page);
  await section.getByRole('button', { name: 'Import…' }).click();
  const dialog = page.getByRole('dialog', { name: /Import from Homepage/ });
  await dialog.getByRole('textbox', { name: 'services.yaml' }).fill(SERVICES_YAML);
  await dialog.getByRole('button', { name: 'Preview' }).click();
  await expect(dialog.getByTestId('plan-row-app-Sonarr')).toContainText('Widget not imported.');
  await expect(dialog.getByRole('textbox', { name: 'Gatus endpoints' })).toHaveValue(/icmp:\/\/192\.0\.2\.1/);
  await dialog.getByRole('button', { name: 'Import 4 apps' }).click();
  await expect(dialog.getByText('Imported 4 apps into 3 new sections.')).toBeVisible();
  await expect(dialog.getByText("They're at the end of your dashboard. Other people see them A–Z until they arrange their own.")).toBeVisible();
  // The widget key is in what was pasted, and nowhere in what came back.
  expect(JSON.stringify(mock.imports[0].body)).toContain('abc123');
  await expect(page.locator('body')).not.toContainText('abc123');
});
