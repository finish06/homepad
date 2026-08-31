import { test, expect } from './fixtures';
import { mockApi, makeCategorized } from './mockApi';

// #322 / AC-011 — real-browser GATE. In Chromium, clicking "Keep editing" in the
// discard strip was SAVING the tile: React reconciles the two .tile-edit-actions
// branches by position, so the very <button> the user clicks as "Keep editing"
// (type=button) is REUSED and morphed into the "Save" (type=submit) button when
// setConfirmDiscard(false) collapses the strip — Chrome then activates it as a
// form submit (observed: submit event with submitter="tile-edit-save"). jsdom
// has no activation model, so the unit suite stays green even with the bug live;
// only a real browser catches it (the #35 lesson). The fix keys the two action
// rows so React REMOUNTS instead of morphing the clicked node. This gate asserts
// the observable symptom: Keep editing stays in the editor and fires NO save.
test('Keep editing dismisses the discard strip without saving the tile (#322)', async ({ page }) => {
  const { services, categories } = makeCategorized(1, 1);
  await mockApi(page, services, categories, 'admin');

  // Record any tile-save PATCH. In the fixed app this stays empty; the bug fired
  // PATCH /api/services/:id with the dirty title.
  const savePatches: string[] = [];
  await page.route('**/api/services/*', async (route) => {
    const req = route.request();
    if (req.method() === 'PATCH') {
      savePatches.push(req.url());
      await route.fulfill({ status: 200, json: { ...services[0], name: 'SHOULD_NOT_SAVE' } });
      return;
    }
    await route.fallback();
  });

  await page.goto('/');
  await expect(page.getByTestId('app-grid-box').first()).toBeVisible();

  // Enter admin edit mode → the per-tile pencil (AC-001) appears.
  await page.getByTestId('settings-gear').click();
  await page.getByTestId('gear-edit-dashboard').click();

  // Open the tile's edit modal via the real pencil affordance.
  await page.getByTestId('tile-edit').first().click();
  const title = page.getByTestId('tile-field-title');
  await expect(title).toBeVisible();
  const original = await title.inputValue();

  // Make the form dirty, then Esc → the inline discard confirm strip appears.
  await title.click();
  await title.type('_DIRTY');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('tile-discard-confirm')).toBeVisible();

  // #321 (§8.4) — the strip's safe default ("Keep editing") receives focus when
  // it appears, so Enter keeps editing rather than confirming discard. Guards the
  // imperative useRef+useEffect focus (replacing declarative autoFocus).
  await expect(page.getByTestId('tile-discard-keep')).toBeFocused();

  // The action under test: click "Keep editing".
  await page.getByTestId('tile-discard-keep').click();

  // Back in the editor, nothing saved: strip gone, modal still open with the
  // dirty value intact, and crucially NO save PATCH was ever fired.
  await expect(page.getByTestId('tile-discard-confirm')).toHaveCount(0);
  await expect(title).toBeVisible();
  await expect(title).toHaveValue(`${original}_DIRTY`);
  expect(savePatches, 'clicking Keep editing must not save the tile').toEqual([]);
});
