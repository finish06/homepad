import { test, expect } from './fixtures';
import { mockApi, makeStatusTiles } from './mockApi';

// SPEC-v25-gatus-key-tile-health — real-browser GATE for the "Gatus endpoint key"
// field added to the TileEditModal, plus the key→meter state contract.
//
// Why a real-browser gate (the #35/#322 lesson): the field's SAVE is a genuine
// form submit inside the same keyed action-row structure that morphed buttons in
// #322 — jsdom has no activation model, so only Chromium proves the typed slug
// actually rides the PATCH. The meter half asserts the paint the frontend renders
// from the server-resolved status (a set key → GREEN/RED, no key → GRAY
// NOT_MONITORED, a mismatched/unknown key → UNKNOWN), which jsdom cannot compute.

const GATUS_HELP =
  'The endpoint key from your Gatus config — its group_name (e.g. kube_plex). Leave blank to disable health monitoring.';

// One monitored tile (gatus_key preset) so the field has a value to prefill.
function monitoredService() {
  return [
    {
      id: 'svc-1',
      slug: 'plex',
      name: 'Plex',
      description: 'Media',
      url: 'https://plex.example.test',
      icon: '',
      status: 'UP',
      favorite: false,
      iconLight: false,
      iconDark: false,
      categoryId: 'cat-1',
      gatus_key: 'kube_plex',
    },
  ];
}
const CATEGORY = [{ id: 'cat-1', name: 'Media', sortIndex: 0, gridWidth: 4 }];

async function openTileEditor(page: import('@playwright/test').Page) {
  await page.goto('/');
  await expect(page.getByTestId('app-grid-box').first()).toBeVisible();
  await page.getByTestId('settings-gear').click();
  await page.getByTestId('gear-edit-dashboard').click();
  await page.getByTestId('tile-edit').first().click();
  await expect(page.getByTestId('tile-field-gatus-key')).toBeVisible();
}

test.describe('v25 TileEditModal — Gatus endpoint key field', () => {
  // AC-003/AC-004/AC-005 — the field renders below Description, prefills the current
  // slug, and shows the approved help copy — verified in a real paint, not jsdom.
  test('shows the Gatus endpoint key field, prefilled with the current slug and help copy', async ({
    page,
  }) => {
    await mockApi(page, monitoredService(), CATEGORY, 'admin');
    await openTileEditor(page);

    const field = page.getByTestId('tile-field-gatus-key');
    await expect(field).toHaveValue('kube_plex'); // AC-004 prefill
    await expect(field).toHaveAttribute('type', 'text'); // §8.8 — slug, not a URL
    await expect(field).toHaveAttribute('placeholder', 'e.g. kube_plex'); // §8.4
    await expect(page.getByTestId('tile-gatus-key-help')).toHaveText(GATUS_HELP); // AC-005

    // §8.1 — the field is below the Description textarea (DOM order).
    const gatusBox = await field.boundingBox();
    const descBox = await page.getByTestId('tile-field-description').boundingBox();
    expect(gatusBox!.y).toBeGreaterThan(descBox!.y);
  });

  // AC-006 — editing the slug and Saving fires a PATCH whose body carries the
  // TRIMMED gatus_key. This is the real form-submit path (#322-class), so a real
  // browser is the only place the typed value is proven to reach the wire.
  test('saving a new key PATCHes the trimmed gatus_key', async ({ page }) => {
    await mockApi(page, monitoredService(), CATEGORY, 'admin');

    let patchBody: Record<string, unknown> | null = null;
    await page.route('**/api/services/*', async (route) => {
      const req = route.request();
      if (req.method() === 'PATCH') {
        patchBody = req.postDataJSON();
        await route.fulfill({ status: 200, json: { ...monitoredService()[0], gatus_key: 'media_jellyfin' } });
        return;
      }
      await route.fallback();
    });

    await openTileEditor(page);
    const field = page.getByTestId('tile-field-gatus-key');
    await field.fill('  media_jellyfin  '); // leading/trailing space → must be trimmed
    await page.getByTestId('tile-edit-save').click();

    await expect.poll(() => patchBody).not.toBeNull();
    expect(patchBody!.gatus_key).toBe('media_jellyfin');
    // §8.5 — no modal error is raised for this field.
    await expect(page.getByTestId('tile-edit-error')).toHaveCount(0);
  });

  // AC-007 — clearing the field Saves gatus_key:"" (clears monitoring). Blank is a
  // valid state, never a validation error (§8.5, AC-011).
  test('clearing the key PATCHes gatus_key:"" with no error', async ({ page }) => {
    await mockApi(page, monitoredService(), CATEGORY, 'admin');

    let patchBody: Record<string, unknown> | null = null;
    await page.route('**/api/services/*', async (route) => {
      const req = route.request();
      if (req.method() === 'PATCH') {
        patchBody = req.postDataJSON();
        await route.fulfill({ status: 200, json: { ...monitoredService()[0], gatus_key: '' } });
        return;
      }
      await route.fallback();
    });

    await openTileEditor(page);
    await page.getByTestId('tile-field-gatus-key').fill('   '); // whitespace-only → trims to ""
    await page.getByTestId('tile-edit-save').click();

    await expect.poll(() => patchBody).not.toBeNull();
    expect(patchBody!.gatus_key).toBe('');
    await expect(page.getByTestId('tile-edit-error')).toHaveCount(0);
  });
});

// AC-015 — the key→meter contract: a resolved status paints the v15 health meter
// GREEN (up) / RED (down) / GRAY (not-monitored, no key) / GRAY (unknown, a
// mismatched key). The server resolves the key to the status; the frontend paints
// it. This confirms the four states the v25 field feeds are rendered distinctly.
test('the health meter paints GREEN=up, RED=down, GRAY=not-monitored, GRAY=unknown', async ({
  page,
}) => {
  // UP = key set & up; DOWN = key set & down; NOT_MONITORED = no key; UNKNOWN = key
  // set but not in the Gatus snapshot (mismatched/unknown key or Gatus unreachable).
  const { services, categories } = makeStatusTiles(['UP', 'DOWN', 'NOT_MONITORED', 'UNKNOWN']);
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page, services, categories, 'user');
  await page.goto('/');

  const dot = (state: string) =>
    page.locator('.app-grid-tool-wrap', { hasText: `App ${state}` }).getByTestId('tile-status');
  const bgOf = (state: string) =>
    dot(state).evaluate((el) => getComputedStyle(el).backgroundColor);
  const borderOf = (state: string) =>
    dot(state).evaluate((el) => getComputedStyle(el).borderStyle);

  expect(await bgOf('UP')).toBe('rgb(16, 185, 129)'); // GREEN
  expect(await bgOf('DOWN')).toBe('rgb(239, 68, 68)'); // RED
  expect(await bgOf('UNKNOWN')).toBe('rgb(163, 163, 163)'); // GRAY (mismatched key)
  // NOT_MONITORED (no key) = the hollow, dashed GRAY shape — visually distinct.
  expect(await bgOf('NOT_MONITORED')).toBe('rgba(0, 0, 0, 0)');
  expect(await borderOf('NOT_MONITORED')).toBe('dashed');
});
