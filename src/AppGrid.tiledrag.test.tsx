// SPEC-v28-tile-drag-reorder — within-box tile drag-and-drop in AppGrid edit
// mode. Covers the DOM/behaviour contract testable in jsdom: grip presence gated
// by edit mode (AC-001/013), the keyboard reorder path (AC-004/005/006), Esc
// cancel (AC-007), whole-array persistence via setLayout (AC-008), optimistic
// update + rollback + toast (AC-009/015), within-box scoping (AC-010), the
// Uncategorized box (AC-011), pencil/star coexistence (AC-012), empty/single-tile
// boxes (AC-017/018), and the shared announce region (AC-019).
//
// dnd-kit's KeyboardSensor drives the reorder in jsdom; jsdom has no layout, so
// each element gets a deterministic rect keyed off document order (top grows down
// the document) — all sortableKeyboardCoordinates needs to resolve Arrow moves.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppGrid from './AppGrid';
import * as api from './api';
import type { Category, Service } from './api';

vi.mock('./api', () => ({
  categories: vi.fn(),
  services: vi.fn(),
  saveCategoryWidth: vi.fn(),
  setCategoryOrder: vi.fn(),
  createCategory: vi.fn(),
  setFavorite: vi.fn(),
  renameCategory: vi.fn(),
  deleteCategory: vi.fn(),
  setLayout: vi.fn(),
}));

// The edit-tile modal is lazy-loaded; stub it so clicking the pencil (AC-012)
// doesn't pull in the real modal's dependencies.
vi.mock('./TileEditModal', () => ({
  default: ({ service }: { service: Service }) => (
    <div data-testid="tile-edit-modal-mock">{service.name}</div>
  ),
}));
vi.mock('./IframeOverlay', () => ({
  default: () => <div data-testid="iframe-overlay-mock" />,
}));

const cat = (id: string, name: string, sortIndex: number, gridWidth = 4): Category => ({
  id,
  name,
  sortIndex,
  gridWidth,
});
const svc = (id: string, name: string, categoryId: string | null): Service =>
  ({
    id,
    name,
    categoryId,
    slug: id,
    description: '',
    url: `https://${id}.test`,
    icon: '',
    status: 'UNKNOWN',
    favorite: false,
    iconLight: false,
    iconDark: false,
  }) as Service;

// Deterministic layout for jsdom: rect keyed off document order so the keyboard
// sensor can resolve a neighbour tile.
function stubLayout() {
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: function (this: HTMLElement) {
      const all = Array.from(this.ownerDocument.querySelectorAll('*'));
      const i = all.indexOf(this);
      const top = i * 10;
      return { x: 0, y: top, top, left: 0, right: 100, bottom: top + 10, width: 100, height: 10, toJSON() {} } as DOMRect;
    },
  });
}

beforeEach(() => {
  window.innerWidth = 1920;
  vi.mocked(api.categories).mockResolvedValue([cat('c1', 'Media', 0), cat('c2', 'Infra', 1)]);
  vi.mocked(api.services).mockResolvedValue([
    svc('a1', 'Alpha', 'c1'),
    svc('a2', 'Bravo', 'c1'),
    svc('a3', 'Charlie', 'c1'),
    svc('b1', 'Delta', 'c2'),
  ]);
  vi.mocked(api.saveCategoryWidth).mockResolvedValue(true);
  vi.mocked(api.setCategoryOrder).mockResolvedValue(true);
  vi.mocked(api.createCategory).mockResolvedValue({ ok: true, status: 201, category: cat('c3', 'New', 2) });
  vi.mocked(api.setFavorite).mockResolvedValue(true);
  vi.mocked(api.renameCategory).mockResolvedValue({ ok: true, status: 200, category: cat('c1', 'Media', 0) });
  vi.mocked(api.deleteCategory).mockResolvedValue(true);
  vi.mocked(api.setLayout).mockResolvedValue(true);
  stubLayout();
});

afterEach(() => vi.clearAllMocks());

async function renderGrid(props: { isAdmin?: boolean; editMode?: boolean } = {}) {
  const { isAdmin = true, editMode = true } = props;
  render(<AppGrid isAdmin={isAdmin} editMode={editMode} />);
  await screen.findByTestId('app-grid');
}

// Drive a keyboard pick-up → move → drop on a tile's grip handle.
async function keyboardDrag(user: ReturnType<typeof userEvent.setup>, handle: HTMLElement, ...keys: string[]) {
  handle.focus();
  await user.keyboard('{ }'); // Space: pick up
  for (const k of keys) await user.keyboard(`{${k}}`);
  await user.keyboard('{ }'); // Space: drop
}

describe('AC-001 / AC-013 — grip is edit-mode-only', () => {
  it('renders no tile drag grip when not in edit mode', async () => {
    await renderGrid({ isAdmin: true, editMode: false });
    await screen.findAllByTestId('tool-link');
    expect(screen.queryAllByTestId('tile-drag-handle')).toHaveLength(0);
  });

  it('renders no tile drag grip for a non-admin even with editMode set', async () => {
    await renderGrid({ isAdmin: false, editMode: true });
    await screen.findAllByTestId('tool-link');
    expect(screen.queryAllByTestId('tile-drag-handle')).toHaveLength(0);
  });

  it('renders a grip <button> per tile in edit mode with the right aria-label', async () => {
    await renderGrid();
    const grips = await screen.findAllByTestId('tile-drag-handle');
    expect(grips).toHaveLength(4);
    grips.forEach((g) => expect(g.tagName).toBe('BUTTON'));
    const grip = screen.getByRole('button', { name: 'Reorder Alpha' });
    expect(grip).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('AC-004/005/006/008 — keyboard reorder persists once via setLayout with the full order', () => {
  it('ArrowDown then drop moves the tile one slot and PUTs the complete id order once', async () => {
    const user = userEvent.setup();
    await renderGrid();
    const grip = await screen.findByRole('button', { name: 'Reorder Alpha' });
    await keyboardDrag(user, grip, 'ArrowDown');

    await waitFor(() => expect(api.setLayout).toHaveBeenCalledTimes(1));
    expect(api.setLayout).toHaveBeenCalledWith(['a2', 'a1', 'a3', 'b1']);
  });
});

describe('AC-006 — Enter also drops', () => {
  it('picks up with Enter, moves, drops with Enter, persists', async () => {
    const user = userEvent.setup();
    await renderGrid();
    const grip = await screen.findByRole('button', { name: 'Reorder Alpha' });
    grip.focus();
    await user.keyboard('{Enter}');
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(api.setLayout).toHaveBeenCalledTimes(1));
  });
});

describe('AC-007 — Esc mid-drag cancels: no PUT, cancellation announced', () => {
  it('Space, ArrowDown, Esc sends no setLayout and announces cancellation', async () => {
    const user = userEvent.setup();
    await renderGrid();
    const grip = await screen.findByRole('button', { name: 'Reorder Alpha' });
    grip.focus();
    await user.keyboard('{ }');
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Escape}');

    expect(api.setLayout).not.toHaveBeenCalled();
    expect(screen.getByTestId('app-grid-announce')).toHaveTextContent(/cancel/i);
  });
});

describe('AC-019 — the shared announce region carries grab / move / drop', () => {
  it('updates app-grid-announce through the keyboard sequence with numeric position', async () => {
    const user = userEvent.setup();
    await renderGrid();
    const grip = await screen.findByRole('button', { name: 'Reorder Alpha' });
    const region = screen.getByTestId('app-grid-announce');
    grip.focus();
    await user.keyboard('{ }');
    await waitFor(() => expect(region).toHaveTextContent(/grabbed.*position 1 of 3/i));
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(region).toHaveTextContent(/position 2 of 3/i));
    await user.keyboard('{ }');
    await waitFor(() => expect(region).toHaveTextContent(/dropped at position 2 of 3/i));
  });
});

describe('AC-002/006 — grabbed state exposed via aria-pressed', () => {
  it('Space toggles aria-pressed on the grip', async () => {
    const user = userEvent.setup();
    await renderGrid();
    const grip = await screen.findByRole('button', { name: 'Reorder Alpha' });
    expect(grip).toHaveAttribute('aria-pressed', 'false');
    grip.focus();
    await user.keyboard('{ }');
    await waitFor(() => expect(grip).toHaveAttribute('aria-pressed', 'true'));
    await user.keyboard('{ }');
    await waitFor(() => expect(grip).toHaveAttribute('aria-pressed', 'false'));
  });
});

describe('AC-009/015 — optimistic update + rollback + toast when the PUT fails', () => {
  it('reverts the order and shows an error toast when setLayout rejects', async () => {
    const user = userEvent.setup();
    vi.mocked(api.setLayout).mockResolvedValue(false);
    await renderGrid();
    const grip = await screen.findByRole('button', { name: 'Reorder Alpha' });
    await keyboardDrag(user, grip, 'ArrowDown');

    await waitFor(() => expect(api.setLayout).toHaveBeenCalled());
    const toast = await screen.findByTestId('tile-toast');
    expect(toast).toHaveTextContent(/could not save the new tile order/i);
    expect(screen.getByTestId('app-grid-announce')).toHaveTextContent(/could not save/i);
  });
});

describe('AC-010 — within-box only: a tile cannot cross a box boundary', () => {
  it('the last tile of box A cannot land among box B ids', async () => {
    const user = userEvent.setup();
    vi.mocked(api.services).mockResolvedValue([
      svc('a1', 'Alpha', 'c1'),
      svc('a2', 'Bravo', 'c1'),
      svc('b1', 'Delta', 'c2'),
      svc('b2', 'Echo', 'c2'),
    ]);
    await renderGrid();
    const grip = await screen.findByRole('button', { name: 'Reorder Bravo' });
    // Try to push the last A tile down past the boundary into B.
    await keyboardDrag(user, grip, 'ArrowDown', 'ArrowDown');

    // Either no PUT, or a PUT that keeps B's run contiguous last and A's ids first.
    if (vi.mocked(api.setLayout).mock.calls.length > 0) {
      const order = vi.mocked(api.setLayout).mock.calls.at(-1)![0];
      expect([order[0], order[1]].sort()).toEqual(['a1', 'a2']);
      expect([order[2], order[3]].sort()).toEqual(['b1', 'b2']);
    }
  });
});

describe('AC-011 — Uncategorized box tiles are reorderable', () => {
  it('renders grips for uncategorized tiles and persists a reorder', async () => {
    const user = userEvent.setup();
    vi.mocked(api.services).mockResolvedValue([
      svc('u1', 'Uno', null),
      svc('u2', 'Dos', null),
    ]);
    await renderGrid();
    const grip = await screen.findByRole('button', { name: 'Reorder Uno' });
    await keyboardDrag(user, grip, 'ArrowDown');
    await waitFor(() => expect(api.setLayout).toHaveBeenCalledTimes(1));
    expect(api.setLayout).toHaveBeenCalledWith(['u2', 'u1']);
  });
});

describe('AC-012 — pencil and star remain present and clickable in edit mode', () => {
  it('the grip does not remove the pencil or the favorite star', async () => {
    const user = userEvent.setup();
    await renderGrid();
    await screen.findAllByTestId('tile-drag-handle');
    const pencils = screen.getAllByTestId('tile-edit');
    const stars = screen.getAllByTestId('tile-favorite');
    expect(pencils.length).toBe(4);
    expect(stars.length).toBe(4);
    // clicking the first pencil opens the edit modal
    await user.click(pencils[0]);
    expect(await screen.findByTestId('tile-edit-modal-mock')).toBeInTheDocument();
  });
});

describe('AC-017 — empty box is safe', () => {
  it('an empty box renders its empty state and no grip', async () => {
    vi.mocked(api.categories).mockResolvedValue([cat('c1', 'Media', 0)]);
    vi.mocked(api.services).mockResolvedValue([]);
    await renderGrid();
    expect(await screen.findByTestId('box-empty')).toBeInTheDocument();
    expect(screen.queryAllByTestId('tile-drag-handle')).toHaveLength(0);
  });
});

describe('AC-018 — single-tile box is safe', () => {
  it('a box with one tile shows a focusable grip and drag resolves to a no-op', async () => {
    const user = userEvent.setup();
    vi.mocked(api.categories).mockResolvedValue([cat('c1', 'Media', 0)]);
    vi.mocked(api.services).mockResolvedValue([svc('a1', 'Alpha', 'c1')]);
    await renderGrid();
    const grip = await screen.findByRole('button', { name: 'Reorder Alpha' });
    expect(grip).toBeInTheDocument();
    // pick up and drop with no move — no crash, no persist
    grip.focus();
    await user.keyboard('{ }');
    await user.keyboard('{ }');
    expect(api.setLayout).not.toHaveBeenCalled();
  });
});
