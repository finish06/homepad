import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { WIDGET_ADDRESS, WIDGET_KEY, WIDGET_USERNAME, INFO_ON, mockWidgets } from '../browser-gate/widgetMocks';

// SPEC-status-widgets §8.4 / AC-002 / AC-003 / TC-004 — modelled on
// no-gatus-leak.spec.ts. A widget is configured (address, username, a saved
// key) behind a mocked API. The mock serves the admin widget routes with the
// FULL admin payload whatever the session (the real API 403s a non-admin), so
// if a non-admin dashboard ever asked for them, the sentinels would reach the
// page and this test would see them.

const SENTINELS = [WIDGET_ADDRESS, WIDGET_USERNAME, WIDGET_KEY];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

for (const role of ['user', 'kid'] as const) {
  test(`a ${role} receives no widget address, username or key`, async ({ page }) => {
    const mock = await mockWidgets(page, { role, info: INFO_ON, savedWidget: true, density: 'compact' });
    await page.goto('/');
    await expect(page.getByTestId('tool-link').first()).toBeVisible();
    await expect(page.getByTestId('glance-strip')).toBeVisible();

    // Use the surfaces a viewer has: ⌘K with a query, and (adults) My settings.
    await page.getByTestId('launcher-trigger').click();
    await page.getByTestId('launcher-input').fill('jelly');
    await page.keyboard.press('Escape');
    if (role === 'user') {
      await page.getByTestId('user-menu-trigger').click();
      await page.getByTestId('menu-my-settings').click();
      await expect(page.getByRole('switch', { name: 'Show widgets' })).toBeVisible();
    }

    const leaked = mock.responses.filter((r) => SENTINELS.some((s) => r.body.includes(s)));
    expect(leaked, 'a widget address, username or key reached a non-admin').toEqual([]);
    const adminCalls = mock.responses.filter((r) => r.path.startsWith('/api/admin/') || /\/widget(\/|$)/.test(r.path));
    expect(adminCalls.map((r) => `${r.method} ${r.path}`), 'a non-admin called an admin widget route').toEqual([]);
    for (const s of SENTINELS) expect(await page.content()).not.toContain(s);
  });
}

test('the built bundle holds no widget address, username or key', async () => {
  const files = walk(join(process.cwd(), 'dist')).filter((f) => /\.(js|html|css|map|json)$/.test(f));
  expect(files.length).toBeGreaterThan(0);
  for (const f of files) {
    const content = readFileSync(f, 'utf8');
    for (const s of SENTINELS) expect(content.includes(s), `${f} contains ${s}`).toBe(false);
  }
});

test('an admin types a key, saves it, and never sees it again (AC-003)', async ({ page }) => {
  const mock = await mockWidgets(page, { role: 'admin', density: 'compact' });
  await page.goto('/');
  await page.getByTestId('settings-gear').click();
  await page.getByTestId('gear-edit-dashboard').click();
  await page.getByRole('button', { name: 'Edit Jellyfin' }).click();
  const section = page.getByTestId('widget-section');
  await expect(section.getByLabel('Type')).toHaveValue('jellyfin');
  await section.getByLabel('Address').fill(WIDGET_ADDRESS);
  await section.getByLabel('API key').fill(WIDGET_KEY);
  await page.getByTestId('tile-edit-save').click();
  await expect(page.getByTestId('tile-edit-modal')).toBeHidden();
  expect(mock.puts).toHaveLength(1);
  expect(mock.puts[0]).toMatchObject({ kind: 'jellyfin', address: WIDGET_ADDRESS, secret: WIDGET_KEY });

  await page.getByRole('button', { name: 'Edit Jellyfin' }).click();
  await expect(section.getByText('Key saved')).toBeVisible();
  expect(await page.content()).not.toContain(WIDGET_KEY);
  // The key went out once, in the PUT body, and never came back in a response.
  expect(mock.responses.filter((r) => r.body.includes(WIDGET_KEY))).toEqual([]);
});
