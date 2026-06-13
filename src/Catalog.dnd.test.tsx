// v10 slice 2 — always-on tile drag-and-drop (dnd-kit): keyboard reorder,
// persistence, optimistic rollback, Esc cancel, click-vs-drag safety, a11y
// announcements, responsive grip. ACs A1,A2,A4,A5,A6,A7,A10,A12,A13,A14.
//
// dnd-kit's KeyboardSensor drives the reorder in jsdom; jsdom has no layout, so
// each element is given a deterministic rect derived from document order (top
// grows down the document) — that's all sortableKeyboardCoordinates needs to
// resolve ArrowDown/ArrowUp to the next/previous sortable item.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import Catalog from './Catalog';
import {
  addFromLibrary,
  assignCategory,
  categories,
  createCategory,
  createService,
  deleteCategory,
  deleteIcon,
  deleteService,
  getCollapsedCategories,
  listLibrary,
  renameCategory,
  services,
  setCategoryOrder,
  setCollapsedCategories,
  setFavorite,
  setLayout,
  setThemePref,
  updateService,
  uploadIcon,
  type Category,
  type Service,
} from './api';

vi.mock('./api', () => ({
  services: vi.fn(),
  setFavorite: vi.fn(),
  setLayout: vi.fn(),
  uploadIcon: vi.fn(),
  deleteIcon: vi.fn(),
  deleteService: vi.fn(),
  createService: vi.fn(),
  updateService: vi.fn(),
  setThemePref: vi.fn(),
  categories: vi.fn(),
  createCategory: vi.fn(),
  renameCategory: vi.fn(),
  deleteCategory: vi.fn(),
  setCategoryOrder: vi.fn(),
  assignCategory: vi.fn(),
  getCollapsedCategories: vi.fn(),
  setCollapsedCategories: vi.fn(),
  listLibrary: vi.fn(),
  addFromLibrary: vi.fn(),
}));

vi.mock('./icons', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./icons')>();
  return { ...actual, validateIconFile: vi.fn() };
});

expect.extend(toHaveNoViolations);

const mockedSetLayout = vi.mocked(setLayout);

function svc(over: Partial<Service> = {}): Service {
  return {
    id: 's1',
    slug: 'plex',
    name: 'Plex',
    description: 'Media server',
    url: 'https://plex.example.com',
    icon: 'plex',
    status: 'UP',
    favorite: false,
    iconLight: false,
    iconDark: false,
    categoryId: null,
    categoryName: null,
    ...over,
  };
}

function cat(over: Partial<Category> = {}): Category {
  return { id: 'c1', name: 'Media', sortIndex: 0, ...over };
}

// Deterministic layout for jsdom: each element's rect is keyed off its position
// in document order so the keyboard sensor can resolve a vertical neighbour.
function stubLayout() {
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: function (this: HTMLElement) {
      const all = Array.from(this.ownerDocument.querySelectorAll('*'));
      const i = all.indexOf(this);
      const top = i * 10;
      return {
        x: 0,
        y: top,
        top,
        left: 0,
        right: 100,
        bottom: top + 10,
        width: 100,
        height: 10,
        toJSON() {},
      } as DOMRect;
    },
  });
}

beforeEach(() => {
  vi.mocked(services).mockResolvedValue([svc()]);
  vi.mocked(setFavorite).mockResolvedValue(true);
  mockedSetLayout.mockResolvedValue(true);
  vi.mocked(uploadIcon).mockResolvedValue({ ok: true, status: 204 });
  vi.mocked(deleteIcon).mockResolvedValue(true);
  vi.mocked(deleteService).mockResolvedValue(true);
  vi.mocked(createService).mockResolvedValue({ ok: true, status: 201, service: svc() });
  vi.mocked(updateService).mockResolvedValue({ ok: true, status: 200, service: svc() });
  vi.mocked(setThemePref).mockResolvedValue(true);
  vi.mocked(categories).mockResolvedValue([]);
  vi.mocked(createCategory).mockResolvedValue({ ok: true, status: 201, category: cat() });
  vi.mocked(renameCategory).mockResolvedValue({ ok: true, status: 200, category: cat() });
  vi.mocked(deleteCategory).mockResolvedValue(true);
  vi.mocked(setCategoryOrder).mockResolvedValue(true);
  vi.mocked(assignCategory).mockResolvedValue({ ok: true, status: 200, service: svc() });
  vi.mocked(getCollapsedCategories).mockResolvedValue([]);
  vi.mocked(setCollapsedCategories).mockResolvedValue(true);
  vi.mocked(listLibrary).mockResolvedValue([]);
  vi.mocked(addFromLibrary).mockResolvedValue({ ok: true, status: 201, service: svc() });
  stubLayout();
});

afterEach(() => {
  vi.clearAllMocks();
  document.documentElement.classList.remove('dark');
  localStorage.clear();
});

// Drive a keyboard pick-up → move → drop on a tile's grip handle.
async function keyboardDrag(user: ReturnType<typeof userEvent.setup>, handle: HTMLElement, ...keys: string[]) {
  handle.focus();
  await user.keyboard('{ }'); // Space: pick up
  for (const k of keys) await user.keyboard(`{${k}}`);
  await user.keyboard('{ }'); // Space: drop
}

describe('A1 — tiles draggable on the regular dashboard, no mode toggle', () => {
  it('renders a tile drag-handle per tile on first render, no arrange/edit interaction', async () => {
    vi.mocked(services).mockResolvedValue([svc({ id: 'a', name: 'Plex' }), svc({ id: 'b', name: 'Grafana' })]);
    render(<Catalog />);
    const handles = await screen.findAllByTestId('drag-handle');
    expect(handles).toHaveLength(2);
    handles.forEach((h) => expect(h).toHaveAttribute('data-drag-type', 'tile'));
    expect(screen.getByRole('button', { name: 'Reorder Plex' })).toBeInTheDocument();
  });
});

describe('A2 — keyboard tile reorder persists once via setLayout with the full order', () => {
  it('ArrowDown then drop moves the tile and PUTs the new id order exactly once', async () => {
    const user = userEvent.setup();
    vi.mocked(services).mockResolvedValue([
      svc({ id: 'a', name: 'Alpha' }),
      svc({ id: 'b', name: 'Bravo' }),
      svc({ id: 'c', name: 'Charlie' }),
    ]);
    render(<Catalog />);
    const handle = await screen.findByRole('button', { name: 'Reorder Alpha' });
    await keyboardDrag(user, handle, 'ArrowDown');

    await waitFor(() => expect(mockedSetLayout).toHaveBeenCalledTimes(1));
    expect(mockedSetLayout).toHaveBeenCalledWith(['b', 'a', 'c']);
  });
});

describe('A4 — tile reorder is section-scoped (cannot cross a category boundary)', () => {
  it('the last tile of section A cannot move into section B', async () => {
    const user = userEvent.setup();
    vi.mocked(categories).mockResolvedValue([cat({ id: 'A', name: 'AAA' }), cat({ id: 'B', name: 'BBB' })]);
    vi.mocked(services).mockResolvedValue([
      svc({ id: 'a1', name: 'A-one', categoryId: 'A', categoryName: 'AAA' }),
      svc({ id: 'a2', name: 'A-two', categoryId: 'A', categoryName: 'AAA' }),
      svc({ id: 'b1', name: 'B-one', categoryId: 'B', categoryName: 'BBB' }),
    ]);
    render(<Catalog />);
    const handle = await screen.findByRole('button', { name: 'Reorder A-two' });
    // Try to push the last A tile down past the section boundary into B.
    await keyboardDrag(user, handle, 'ArrowDown', 'ArrowDown');

    // It either stays put (no PUT) or only permutes within A — never lands a B id
    // between A's ids. Assert A's run stays contiguous and b1 keeps its slot.
    if (mockedSetLayout.mock.calls.length > 0) {
      const order = mockedSetLayout.mock.calls.at(-1)![0];
      expect(order.indexOf('b1')).toBe(2);
      expect([order[0], order[1]].sort()).toEqual(['a1', 'a2']);
    }
  });
});

describe('A5 — Esc mid-drag cancels: no PUT, order unchanged', () => {
  it('Space, ArrowDown, Esc sends no setLayout and announces cancellation', async () => {
    const user = userEvent.setup();
    vi.mocked(services).mockResolvedValue([svc({ id: 'a', name: 'Alpha' }), svc({ id: 'b', name: 'Bravo' })]);
    render(<Catalog />);
    const handle = await screen.findByRole('button', { name: 'Reorder Alpha' });
    handle.focus();
    await user.keyboard('{ }');
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Escape}');

    expect(mockedSetLayout).not.toHaveBeenCalled();
    expect(screen.getByTestId('drag-live-region')).toHaveTextContent(/cancel/i);
  });
});

describe('A6 — keyboard grab exposes grabbed state (aria-pressed)', () => {
  it('Space toggles aria-pressed on the handle', async () => {
    const user = userEvent.setup();
    vi.mocked(services).mockResolvedValue([svc({ id: 'a', name: 'Alpha' }), svc({ id: 'b', name: 'Bravo' })]);
    render(<Catalog />);
    const handle = await screen.findByRole('button', { name: 'Reorder Alpha' });
    expect(handle).toHaveAttribute('aria-pressed', 'false');
    handle.focus();
    await user.keyboard('{ }');
    await waitFor(() => expect(handle).toHaveAttribute('aria-pressed', 'true'));
    await user.keyboard('{ }');
    await waitFor(() => expect(handle).toHaveAttribute('aria-pressed', 'false'));
  });
});

describe('A7 — live region announces grab / move / drop with numeric position', () => {
  it('updates drag-live-region through the keyboard sequence', async () => {
    const user = userEvent.setup();
    vi.mocked(services).mockResolvedValue([
      svc({ id: 'a', name: 'Alpha' }),
      svc({ id: 'b', name: 'Bravo' }),
      svc({ id: 'c', name: 'Charlie' }),
    ]);
    render(<Catalog />);
    const handle = await screen.findByRole('button', { name: 'Reorder Alpha' });
    const region = screen.getByTestId('drag-live-region');
    expect(region).toHaveAttribute('aria-live');
    handle.focus();
    await user.keyboard('{ }');
    await waitFor(() => expect(region).toHaveTextContent(/grabbed.*position 1 of 3/i));
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(region).toHaveTextContent(/position 2 of 3/i));
    await user.keyboard('{ }');
    await waitFor(() => expect(region).toHaveTextContent(/dropped at position 2/i));
  });
});

describe('A10 — optimistic update + rollback when the PUT fails', () => {
  it('reverts the order and shows an inline error when setLayout rejects', async () => {
    const user = userEvent.setup();
    mockedSetLayout.mockResolvedValue(false);
    vi.mocked(services).mockResolvedValue([
      svc({ id: 'a', name: 'Alpha' }),
      svc({ id: 'b', name: 'Bravo' }),
    ]);
    render(<Catalog />);
    const handle = await screen.findByRole('button', { name: 'Reorder Alpha' });
    await keyboardDrag(user, handle, 'ArrowDown');

    await waitFor(() => expect(mockedSetLayout).toHaveBeenCalled());
    // order rolls back to original a,b
    await waitFor(() => {
      const names = screen.getAllByTestId('service-tile-name').map((n) => n.textContent);
      expect(names).toEqual(['Alpha', 'Bravo']);
    });
    expect(screen.getByTestId('layout-error')).toBeInTheDocument();
  });
});

describe('A12 — click-vs-drag safety', () => {
  it('a plain click on the grip does not reorder (no setLayout)', async () => {
    const user = userEvent.setup();
    vi.mocked(services).mockResolvedValue([svc({ id: 'a', name: 'Alpha' }), svc({ id: 'b', name: 'Bravo' })]);
    render(<Catalog />);
    const handle = await screen.findByRole('button', { name: 'Reorder Alpha' });
    await user.click(handle);
    expect(mockedSetLayout).not.toHaveBeenCalled();
  });

  it('the tile is still a plain link (navigate ≠ reorder)', async () => {
    vi.mocked(services).mockResolvedValue([svc({ id: 'a', name: 'Alpha', url: 'https://alpha.x' })]);
    render(<Catalog />);
    const tile = await screen.findByTestId('service-tile');
    const link = within(tile).getByRole('link');
    expect(link).toHaveAttribute('href', 'https://alpha.x');
    expect(link).toHaveAttribute('target', '_blank');
  });
});

describe('A13/A14 — dark, reduced-motion, responsive grip, a11y', () => {
  it('grip renders in dark mode with motion-reduce affordance and a touch-visible emphasis class', async () => {
    document.documentElement.classList.add('dark');
    vi.mocked(services).mockResolvedValue([svc({ id: 'a', name: 'Alpha' })]);
    render(<Catalog />);
    const handle = await screen.findByTestId('drag-handle');
    // low-emphasis on desktop, always-visible on touch (no hover dependency)
    expect(handle.className).toMatch(/sm:opacity/);
    // reduced motion: the sortable wrapper disables its transition
    const tile = screen.getByTestId('service-tile');
    expect(tile.className).toMatch(/motion-reduce:transition-none/);
  });

  it('jest-axe finds no violations on the dashboard at rest', async () => {
    vi.mocked(services).mockResolvedValue([svc({ id: 'a', name: 'Alpha' }), svc({ id: 'b', name: 'Bravo' })]);
    const { container } = render(<Catalog />);
    await screen.findAllByTestId('drag-handle');
    expect(await axe(container)).toHaveNoViolations();
  });
});
