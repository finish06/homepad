import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppGrid from './AppGrid';
import type { Category, Service } from '../api';
import * as api from '../api';

// SPEC v29-favorite-star-arrange-only — the ★ is a control only in arrange mode.
//
// The ★ does two jobs: it INDICATES that a tile is a favorite and it CONTROLS
// that state. This spec withdraws only the control (§3.2), so the interesting
// assertions are not "is it gone" but "is it still legible while being inert" —
// a check that passes trivially if you only ever assert absence.
//
// The second half guards the boundary the change had to split to exist at all:
// arrange mode is now reachable by non-admins, so a non-admin in arrange mode
// must receive no shared-catalog affordance (AC-006). Those operations are
// `requireAdmin` server-side, so without the split the UI would offer a control
// that 403s.

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
}));

const cat = (id: string, name: string): Category => ({
  id,
  name,
  sortIndex: 0,
  gridWidth: 8,
});

const svc = (id: string, name: string, favorite: boolean): Service =>
  ({
    id,
    name,
    categoryId: 'c1',
    slug: id,
    description: '',
    url: `https://${id}.test`,
    icon: '',
    status: 'UP',
    favorite,
    iconLight: false,
    iconDark: false,
  }) as Service;

beforeEach(() => {
  window.innerWidth = 1920;
  vi.mocked(api.categories).mockResolvedValue([cat('c1', 'Media')]);
  vi.mocked(api.services).mockResolvedValue([
    svc('fav', 'Favorited App', true),
    svc('plain', 'Plain App', false),
  ]);
  vi.mocked(api.setFavorite).mockResolvedValue(true);
  vi.mocked(api.saveCategoryWidth).mockResolvedValue(true);
  vi.mocked(api.setLayout).mockResolvedValue(true);
});

afterEach(() => vi.clearAllMocks());

async function renderGrid(opts: { isAdmin: boolean; editMode: boolean }) {
  render(<AppGrid isAdmin={opts.isAdmin} editMode={opts.editMode} showUptimeDisplay={false} />);
  await screen.findByTestId('app-grid');
}

function tileFor(name: string): HTMLElement {
  const wrap = screen.getByText(name).closest('.app-grid-tool-wrap');
  expect(wrap).not.toBeNull();
  return wrap as HTMLElement;
}

describe('v29 — the ★ is only selectable in arrange mode', () => {
  it('AC-001 — browsing exposes no interactive favorite control on any tile', async () => {
    await renderGrid({ isAdmin: false, editMode: false });
    // Scoped to the whole grid, not one tile: the claim is that NOTHING is
    // clickable, so a per-tile check could miss a stray control elsewhere.
    expect(screen.queryAllByTestId('tile-favorite')).toHaveLength(0);
    const grid = screen.getByTestId('app-grid');
    const pressable = within(grid)
      .queryAllByRole('button')
      .filter((b) => /favorite|favourite|pin /i.test(b.getAttribute('aria-label') ?? ''));
    expect(pressable).toHaveLength(0);
  });

  it('AC-002 — a favorited tile still shows ★ while browsing, inert and out of the tab order', async () => {
    await renderGrid({ isAdmin: false, editMode: false });
    const ind = within(tileFor('Favorited App')).queryByTestId('tile-favorite-indicator');
    expect(ind).not.toBeNull();
    // Visible and carries the state — this is the half that a pure "it's gone"
    // assertion would let regress silently.
    expect(ind!.textContent).toContain('★');
    expect(ind!.tagName).not.toBe('BUTTON');
    expect(ind!.getAttribute('aria-label') ?? '').toMatch(/favorite/i);
    expect(ind!.hasAttribute('tabindex')).toBe(false);
    expect(ind!.getAttribute('role')).not.toBe('button');
  });

  it('AC-003 — an unfavorited tile shows no favorite element at all while browsing', async () => {
    await renderGrid({ isAdmin: false, editMode: false });
    const tile = tileFor('Plain App');
    expect(within(tile).queryByTestId('tile-favorite')).toBeNull();
    expect(within(tile).queryByTestId('tile-favorite-indicator')).toBeNull();
    // No zero-opacity ghost either: nothing in the tile renders ☆.
    expect(tile.textContent ?? '').not.toContain('☆');
  });

  it('AC-004 — arrange mode restores the button, and it toggles', async () => {
    const user = userEvent.setup();
    await renderGrid({ isAdmin: false, editMode: true });
    const star = within(tileFor('Plain App')).getByTestId('tile-favorite');
    expect(star.tagName).toBe('BUTTON');
    expect(star).toHaveAttribute('aria-pressed', 'false');
    await user.click(star);
    expect(api.setFavorite).toHaveBeenCalledWith('plain', true);
  });

  it('AC-004 — the favorited tile reads as pressed in arrange mode', async () => {
    await renderGrid({ isAdmin: false, editMode: true });
    const star = within(tileFor('Favorited App')).getByTestId('tile-favorite');
    expect(star).toHaveAttribute('aria-pressed', 'true');
  });

  it('the star is a SIBLING of the tile link, never nested inside the anchor', async () => {
    // Relocated from app-grid-status-dot.test.tsx (SPEC-242 D-1), which asserted
    // this incidentally while rendering the normal view. v29 moved the control
    // into arrange mode, so the property needs asserting where the control now
    // lives rather than being quietly lost with the old assertion.
    await renderGrid({ isAdmin: false, editMode: true });
    const star = within(tileFor('Plain App')).getByTestId('tile-favorite');
    expect(star.closest('a')).toBeNull();
    const wrap = star.closest('.app-grid-tool-wrap') as HTMLElement;
    expect(within(wrap).getByTestId('tool-link')).toBeInTheDocument();
  });

  it('AC-008 — activating the star in arrange mode does not navigate the tile link', async () => {
    const user = userEvent.setup();
    await renderGrid({ isAdmin: false, editMode: true });
    const tile = tileFor('Plain App');
    const link = within(tile).getByTestId('tool-link') as HTMLAnchorElement;
    const onClick = vi.fn();
    link.addEventListener('click', onClick);
    await user.click(within(tile).getByTestId('tile-favorite'));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('v29 — arrange mode grants a non-admin no shared-catalog power (AC-006)', () => {
  it('a non-admin in arrange mode gets no tile-edit pencil', async () => {
    await renderGrid({ isAdmin: false, editMode: true });
    expect(screen.queryAllByTestId('tile-edit')).toHaveLength(0);
  });

  it('a non-admin in arrange mode gets no category rename / delete / width control', async () => {
    await renderGrid({ isAdmin: false, editMode: true });
    const grid = screen.getByTestId('app-grid');
    for (const t of ['box-rename', 'box-delete', 'box-width']) {
      expect(within(grid).queryAllByTestId(t)).toHaveLength(0);
    }
  });

  it('an ADMIN in arrange mode still gets the pencil — AC-007, the negative control', async () => {
    // Without this, every assertion above would also pass if the pencil were
    // deleted outright rather than correctly gated.
    await renderGrid({ isAdmin: true, editMode: true });
    expect(screen.queryAllByTestId('tile-edit').length).toBeGreaterThan(0);
  });
});
