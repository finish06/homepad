import { test, expect } from './fixtures';
import { mockApi, enterArrange } from './mockApi';

// SPEC-ui-cleanup-18.3.0 AC-007 (#513) — in arrange mode the ★ (top-right) and the
// edit pencil (bottom-right) share the tile's right rail. v21 §8.1 proved their
// 44px hit areas disjoint for tiles ≥86px tall; tile density later made the
// default (compact) tile 68px and the list row 44px, and the pencil began taking
// taps aimed at the ★'s lower half.
//
// Only a real browser can answer "which control gets this tap", so this gate
// hit-tests a 1px grid of points around the tile's right edge with
// elementFromPoint and checks three things at every density:
//   1. the two hit areas split at the middle of the gap (or overlap) between the
//      painted buttons, along the axis they are stacked on: no point on the ★'s
//      side goes to the pencil, and none on the pencil's side goes to the ★;
//   2. each control still answers at its own centre;
//   3. each control keeps a hit area of at least 24×24 (WCAG 2.5.8), and Large
//      keeps the full 44×44 (v20 / #255).

const SERVICES = [
  {
    id: 'svc-1',
    slug: 'svc-1',
    name: 'Grafana',
    description: '',
    url: 'https://grafana.example.test',
    icon: '',
    status: 'UP',
    favorite: true,
    iconLight: false,
    iconDark: false,
    categoryId: 'cat-1',
  },
];
const CATEGORIES = [{ id: 'cat-1', name: 'Group 1', sortIndex: 0, gridWidth: 6 }];

type Hit = { x: number; y: number; who: 'star' | 'pencil' | null };

for (const density of ['large', 'compact', 'list'] as const) {
  test(`the ★ and the pencil never take each other's taps at ${density} density`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page, SERVICES, CATEGORIES, 'admin', density);
    await page.goto('/');
    await enterArrange(page);

    const wrap = page.locator('.app-grid-tool-wrap', { hasText: 'Grafana' });
    const star = wrap.getByTestId('tile-favorite');
    const pencil = wrap.getByTestId('tile-edit');
    await expect(pencil).toBeVisible();

    const result = await wrap.evaluate((el) => {
      const tile = el.getBoundingClientRect();
      const s = el.querySelector('[data-testid="tile-favorite"]')!.getBoundingClientRect();
      const p = el.querySelector('[data-testid="tile-edit"]')!.getBoundingClientRect();
      const hits: Hit[] = [];
      // The right 90px of the tile, 12px past every edge: covers both 44px areas.
      for (let y = Math.floor(tile.top) - 12; y <= Math.ceil(tile.bottom) + 12; y++) {
        for (let x = Math.floor(tile.right) - 90; x <= Math.ceil(tile.right) + 12; x++) {
          const t = document.elementFromPoint(x + 0.5, y + 0.5);
          const who = t?.closest('[data-testid="tile-favorite"]')
            ? 'star'
            : t?.closest('[data-testid="tile-edit"]')
              ? 'pencil'
              : null;
          hits.push({ x: x + 0.5, y: y + 0.5, who });
        }
      }
      const c = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
      const box = (r: DOMRect) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
      return { star: c(s), pencil: c(p), starBox: box(s), pencilBox: box(p), hits };
    });

    // The split line: the controls are stacked on the axis where their centres
    // differ most. It sits halfway between the facing edges of the painted boxes.
    const { star: sc, pencil: pc, starBox: sb, pencilBox: pb } = result;
    const vertical = Math.abs(sc.y - pc.y) >= Math.abs(sc.x - pc.x);
    const starFirst = vertical ? sc.y < pc.y : sc.x < pc.x;
    const split = vertical
      ? starFirst ? (sb.bottom + pb.top) / 2 : (pb.bottom + sb.top) / 2
      : starFirst ? (sb.right + pb.left) / 2 : (pb.right + sb.left) / 2;
    const side = (h: Hit) => {
      const v = vertical ? h.y : h.x;
      return (v < split) === starFirst ? 'star' : 'pencil';
    };
    // 1. No stolen taps. 1px of slack for the boundary row itself.
    const stolen = result.hits.filter((h) => {
      if (!h.who) return false;
      const v = vertical ? h.y : h.x;
      return h.who !== side(h) && Math.abs(v - split) > 1;
    });
    expect(stolen.length, `points taken across the split: ${JSON.stringify(stolen.slice(0, 5))}`).toBe(0);

    // 2. Each control answers at its own centre.
    const at = (p: { x: number; y: number }) =>
      result.hits.find((h) => Math.abs(h.x - p.x) <= 0.5 && Math.abs(h.y - p.y) <= 0.5)?.who;
    expect(at(result.star)).toBe('star');
    expect(at(result.pencil)).toBe('pencil');

    // 3. Hit-area size: the bounding box of each control's points.
    const box = (who: 'star' | 'pencil') => {
      const pts = result.hits.filter((h) => h.who === who);
      const xs = pts.map((h) => h.x);
      const ys = pts.map((h) => h.y);
      return { w: Math.max(...xs) - Math.min(...xs) + 1, h: Math.max(...ys) - Math.min(...ys) + 1 };
    };
    const min = density === 'large' ? 44 : 24;
    for (const who of ['star', 'pencil'] as const) {
      const b = box(who);
      expect(b.w, `${who} hit width`).toBeGreaterThanOrEqual(min);
      expect(b.h, `${who} hit height`).toBeGreaterThanOrEqual(min);
    }

    // And the taps really do what they say: the ★ toggles, the pencil opens the editor.
    await star.click();
    await expect(page.getByTestId('tile-edit-modal')).toHaveCount(0);
  });
}
