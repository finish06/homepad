import { afterEach, describe, expect, it, vi } from 'vitest';
import { categories, saveCategoryLayout } from './api';

// SPEC-category-pane-width-layout — the client half of the layout data model.
// categories() must surface the three new layout fields, defaulting them so a
// pre-migration server (rows without layout columns) still renders identically
// to before (AC9). saveCategoryLayout() PUTs a batch to /api/categories/layout
// (the atomic bulk endpoint — AC10 server-side).

function mockFetch(body: BodyInit | null, status: number) {
  const fn = vi.fn(async () => new Response(body, { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('categories() layout defaults (AC9)', () => {
  it('AC9 defaults missing layout fields: row=sortIndex, colOrder=0, width=100', async () => {
    mockFetch(
      JSON.stringify({ categories: [{ id: 'a', name: 'A', sortIndex: 2 }] }),
      200,
    );
    const [c] = await categories();
    expect(c.layoutRow).toBe(2); // backfilled from sortIndex → identical stacked order
    expect(c.layoutColOrder).toBe(0);
    expect(c.layoutWidthPct).toBe(100);
  });

  it('passes through layout fields the server already provides', async () => {
    mockFetch(
      JSON.stringify({
        categories: [
          { id: 'a', name: 'A', sortIndex: 0, layoutRow: 0, layoutColOrder: 1, layoutWidthPct: 50 },
        ],
      }),
      200,
    );
    const [c] = await categories();
    expect(c.layoutRow).toBe(0);
    expect(c.layoutColOrder).toBe(1);
    expect(c.layoutWidthPct).toBe(50);
  });
});

describe('saveCategoryLayout() (AC10 client)', () => {
  it('AC10 PUTs the batch to /api/categories/layout and returns true on 200', async () => {
    const fn = mockFetch(null, 200);
    const updates = [
      { id: 'a', layoutRow: 0, layoutColOrder: 0, layoutWidthPct: 50 },
      { id: 'b', layoutRow: 0, layoutColOrder: 1, layoutWidthPct: 50 },
    ];
    await expect(saveCategoryLayout(updates)).resolves.toBe(true);
    const [url, init] = fn.mock.calls[0];
    expect(url).toBe('/api/categories/layout');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(init!.body as string)).toEqual({ layout: updates });
  });

  it('AC10 returns false when the atomic save fails (e.g. 500 rollback)', async () => {
    mockFetch(null, 500);
    await expect(
      saveCategoryLayout([{ id: 'a', layoutRow: 0, layoutColOrder: 0, layoutWidthPct: 100 }]),
    ).resolves.toBe(false);
  });
});
