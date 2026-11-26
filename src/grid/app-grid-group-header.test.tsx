import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import AppGrid from './AppGrid';
import type { Category, Service, ServiceStatus } from '../api';
import * as api from '../api';
import { SHAPE_KEY } from './gridShapeCache';

expect.extend(toHaveNoViolations);

// SPEC-group-header-collapse — the box header's count pill, status bar, "N down"
// badge and the chevron that folds a box, saved per user through
// GET/PUT /api/me/collapsed-categories (no API change).

vi.mock('../api', () => ({
  categories: vi.fn(),
  services: vi.fn(),
  saveCategoryWidth: vi.fn(),
  setCategoryOrder: vi.fn(),
  createCategory: vi.fn(),
  renameCategory: vi.fn(),
  deleteCategory: vi.fn(),
  setFavorite: vi.fn(),
  setLayout: vi.fn(),
  getCollapsedCategories: vi.fn(),
  setCollapsedCategories: vi.fn(),
}));

const NOT_LOADED = "Couldn't load your saved groups, so folds won't be saved this time.";

const cat = (id: string, name: string, sortIndex = 0): Category => ({ id, name, sortIndex, gridWidth: 6 });

let sid = 0;
const svc = (categoryId: string | null, status: ServiceStatus, name?: string): Service => {
  sid += 1;
  return {
    id: `s${sid}`,
    name: name ?? `App ${sid}`,
    categoryId,
    slug: `s${sid}`,
    description: '',
    url: `https://s${sid}.test`,
    icon: '',
    status,
    favorite: false,
    iconLight: false,
    iconDark: false,
  } as Service;
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Media: 6 apps, one of each status plus a second UP. Games: 1 UP app.
// Empty: no apps. Plus one uncategorized app (DOWN).
function fixture() {
  sid = 0;
  const cats = [cat('c1', 'Media', 0), cat('c2', 'Games', 1), cat('c3', 'Empty', 2)];
  const svcs = [
    svc('c1', 'UP', 'Plex'),
    svc('c1', 'UP'),
    svc('c1', 'DOWN'),
    svc('c1', 'DEGRADED'),
    svc('c1', 'UNKNOWN'),
    svc('c1', 'NOT_MONITORED'),
    svc('c2', 'UP', 'Steam'),
    svc(null, 'DOWN', 'Loose'),
  ];
  return { cats, svcs };
}

beforeEach(() => {
  window.innerWidth = 1920;
  localStorage.clear();
  const { cats, svcs } = fixture();
  vi.mocked(api.categories).mockResolvedValue(cats);
  vi.mocked(api.services).mockResolvedValue(svcs);
  vi.mocked(api.setFavorite).mockResolvedValue(true);
  vi.mocked(api.deleteCategory).mockResolvedValue(true);
  vi.mocked(api.getCollapsedCategories).mockResolvedValue([]);
  vi.mocked(api.setCollapsedCategories).mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  document.documentElement.classList.remove('dark');
});

type Props = Partial<React.ComponentProps<typeof AppGrid>>;
function renderGrid(props: Props = {}) {
  const all = { isAdmin: false, editMode: false, showUptimeDisplay: false, ...props };
  const r = render(<AppGrid {...all} />);
  return { ...r, rerender: (next: Props) => r.rerender(<AppGrid {...all} {...next} />) };
}

const boxEl = (id: string) => document.querySelector(`[data-box-id="${id}"]`) as HTMLElement;
const chevron = (title: string) => screen.getByRole('button', { name: `${title} apps` });
const isOpen = (id: string) => within(boxEl(id)).queryAllByTestId(/^(box-tools|box-empty)$/).length > 0;

describe('count pill (AC-001)', () => {
  it('shows the app count, read as "1 app", "0 apps" or "6 apps"', async () => {
    renderGrid();
    await screen.findByTestId('app-grid');
    const pill = (id: string) => within(boxEl(id)).getByTestId('box-count');
    for (const [id, n, phrase] of [
      ['c1', '6', '6 apps'],
      ['c2', '1', '1 app'],
      ['c3', '0', '0 apps'],
      ['', '1', '1 app'],
    ]) {
      const p = pill(id);
      expect(p).toHaveClass('cat-count');
      expect(p.querySelector('[aria-hidden="true"]')!.textContent).toBe(n);
      expect(p.querySelector('.sr-only')!.textContent).toBe(phrase);
    }
  });
});

describe('status bar (AC-002, AC-003)', () => {
  const segs = (id: string) =>
    Array.from(within(boxEl(id)).getByTestId('box-status-bar').children).map((s) => ({
      cls: s.className,
      w: parseFloat((s as HTMLElement).style.width),
    }));

  it('draws green, gray, red in that order, sized by the formula, 64px in all, aria-hidden', async () => {
    renderGrid();
    await screen.findByTestId('app-grid');
    const bar = within(boxEl('c1')).getByTestId('box-status-bar');
    expect(bar).toHaveAttribute('aria-hidden', 'true');
    const s = segs('c1');
    expect(s.map((x) => x.cls)).toEqual([
      expect.stringContaining('health-tick-up'),
      expect.stringContaining('health-tick-idle'),
      expect.stringContaining('health-tick-down'),
    ]);
    // 2 green, 2 gray (UNKNOWN + NOT_MONITORED), 2 red (DOWN + DEGRADED).
    for (const x of s) expect(x.w).toBeCloseTo(4 + 52 * (2 / 6), 3);
    expect(s.reduce((a, x) => a + x.w, 0)).toBeCloseTo(64, 3);
  });

  it('a one-band box is one 64px segment; an all-gray box is all gray (OQ-4)', async () => {
    const svcs = [svc('c1', 'UNKNOWN'), svc('c1', 'NOT_MONITORED'), svc('c2', 'UP')];
    vi.mocked(api.services).mockResolvedValue(svcs);
    renderGrid();
    await screen.findByTestId('app-grid');
    expect(segs('c1')).toEqual([{ cls: expect.stringContaining('health-tick-idle'), w: 64 }]);
    expect(segs('c2')).toEqual([{ cls: expect.stringContaining('health-tick-up'), w: 64 }]);
  });

  it('98 up, 1 gray, 1 down never overflows and one red app still shows', async () => {
    const svcs = [
      ...Array.from({ length: 98 }, () => svc('c1', 'UP')),
      svc('c1', 'UNKNOWN'),
      svc('c1', 'DOWN'),
    ];
    vi.mocked(api.services).mockResolvedValue(svcs);
    renderGrid();
    await screen.findByTestId('app-grid');
    const s = segs('c1');
    expect(s).toHaveLength(3);
    expect(s[2].w).toBeGreaterThanOrEqual(4);
    expect(s.reduce((a, x) => a + x.w, 0)).toBeCloseTo(64, 3);
  });

  it('an empty box shows "0" and no bar', async () => {
    renderGrid();
    await screen.findByTestId('app-grid');
    expect(within(boxEl('c3')).queryByTestId('box-status-bar')).toBeNull();
  });
});

describe('hidden status line (AC-004)', () => {
  it('names each status in its own word, in order, leaving out zeros', async () => {
    renderGrid();
    await screen.findByTestId('app-grid');
    const line = within(boxEl('c1')).getByTestId('box-status-line');
    expect(line).toHaveClass('sr-only');
    expect(line.textContent).toBe('2 up, 1 down, 1 degraded, 1 unknown, 1 not monitored');
    expect(within(boxEl('c2')).getByTestId('box-status-line').textContent).toBe('1 up');
    expect(within(boxEl('c3')).queryByTestId('box-status-line')).toBeNull();
  });
});

describe('"N down" badge (AC-005)', () => {
  it('counts DOWN plus DEGRADED, is aria-hidden, and is hidden at 0', async () => {
    renderGrid();
    await screen.findByTestId('app-grid');
    const badge = within(boxEl('c1')).getByTestId('box-down-badge');
    expect(badge.textContent).toBe('2 down');
    expect(badge).toHaveAttribute('aria-hidden', 'true');
    expect(within(boxEl('')).getByTestId('box-down-badge').textContent).toBe('1 down');
    expect(within(boxEl('c2')).queryByTestId('box-down-badge')).toBeNull();
    expect(within(boxEl('c3')).queryByTestId('box-down-badge')).toBeNull();
  });

  it('still shows while the box is collapsed', async () => {
    vi.mocked(api.getCollapsedCategories).mockResolvedValue(['c1']);
    renderGrid();
    await screen.findByTestId('app-grid');
    expect(isOpen('c1')).toBe(false);
    expect(within(boxEl('c1')).getByTestId('box-down-badge').textContent).toBe('2 down');
    expect(within(boxEl('c1')).getByTestId('box-count')).toBeInTheDocument();
    expect(within(boxEl('c1')).getByTestId('box-status-bar')).toBeInTheDocument();
  });
});

describe('chevron (AC-006, AC-007, AC-008)', () => {
  it('is a button before the title with aria-expanded, aria-controls and a stable name', async () => {
    const user = userEvent.setup();
    renderGrid();
    await screen.findByTestId('app-grid');
    const btn = chevron('Media');
    expect(btn.tagName).toBe('BUTTON');
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    const header = boxEl('c1').querySelector('header')!;
    const order = Array.from(header.querySelectorAll('button, h2'));
    expect(order.indexOf(btn)).toBeLessThan(order.indexOf(within(header).getByTestId('box-title')));
    const controls = () => document.getElementById(btn.getAttribute('aria-controls')!);
    expect(controls()).not.toBeNull();
    expect(boxEl('c1').contains(controls())).toBe(true);
    await user.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(btn).toHaveAccessibleName('Media apps');
    expect(controls()).not.toBeNull();
    expect(controls()).toHaveAttribute('hidden');
    // An empty box has one too, and its id exists.
    const empty = chevron('Empty');
    expect(document.getElementById(empty.getAttribute('aria-controls')!)).not.toBeNull();
  });

  it('Uncategorized gets pill, bar and badge but no chevron', async () => {
    renderGrid();
    await screen.findByTestId('app-grid');
    expect(within(boxEl('')).queryByRole('button', { name: /apps$/ })).toBeNull();
    expect(within(boxEl('')).getByTestId('box-count')).toBeInTheDocument();
    expect(screen.getAllByTestId('box-chevron')).toHaveLength(3);
  });

  it('collapsing leaves only the header row; the box keeps its width', async () => {
    const user = userEvent.setup();
    renderGrid();
    await screen.findByTestId('app-grid');
    const style = boxEl('c1').getAttribute('style');
    await user.click(chevron('Media'));
    expect(within(boxEl('c1')).queryByTestId('box-tools')).toBeNull();
    expect(within(boxEl('c1')).queryAllByTestId('tile-status')).toHaveLength(0);
    expect(boxEl('c1')).toHaveClass('is-collapsed');
    expect(within(boxEl('c1')).getByTestId('box-title').textContent).toBe('Media');
    expect(boxEl('c1').getAttribute('style')).toBe(style);
    // An empty box loses its empty line.
    await user.click(chevron('Empty'));
    expect(within(boxEl('c3')).queryByTestId('box-empty')).toBeNull();
  });

  it('Enter and Space toggle, focus stays on the chevron, and the live region says exactly what happened', async () => {
    const user = userEvent.setup();
    renderGrid();
    await screen.findByTestId('app-grid');
    const announce = screen.getByTestId('app-grid-announce');
    const btn = chevron('Media');
    btn.focus();
    await user.keyboard('{Enter}');
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(document.activeElement).toBe(btn);
    expect(announce.textContent).toBe('Media collapsed. 6 apps: 2 up, 1 down, 1 degraded, 1 unknown, 1 not monitored.');
    await user.keyboard(' ');
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    expect(document.activeElement).toBe(btn);
    expect(announce.textContent).toBe('Media expanded.');

    const one = chevron('Games');
    one.focus();
    await user.keyboard(' ');
    expect(announce.textContent).toBe('Games collapsed. 1 app: 1 up.');
    expect(document.activeElement).toBe(one);

    await user.click(chevron('Empty'));
    expect(announce.textContent).toBe('Empty collapsed. 0 apps.');
  });
});

describe('loading and the saved set (AC-009, AC-012)', () => {
  it('holds the skeleton until the GET settles; a collapsed box never renders open', async () => {
    const get = deferred<string[] | null>();
    vi.mocked(api.getCollapsedCategories).mockReturnValue(get.promise);
    const opened: boolean[] = [];
    const obs = new MutationObserver(() => {
      const b = boxEl('c1');
      if (b) opened.push(isOpen('c1'));
    });
    obs.observe(document.body, { childList: true, subtree: true });
    renderGrid();
    await waitFor(() => expect(api.categories).toHaveBeenCalled());
    // Categories and services are in; the grid still waits for the set.
    await act(async () => {});
    expect(screen.getByTestId('app-grid-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('app-grid')).toBeNull();
    expect(api.getCollapsedCategories).toHaveBeenCalledTimes(1);
    await act(async () => get.resolve(['c1']));
    await screen.findByTestId('app-grid');
    obs.disconnect();
    expect(isOpen('c1')).toBe(false);
    expect(opened.length).toBeGreaterThan(0);
    expect(opened.every((o) => o === false)).toBe(true);
    expect(isOpen('c2')).toBe(true);
  });

  it('a failed GET renders every box open', async () => {
    vi.mocked(api.getCollapsedCategories).mockResolvedValue(null);
    renderGrid();
    await screen.findByTestId('app-grid');
    expect(['c1', 'c2', 'c3'].every(isOpen)).toBe(true);
    expect(screen.queryByTestId('tile-toast')).toBeNull();
  });

  it('a GET that rejects renders every box open', async () => {
    vi.mocked(api.getCollapsedCategories).mockRejectedValue(new Error('boom'));
    renderGrid();
    await screen.findByTestId('app-grid');
    expect(['c1', 'c2', 'c3'].every(isOpen)).toBe(true);
  });

  it('a GET held past 3 s renders all open, and its late reply changes nothing', async () => {
    vi.useFakeTimers();
    const get = deferred<string[] | null>();
    vi.mocked(api.getCollapsedCategories).mockReturnValue(get.promise);
    renderGrid();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2900);
    });
    expect(screen.getByTestId('app-grid-loading')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(screen.getByTestId('app-grid')).toBeInTheDocument();
    expect(['c1', 'c2', 'c3'].every(isOpen)).toBe(true);
    await act(async () => get.resolve(['c1', 'c2']));
    expect(['c1', 'c2', 'c3'].every(isOpen)).toBe(true);
    // The set never loaded, so a toggle folds on screen but sends no PUT: the
    // saved set on the server is never overwritten (§3.5).
    await act(async () => chevron('Games').click());
    expect(isOpen('c2')).toBe(false);
    expect(api.setCollapsedCategories).not.toHaveBeenCalled();
    expect(screen.getByTestId('tile-toast').textContent).toBe(NOT_LOADED);
  });

  // Caleb, 2026-11-25: after a failed or timed-out GET, folds are not saved,
  // so the saved set is never overwritten. One toast per mount says so.
  for (const [label, arrange] of [
    ['a failed GET', () => vi.mocked(api.getCollapsedCategories).mockResolvedValue(null)],
    ['a GET that rejects', () => vi.mocked(api.getCollapsedCategories).mockRejectedValue(new Error('boom'))],
    [
      'a GET held past 3 s',
      () => vi.mocked(api.getCollapsedCategories).mockReturnValue(deferred<string[] | null>().promise),
    ],
  ] as const) {
    it(`after ${label}, toggles fold on screen, send no PUT and toast once`, async () => {
      vi.useFakeTimers();
      arrange();
      renderGrid();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3100);
      });
      expect(screen.getByTestId('app-grid')).toBeInTheDocument();
      expect(screen.queryByTestId('tile-toast')).toBeNull();
      const announce = screen.getByTestId('app-grid-announce');
      await act(async () => chevron('Media').click());
      expect(isOpen('c1')).toBe(false);
      expect(announce.textContent).toMatch(/^Media collapsed\./);
      expect(screen.getAllByTestId('tile-toast')).toHaveLength(1);
      expect(screen.getByTestId('tile-toast').textContent).toBe(NOT_LOADED);
      // Let the toast go, then toggle twice more: no second toast, no PUT.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000);
      });
      expect(screen.queryByTestId('tile-toast')).toBeNull();
      await act(async () => chevron('Games').click());
      await act(async () => chevron('Media').click());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(isOpen('c1')).toBe(true);
      expect(isOpen('c2')).toBe(false);
      expect(announce.textContent).toBe('Media expanded.');
      expect(screen.queryByTestId('tile-toast')).toBeNull();
      expect(api.setCollapsedCategories).not.toHaveBeenCalled();
    });
  }

  it('the notice is polite, so the fold announcement is not cut off', async () => {
    vi.mocked(api.getCollapsedCategories).mockResolvedValue(null);
    renderGrid();
    await screen.findByTestId('app-grid');
    await act(async () => chevron('Media').click());
    const toast = screen.getByTestId('tile-toast');
    expect(toast).toHaveAttribute('aria-live', 'polite');
    expect(toast).toHaveClass('border-amber-500');
  });

  it('the notice never replaces another toast; it shows once the slot is free', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(api.getCollapsedCategories).mockResolvedValue(null);
    vi.mocked(api.setLayout).mockResolvedValue(false);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    // jsdom has no layout; the keyboard sensor needs rects in document order to
    // find the next tile (as AppGrid.tiledrag.test.tsx does).
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const top = Array.from(this.ownerDocument.querySelectorAll('*')).indexOf(this) * 10;
      return { x: 0, y: top, top, left: 0, right: 100, bottom: top + 10, width: 100, height: 10, toJSON() {} } as DOMRect;
    });
    const { rerender } = renderGrid({ isAdmin: true, editMode: true });
    await screen.findByTestId('app-grid');
    // A failed tile-order save puts its error in the one toast slot.
    const grip = screen.getByRole('button', { name: 'Reorder Plex' });
    grip.focus();
    await user.keyboard('{ }');
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ }');
    await waitFor(() => expect(screen.getByTestId('tile-toast').textContent).toBe('Could not save the new tile order.'));
    rect.mockRestore();
    rerender({ isAdmin: true, editMode: false });
    await act(async () => chevron('Media').click());
    expect(isOpen('c1')).toBe(false);
    expect(screen.getByTestId('tile-toast').textContent).toBe('Could not save the new tile order.');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(screen.queryByTestId('tile-toast')).toBeNull();
    // Not told yet, so the next toggle shows it.
    await act(async () => chevron('Media').click());
    expect(screen.getByTestId('tile-toast').textContent).toBe(NOT_LOADED);
    expect(api.setCollapsedCategories).not.toHaveBeenCalled();
  });

  it('an empty saved set still counts as loaded: a toggle sends its PUT', async () => {
    vi.mocked(api.getCollapsedCategories).mockResolvedValue([]);
    const user = userEvent.setup();
    renderGrid();
    await screen.findByTestId('app-grid');
    await user.click(chevron('Games'));
    expect(api.setCollapsedCategories).toHaveBeenCalledWith(['c2']);
    expect(screen.queryByTestId('tile-toast')).toBeNull();
  });

  it('ignores ids that match no box, with no error', async () => {
    vi.mocked(api.getCollapsedCategories).mockResolvedValue(['ghost', 'c1']);
    const user = userEvent.setup();
    renderGrid();
    await screen.findByTestId('app-grid');
    expect(isOpen('c1')).toBe(false);
    expect(screen.queryByTestId('tile-toast')).toBeNull();
    await user.click(chevron('Games'));
    expect(api.setCollapsedCategories).toHaveBeenCalledWith(['c1', 'c2']);
  });
});

describe('saving (AC-010)', () => {
  it('a toggle PUTs the whole desired set', async () => {
    const user = userEvent.setup();
    renderGrid();
    await screen.findByTestId('app-grid');
    await user.click(chevron('Media'));
    expect(api.setCollapsedCategories).toHaveBeenLastCalledWith(['c1']);
    await user.click(chevron('Games'));
    expect(api.setCollapsedCategories).toHaveBeenLastCalledWith(['c1', 'c2']);
    await user.click(chevron('Media'));
    expect(api.setCollapsedCategories).toHaveBeenLastCalledWith(['c2']);
  });

  it('one PUT in flight; toggles meanwhile go out as one follow-up after a success, which never changes the screen', async () => {
    const first = deferred<boolean>();
    const second = deferred<boolean>();
    vi.mocked(api.setCollapsedCategories).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const user = userEvent.setup();
    renderGrid();
    await screen.findByTestId('app-grid');
    await user.click(chevron('Media'));
    await user.click(chevron('Games'));
    await user.click(chevron('Empty'));
    await user.click(chevron('Empty'));
    expect(api.setCollapsedCategories).toHaveBeenCalledTimes(1);
    expect(api.setCollapsedCategories).toHaveBeenCalledWith(['c1']);
    expect([isOpen('c1'), isOpen('c2'), isOpen('c3')]).toEqual([false, false, true]);
    await act(async () => first.resolve(true));
    // The newer toggle (Games) is still on screen.
    expect([isOpen('c1'), isOpen('c2'), isOpen('c3')]).toEqual([false, false, true]);
    expect(api.setCollapsedCategories).toHaveBeenCalledTimes(2);
    expect(api.setCollapsedCategories).toHaveBeenLastCalledWith(['c1', 'c2']);
    await act(async () => second.resolve(true));
    expect(api.setCollapsedCategories).toHaveBeenCalledTimes(2);
    expect([isOpen('c1'), isOpen('c2')]).toEqual([false, false]);
  });

  it('no follow-up when the in-flight toggles cancel out', async () => {
    const first = deferred<boolean>();
    vi.mocked(api.setCollapsedCategories).mockReturnValueOnce(first.promise);
    const user = userEvent.setup();
    renderGrid();
    await screen.findByTestId('app-grid');
    await user.click(chevron('Media'));
    await user.click(chevron('Games'));
    await user.click(chevron('Games'));
    await act(async () => first.resolve(true));
    expect(api.setCollapsedCategories).toHaveBeenCalledTimes(1);
  });

  it('a failure puts the screen back to confirmed, drops the follow-up and toasts once', async () => {
    const first = deferred<boolean>();
    vi.mocked(api.setCollapsedCategories).mockReturnValueOnce(first.promise);
    const user = userEvent.setup();
    renderGrid();
    await screen.findByTestId('app-grid');
    await user.click(chevron('Media'));
    await user.click(chevron('Games')); // made in flight: undone too
    await act(async () => first.resolve(false));
    expect([isOpen('c1'), isOpen('c2')]).toEqual([true, true]);
    expect(api.setCollapsedCategories).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId('tile-toast')).toHaveLength(1);
    expect(screen.getByTestId('tile-toast').textContent).toBe("Couldn't save. Try again.");
    expect(chevron('Media')).toHaveAttribute('aria-expanded', 'true');
  });

  it('after a 204, confirmed is the sent set: a later failure reverts to it', async () => {
    const user = userEvent.setup();
    renderGrid();
    await screen.findByTestId('app-grid');
    await user.click(chevron('Media'));
    await waitFor(() => expect(api.setCollapsedCategories).toHaveBeenCalledTimes(1));
    vi.mocked(api.setCollapsedCategories).mockResolvedValueOnce(false);
    await user.click(chevron('Games'));
    await screen.findByTestId('tile-toast');
    expect([isOpen('c1'), isOpen('c2')]).toEqual([false, true]);
  });

  it('deleting a collapsed box prunes both sets and sends no PUT', async () => {
    vi.mocked(api.getCollapsedCategories).mockResolvedValue(['c1', 'c2']);
    const user = userEvent.setup();
    const { rerender } = renderGrid({ isAdmin: true });
    await screen.findByTestId('app-grid');
    rerender({ editMode: true });
    await user.click(within(boxEl('c1')).getByTestId('box-delete'));
    await user.click(screen.getByTestId('box-delete-yes'));
    await waitFor(() => expect(boxEl('c1')).toBeNull());
    rerender({ editMode: false });
    expect(isOpen('c2')).toBe(false);
    expect(api.setCollapsedCategories).not.toHaveBeenCalled();
    // The next toggle sends only ids of boxes on screen.
    await user.click(chevron('Games'));
    expect(api.setCollapsedCategories).toHaveBeenCalledWith([]);
  });

  it('a box deleted while a PUT is in flight causes no follow-up', async () => {
    const first = deferred<boolean>();
    vi.mocked(api.getCollapsedCategories).mockResolvedValue(['c1']);
    vi.mocked(api.setCollapsedCategories).mockReturnValueOnce(first.promise);
    const user = userEvent.setup();
    const { rerender } = renderGrid({ isAdmin: true });
    await screen.findByTestId('app-grid');
    await user.click(chevron('Games'));
    expect(api.setCollapsedCategories).toHaveBeenCalledWith(['c1', 'c2']);
    rerender({ editMode: true });
    await user.click(within(boxEl('c1')).getByTestId('box-delete'));
    await user.click(screen.getByTestId('box-delete-yes'));
    await waitFor(() => expect(boxEl('c1')).toBeNull());
    await act(async () => first.resolve(true));
    rerender({ editMode: false });
    expect(api.setCollapsedCategories).toHaveBeenCalledTimes(1);
    expect(isOpen('c2')).toBe(false);
  });
});

describe('an unmount while a PUT is in flight (code review, #746)', () => {
  it('an unmounted grid sends no follow-up (after a sign-out it must not PUT under the next session)', async () => {
    const put = deferred<boolean>();
    vi.mocked(api.setCollapsedCategories).mockReturnValueOnce(put.promise);
    const user = userEvent.setup();
    const first = renderGrid();
    await screen.findByTestId('app-grid');
    await user.click(chevron('Media'));
    await user.click(chevron('Games'));
    first.unmount();
    await act(async () => put.resolve(true));
    expect(api.setCollapsedCategories).toHaveBeenCalledTimes(1);
  });
});

describe('kids (AC-016)', () => {
  it('a kid sees pill, bar and badge, no chevron, and the grid makes no collapse request', async () => {
    renderGrid({ isKid: true });
    await screen.findByTestId('app-grid');
    expect(screen.queryAllByTestId('box-chevron')).toHaveLength(0);
    expect(within(boxEl('c1')).getByTestId('box-count')).toBeInTheDocument();
    expect(within(boxEl('c1')).getByTestId('box-status-bar')).toBeInTheDocument();
    expect(within(boxEl('c1')).getByTestId('box-down-badge').textContent).toBe('2 down');
    expect(['c1', 'c2', 'c3'].every(isOpen)).toBe(true);
    expect(api.getCollapsedCategories).not.toHaveBeenCalled();
    expect(api.setCollapsedCategories).not.toHaveBeenCalled();
  });

  it("a kid in favorites mode makes no request either", async () => {
    const { rerender } = renderGrid({ isKid: true });
    await screen.findByTestId('app-grid');
    rerender({ editMode: true });
    rerender({ editMode: false });
    expect(api.getCollapsedCategories).not.toHaveBeenCalled();
    expect(api.setCollapsedCategories).not.toHaveBeenCalled();
  });
});

describe('arrange mode (AC-013)', () => {
  for (const who of ['member', 'admin'] as const) {
    it(`${who}: every box shows open, no chevron, every control reachable, no PUT; the saved state returns on exit`, async () => {
      vi.mocked(api.getCollapsedCategories).mockResolvedValue(['c1']);
      const user = userEvent.setup();
      const { rerender } = renderGrid({ isAdmin: who === 'admin' });
      await screen.findByTestId('app-grid');
      expect(isOpen('c1')).toBe(false);
      rerender({ editMode: true });
      expect(['c1', 'c2', 'c3'].every(isOpen)).toBe(true);
      expect(screen.queryAllByTestId('box-chevron')).toHaveLength(0);
      // The ★ in the formerly collapsed box is reachable and works.
      const plex = screen.getByText('Plex').closest('.app-grid-tool-wrap') as HTMLElement;
      await user.click(within(plex).getByTestId('tile-favorite'));
      expect(api.setFavorite).toHaveBeenCalled();
      if (who === 'admin') {
        expect(within(plex).getByTestId('tile-edit')).toBeInTheDocument();
        expect(within(boxEl('c1')).getByTestId('box-drag-handle')).toBeInTheDocument();
        expect(within(boxEl('c1')).getByTestId('box-rename')).toBeInTheDocument();
        expect(within(boxEl('c1')).getByTestId('width-selector')).toBeInTheDocument();
      }
      // Pill, bar and badge stay.
      expect(within(boxEl('c1')).getByTestId('box-down-badge')).toBeInTheDocument();
      rerender({ editMode: false });
      expect(isOpen('c1')).toBe(false);
      expect(chevron('Media')).toHaveAttribute('aria-expanded', 'false');
      expect(api.setCollapsedCategories).not.toHaveBeenCalled();
    });
  }
});

describe('the skeleton cache gets the real collapsed flag (AC-018)', () => {
  const stored = () => JSON.parse(localStorage.getItem(SHAPE_KEY) ?? 'null') as {
    boxes: { collapsed: boolean }[];
  } | null;

  it('after load, after a toggle, and never while arranging', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(api.getCollapsedCategories).mockResolvedValue(['c2']);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { rerender } = renderGrid({ userId: 'u1' });
    await screen.findByTestId('app-grid');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(stored()!.boxes.map((b) => b.collapsed)).toEqual([false, true, false, false]);
    await user.click(chevron('Media'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(stored()!.boxes.map((b) => b.collapsed)).toEqual([true, true, false, false]);
    rerender({ editMode: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    // Every box shows open while arranging; the cache keeps the view shape.
    expect(stored()!.boxes.map((b) => b.collapsed)).toEqual([true, true, false, false]);
  });

  it('after a failed GET, unsaved folds never reach the cache; the last good shape stays', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(api.getCollapsedCategories).mockResolvedValue(['c2']);
    const first = renderGrid({ userId: 'u1' });
    await screen.findByTestId('app-grid');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    const good = localStorage.getItem(SHAPE_KEY);
    expect(stored()!.boxes.map((b) => b.collapsed)).toEqual([false, true, false, false]);
    first.unmount();

    vi.mocked(api.getCollapsedCategories).mockResolvedValue(null);
    renderGrid({ userId: 'u1' });
    await screen.findByTestId('app-grid');
    await act(async () => chevron('Media').click());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(isOpen('c1')).toBe(false);
    expect(localStorage.getItem(SHAPE_KEY)).toBe(good);
  });
});

describe('accessibility (AC-017)', () => {
  for (const scheme of ['light', 'dark'] as const) {
    it(`the header passes jest-axe in ${scheme} mode, open and collapsed`, async () => {
      if (scheme === 'dark') document.documentElement.classList.add('dark');
      vi.mocked(api.getCollapsedCategories).mockResolvedValue(['c2']);
      const { container } = renderGrid();
      await screen.findByTestId('app-grid');
      expect(await axe(container)).toHaveNoViolations();
    });
  }
});
