import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Catalog from './Catalog';
import {
  categories,
  getCollapsedCategories,
  services,
  setCategoryOrder,
  type Category,
  type Service,
} from './api';
import {
  OPEN_LOG_KEY,
  SORT_MODE_KEY,
  SORT_RANK_AT_KEY,
  CATEGORY_ORDER_KEY,
  type OpenEntry,
} from './recently-opened';

// v14 §3/§6.5 — mount-time usage-priority category ordering + the Arrange-mode
// Auto/Custom toggle. jsdom can't measure layout but CAN assert render order of
// the category panels and the localStorage effects. Covers C-002 (usage order),
// C-004 (24h re-rank cap), C-006 (toggle + custom ignores ranking), C-007 (reset).

vi.mock('./api', () => ({
  services: vi.fn(),
  categories: vi.fn(),
  getCollapsedCategories: vi.fn(),
  setFavorite: vi.fn(),
  setLayout: vi.fn(),
  setCollapsedCategories: vi.fn(),
  setCategoryOrder: vi.fn(),
  assignCategory: vi.fn(),
  createCategory: vi.fn(),
  renameCategory: vi.fn(),
  deleteCategory: vi.fn(),
  deleteService: vi.fn(),
  deleteIcon: vi.fn(),
  uploadIcon: vi.fn(),
}));

const mockedServices = vi.mocked(services);
const mockedCategories = vi.mocked(categories);
const mockedGetCollapsed = vi.mocked(getCollapsedCategories);

function svc(over: Partial<Service> = {}): Service {
  return {
    id: 's1', slug: 's1', name: 'S1', description: '', url: 'https://x.test', icon: 's1',
    status: 'UP', favorite: false, iconLight: false, iconDark: false,
    categoryId: null, categoryName: null, ...over,
  };
}

// admin order: A then B
const CATS: Category[] = [
  { id: 'A', name: 'Alpha', sortIndex: 0 },
  { id: 'B', name: 'Bravo', sortIndex: 1 },
];
const SVCS: Service[] = [
  svc({ id: 'a1', name: 'Aone', categoryId: 'A' }),
  svc({ id: 'b1', name: 'Bone', categoryId: 'B' }),
];

function seedLog(...entries: Array<[string, number]>) {
  const now = Date.now();
  const log: OpenEntry[] = [];
  for (const [id, count] of entries) for (let i = 0; i < count; i++) log.push({ id, t: now - i });
  localStorage.setItem(OPEN_LOG_KEY, JSON.stringify(log));
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: false, media: '', addEventListener: () => {}, removeEventListener: () => {},
  })));
  mockedServices.mockResolvedValue(SVCS);
  mockedCategories.mockResolvedValue(CATS);
  mockedGetCollapsed.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

// Return the rendered order of the two category panel names (Alpha/Bravo).
async function catOrder(): Promise<string[]> {
  await screen.findAllByTestId('service-tile');
  const headers = await screen.findAllByTestId('category-header');
  return headers
    .map((h) => h.textContent ?? '')
    .filter((t) => t.includes('Alpha') || t.includes('Bravo'))
    .map((t) => (t.includes('Alpha') ? 'Alpha' : 'Bravo'));
}

describe('usage-priority category ordering', () => {
  it('C-002 — with sortRankAt unset, opens re-rank Bravo above Alpha', async () => {
    // Bravo opened 10x, Alpha 2x → Bravo first
    seedLog(['b1', 10], ['a1', 2]);
    render(<Catalog />);
    // The mount re-rank sets rankedOrder in an effect that fires AFTER the
    // render where the tiles first appear, so the panels reorder on a later
    // commit. waitFor retries the SAME equality until that re-rank commit lands
    // (catOrder alone can read the admin order one render too early — flaky in CI).
    await waitFor(async () => expect(await catOrder()).toEqual(['Bravo', 'Alpha']));
  });

  it('C-002 — the re-rank persists categoryOrder + a fresh sortRankAt', async () => {
    seedLog(['b1', 10], ['a1', 2]);
    render(<Catalog />);
    await catOrder();
    expect(JSON.parse(localStorage.getItem(CATEGORY_ORDER_KEY)!)).toEqual(['B', 'A']);
    expect(Number(localStorage.getItem(SORT_RANK_AT_KEY))).toBeGreaterThan(0);
  });

  it('C-004 — within 24h of the last re-rank, the cached order stands (no re-sort)', async () => {
    // last ranked "now" with a cached [A, B]; even though Bravo is opened more,
    // the 24h cap keeps the cached order.
    seedLog(['b1', 20]);
    localStorage.setItem(SORT_RANK_AT_KEY, String(Date.now()));
    localStorage.setItem(CATEGORY_ORDER_KEY, JSON.stringify(['A', 'B']));
    render(<Catalog />);
    expect(await catOrder()).toEqual(['Alpha', 'Bravo']);
  });

  it('C-001 — cold start (no open log) keeps admin sort_index order', async () => {
    render(<Catalog />);
    expect(await catOrder()).toEqual(['Alpha', 'Bravo']);
  });
});

describe('Arrange-mode Auto/Custom toggle', () => {
  it('C-006 — the sort toggle is visible in Arrange mode and hidden otherwise', async () => {
    const { rerender } = render(<Catalog arrange={false} />);
    await screen.findAllByTestId('service-tile');
    expect(screen.queryByTestId('sort-mode-toggle')).toBeNull();
    rerender(<Catalog arrange={true} />);
    expect(await screen.findByTestId('sort-mode-toggle')).toBeInTheDocument();
  });

  it('C-006 — choosing Custom persists sortMode=custom and ignores usage ranking', async () => {
    seedLog(['b1', 10], ['a1', 2]); // usage would put Bravo first
    render(<Catalog arrange={true} />);
    await screen.findAllByTestId('service-tile');
    await userEvent.click(screen.getByTestId('sort-mode-custom'));
    expect(localStorage.getItem(SORT_MODE_KEY)).toBe('custom');
    // custom ignores ranking → admin/server order (Alpha, Bravo)
    expect(await catOrder()).toEqual(['Alpha', 'Bravo']);
  });

  it('C-007 — Reset to auto order clears sortMode back to auto', async () => {
    localStorage.setItem(SORT_MODE_KEY, 'custom');
    render(<Catalog arrange={true} />);
    await screen.findAllByTestId('service-tile');
    await userEvent.click(screen.getByTestId('sort-mode-reset'));
    expect(localStorage.getItem(SORT_MODE_KEY)).toBeNull();
  });
});

// #209 — auto-mode category drag mis-indexes. The category SortableContext keys
// off displayCats (usage-ranked), but reorderCategory did its arrayMove on cats
// (admin/sortIndex order). When auto ranking has flipped displayCats vs cats, the
// drop resolved indices in the wrong space and PUT the wrong order to the server.
// jsdom has no layout, so each element gets a document-order rect for the keyboard
// sensor to resolve a vertical neighbour (mirrors Catalog.dnd.test.tsx).
function stubLayout() {
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: function (this: HTMLElement) {
      const all = Array.from(this.ownerDocument.querySelectorAll('*'));
      const i = all.indexOf(this);
      const top = i * 10;
      return {
        x: 0, y: top, top, left: 0, right: 100, bottom: top + 10,
        width: 100, height: 10, toJSON() {},
      } as DOMRect;
    },
  });
}

async function keyboardDrag(
  user: ReturnType<typeof userEvent.setup>,
  handle: HTMLElement,
  ...keys: string[]
) {
  handle.focus();
  await user.keyboard('{ }'); // Space: pick up
  for (const k of keys) await user.keyboard(`{${k}}`);
  await user.keyboard('{ }'); // Space: drop
}

describe('#209 — auto-mode category drag persists the display-space order', () => {
  it('dragging Alpha above Bravo (auto-ranked B first) PUTs [A, B], not [B, A]', async () => {
    stubLayout();
    vi.mocked(setCategoryOrder).mockResolvedValue(true);
    const user = userEvent.setup();
    // usage ranks Bravo first → displayCats=[Bravo, Alpha] while admin cats=[A, B]
    seedLog(['b1', 10], ['a1', 2]);
    render(<Catalog />);
    // Wait for the mount re-rank commit (see C-002 above) before driving the drag.
    await waitFor(async () => expect(await catOrder()).toEqual(['Bravo', 'Alpha']));

    // Alpha renders second (below Bravo); ArrowUp drags it above Bravo.
    const grip = screen.getByRole('button', { name: 'Reorder Alpha section' });
    await keyboardDrag(user, grip, 'ArrowUp');

    await waitFor(() => expect(vi.mocked(setCategoryOrder)).toHaveBeenCalledTimes(1));
    // A ends up first in display space; the buggy cats-space move yielded ['B','A'].
    expect(vi.mocked(setCategoryOrder)).toHaveBeenCalledWith(['A', 'B']);
  });
});
