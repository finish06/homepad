import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppGrid from './AppGrid';
import type { Category, Service } from './api';
import * as api from './api';
import * as services from './services';

// SPEC-app-grid — AppGrid component. jsdom has no layout, so the CSS grid pack
// (AC-001..008) is browser-gate territory; these cover the DOM contract: box +
// title (AC-009), tool link name + new-tab (AC-010/011), the admin-only width
// selector (AC-013/014/015) and "+ Add box" flow (AC-019/020/021), and the
// empty-box state (AC-012/§6.6).

vi.mock('./api', () => ({
  categories: vi.fn(),
  services: vi.fn(),
  saveCategoryWidth: vi.fn(),
  setCategoryOrder: vi.fn(),
  createCategory: vi.fn(),
  setFavorite: vi.fn(),
  renameCategory: vi.fn(),
  deleteCategory: vi.fn(),
}));

// v23 — stub the real IframeOverlay so ToolLink's routing is tested in isolation
// (the overlay's own behavior is IframeOverlay.test.tsx). It renders a marker +
// the service name so we can assert the overlay opened for the right tile.
vi.mock('./IframeOverlay', () => ({
  default: ({ service, onClose }: { service: Service; onClose: () => void }) => (
    <div data-testid="iframe-overlay-mock">
      <span data-testid="iframe-overlay-mock-name">{service.name}</span>
      <button type="button" data-testid="iframe-overlay-mock-close" onClick={onClose}>
        close
      </button>
    </div>
  ),
}));

const cat = (id: string, name: string, sortIndex: number, gridWidth: number): Category => ({
  id,
  name,
  sortIndex,
  gridWidth,
});
const svc = (id: string, name: string, categoryId: string | null, clickAction?: Service['clickAction']): Service =>
  ({ id, name, categoryId, slug: id, description: '', url: `https://${id}.test`, icon: '', status: 'UNKNOWN', favorite: false, iconLight: false, iconDark: false, clickAction }) as Service;

beforeEach(() => {
  // A1 D-3: the width selector disables a --w whose box would overflow the
  // viewport. jsdom defaults innerWidth to 1024 (a width-5 box is 1046px), which
  // would disable the higher widths these tests pick. Set a wide viewport so the
  // full 1–8 range is selectable — the D-3 disable itself is covered separately.
  window.innerWidth = 1920;
  vi.mocked(api.categories).mockResolvedValue([cat('c1', 'Media', 0, 4), cat('c2', 'Infra', 1, 2)]);
  vi.mocked(api.services).mockResolvedValue([svc('s1', 'Plex', 'c1'), svc('s2', 'Grafana', 'c2')]);
  vi.mocked(api.saveCategoryWidth).mockResolvedValue(true);
  vi.mocked(api.createCategory).mockResolvedValue({ ok: true, status: 201, category: cat('c3', 'New', 2, 3) });
  vi.mocked(api.setFavorite).mockResolvedValue(true);
  vi.mocked(api.renameCategory).mockResolvedValue({ ok: true, status: 200, category: cat('c1', 'Movies', 0, 4) });
  vi.mocked(api.deleteCategory).mockResolvedValue(true);
});

afterEach(() => vi.clearAllMocks());

async function renderGrid(isAdmin: boolean) {
  render(<AppGrid isAdmin={isAdmin} />);
  await screen.findByTestId('app-grid');
}

async function renderGridEdit(isAdmin: boolean, editMode: boolean) {
  render(<AppGrid isAdmin={isAdmin} editMode={editMode} />);
  await screen.findByTestId('app-grid');
}

describe('AppGrid rendering', () => {
  it('renders one box per category with its title (AC-009)', async () => {
    await renderGrid(true);
    const titles = screen.getAllByTestId('box-title').map((n) => n.textContent);
    expect(titles).toEqual(['Media', 'Infra']);
  });

  it('renders each tool with its name inside the owning box (AC-010)', async () => {
    await renderGrid(true);
    const media = screen.getAllByTestId('app-grid-box')[0];
    expect(within(media).getByText('Plex')).toBeInTheDocument();
  });

  it('opens tools in a new tab with a safe rel (AC-011)', async () => {
    await renderGrid(true);
    const link = screen.getAllByTestId('tool-link')[0] as HTMLAnchorElement;
    expect(link).toHaveAttribute('href', 'https://s1.test');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer noopener');
    expect(link).toHaveAttribute('aria-label', 'Plex');
  });

  it('sets the --w CSS variable from the box width', async () => {
    await renderGrid(true);
    const media = screen.getAllByTestId('app-grid-box')[0];
    expect(media.style.getPropertyValue('--w')).toBe('4');
  });

  // v23 — SPEC-tile-click-action §5: ToolLink routes on service.clickAction.
  describe('click action routing (v23)', () => {
    it('new_tab opens in a new tab with a safe rel (AC-003)', async () => {
      vi.mocked(api.services).mockResolvedValue([svc('s1', 'Plex', 'c1', 'new_tab')]);
      await renderGrid(true);
      const link = screen.getAllByTestId('tool-link')[0] as HTMLAnchorElement;
      expect(link).toHaveAttribute('href', 'https://s1.test');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noreferrer noopener');
    });

    it('treats an absent clickAction as new_tab (AC-014)', async () => {
      vi.mocked(api.services).mockResolvedValue([svc('s1', 'Plex', 'c1')]);
      await renderGrid(true);
      const link = screen.getAllByTestId('tool-link')[0] as HTMLAnchorElement;
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noreferrer noopener');
    });

    it('same_tab navigates the current tab: no target attribute (AC-004)', async () => {
      vi.mocked(api.services).mockResolvedValue([svc('s1', 'Plex', 'c1', 'same_tab')]);
      await renderGrid(true);
      const link = screen.getAllByTestId('tool-link')[0] as HTMLAnchorElement;
      expect(link).toHaveAttribute('href', 'https://s1.test');
      expect(link).not.toHaveAttribute('target');
    });

    it('iframe keeps the href for right-click but opens the overlay on click (AC-005/007)', async () => {
      const user = userEvent.setup();
      vi.mocked(api.services).mockResolvedValue([svc('s1', 'Plex', 'c1', 'iframe')]);
      await renderGrid(true);
      const link = screen.getAllByTestId('tool-link')[0] as HTMLAnchorElement;
      // href present so the native context menu still offers "open in new tab".
      expect(link).toHaveAttribute('href', 'https://s1.test');
      expect(screen.queryByTestId('iframe-overlay-mock')).not.toBeInTheDocument();

      await user.click(link);
      expect(screen.getByTestId('iframe-overlay-mock')).toBeInTheDocument();
      expect(screen.getByTestId('iframe-overlay-mock-name')).toHaveTextContent('Plex');
    });

    it('closing the overlay removes it (AC-006 wiring)', async () => {
      const user = userEvent.setup();
      vi.mocked(api.services).mockResolvedValue([svc('s1', 'Plex', 'c1', 'iframe')]);
      await renderGrid(true);
      await user.click(screen.getAllByTestId('tool-link')[0]);
      expect(screen.getByTestId('iframe-overlay-mock')).toBeInTheDocument();
      await user.click(screen.getByTestId('iframe-overlay-mock-close'));
      expect(screen.queryByTestId('iframe-overlay-mock')).not.toBeInTheDocument();
    });
  });

  // SPEC-pane-fill-reflow (Phase 1, R3/R4) — the box exposes the grow model as
  // inline CSS vars (index.css owns the flex + max-width). jsdom has no layout, so
  // the ACTUAL fill/dead-space is browser-gate territory (app-grid-pane-fill.spec),
  // but the computed vars ARE deterministic JS (viewport + floors) and testable here.
  describe('pane fill grow model (R3/R4)', () => {
    it('exposes --floor, --grow, --cap on each box (R3)', async () => {
      // Media = width-4, 1 app (Plex); shares the 1920 row with Infra (width-2, 1 app),
      // so it is NOT lone: floor = boxWidthPx(4) = 840, grow = 1 app, cap = max(floor,
      // contentMaxPx(1)=222) = 840 (floor wins — the admin width-4 is honoured).
      await renderGrid(true);
      const media = screen.getAllByTestId('app-grid-box')[0];
      expect(media.style.getPropertyValue('--floor')).toBe('840px');
      expect(media.style.getPropertyValue('--grow')).toBe('1');
      expect(media.style.getPropertyValue('--cap')).toBe('840px');
    });

    it('caps a many-app box at its content-max, above the --w floor (R3)', async () => {
      // Media width-2 (floor boxWidthPx(2)=428) with 4 apps → cap grows to
      // contentMaxPx(4)=840. A sibling Infra keeps it off a lone row (else R4 → 100%).
      vi.mocked(api.categories).mockResolvedValue([cat('c1', 'Media', 0, 2), cat('c2', 'Infra', 1, 2)]);
      vi.mocked(api.services).mockResolvedValue([
        svc('s1', 'Plex', 'c1'),
        svc('s2', 'Sonarr', 'c1'),
        svc('s3', 'Radarr', 'c1'),
        svc('s4', 'Jellyfin', 'c1'),
        svc('s5', 'Grafana', 'c2'),
      ]);
      await renderGrid(true);
      const media = screen.getAllByTestId('app-grid-box')[0];
      expect(media.style.getPropertyValue('--floor')).toBe('428px');
      expect(media.style.getPropertyValue('--grow')).toBe('4');
      expect(media.style.getPropertyValue('--cap')).toBe('840px');
    });

    it('keeps an empty box at its floor with grow 0 (AC-R3-5)', async () => {
      vi.mocked(api.services).mockResolvedValue([]);
      await renderGrid(true);
      const media = screen.getAllByTestId('app-grid-box')[0]; // Media width-4, no apps
      expect(media.style.getPropertyValue('--grow')).toBe('0');
      expect(media.style.getPropertyValue('--floor')).toBe('840px');
      // cap never drops below the floor, so max-width can't shrink it under --w.
      expect(media.style.getPropertyValue('--cap')).toBe('840px');
    });

    it('lifts a lone box (alone in its row) to a 100% cap so it fills the frame (R4)', async () => {
      // A single populated box is alone in its row → cap = 100% (grows to the frame),
      // not stranded at its content-max.
      vi.mocked(api.categories).mockResolvedValue([cat('c1', 'Media', 0, 3)]);
      vi.mocked(api.services).mockResolvedValue([svc('s1', 'Plex', 'c1')]);
      await renderGrid(true);
      const media = screen.getAllByTestId('app-grid-box')[0];
      expect(media.style.getPropertyValue('--cap')).toBe('100%');
      expect(media.style.getPropertyValue('--grow')).toBe('1');
      // The floor still applies as the minimum basis (AC-R4-2).
      expect(media.style.getPropertyValue('--floor')).toBe('634px');
    });

    it('does NOT lift a lone EMPTY box to 100% — it stays at floor (AC-R3-5 over R4)', async () => {
      vi.mocked(api.categories).mockResolvedValue([cat('c1', 'Media', 0, 3)]);
      vi.mocked(api.services).mockResolvedValue([]);
      await renderGrid(true);
      const media = screen.getAllByTestId('app-grid-box')[0];
      expect(media.style.getPropertyValue('--grow')).toBe('0');
      expect(media.style.getPropertyValue('--cap')).toBe('634px');
    });
  });

  it('shows the designed empty state for a category with no tools (AC-012)', async () => {
    vi.mocked(api.services).mockResolvedValue([]);
    await renderGrid(true);
    const empties = screen.getAllByTestId('box-empty');
    expect(empties).toHaveLength(2);
    expect(empties[0]).toHaveTextContent('No apps yet — add from the Library.');
  });

  it('non-admin sees the empty box with the neutral copy (no admin hint)', async () => {
    vi.mocked(api.services).mockResolvedValue([]);
    await renderGrid(false);
    expect(screen.getAllByTestId('box-empty')[0]).toHaveTextContent('No apps in this box.');
  });
});

describe('width selector (AC-013/014/015)', () => {
  it('renders 8 buttons and highlights the current width (AC-013-A1)', async () => {
    await renderGridEdit(true, true);
    const media = screen.getAllByTestId('app-grid-box')[0];
    const sel = within(media).getByTestId('width-selector');
    expect(within(sel).getAllByRole('button')).toHaveLength(8);
    expect(within(sel).getByTestId('width-btn-4')).toHaveAttribute('aria-pressed', 'true');
    expect(within(sel).getByTestId('width-btn-2')).toHaveAttribute('aria-pressed', 'false');
  });

  it('is not rendered at all for non-admins (AC-014)', async () => {
    await renderGrid(false);
    expect(screen.queryByTestId('width-selector')).not.toBeInTheDocument();
  });

  it('is hidden for an admin outside Edit Dashboard mode (AC-014, edit-mode gate)', async () => {
    await renderGridEdit(true, false);
    expect(screen.queryByTestId('width-selector')).not.toBeInTheDocument();
  });

  it('appears on each real box for an admin in Edit Dashboard mode (AC-013)', async () => {
    await renderGridEdit(true, true);
    expect(screen.getAllByTestId('width-selector')).toHaveLength(2);
  });

  it('clicking a width re-renders the box and persists (AC-015)', async () => {
    const user = userEvent.setup();
    await renderGridEdit(true, true);
    const media = screen.getAllByTestId('app-grid-box')[0];
    await user.click(within(media).getByTestId('width-btn-6'));
    expect(media.style.getPropertyValue('--w')).toBe('6');
    expect(within(media).getByTestId('width-btn-6')).toHaveAttribute('aria-pressed', 'true');
    expect(api.saveCategoryWidth).toHaveBeenCalledWith('c1', 6);
  });

  it('offers an off-screen width as disabled and ignores its click (D-3)', async () => {
    // At a 1024px viewport a width-8 box (1664px) can't fit: D-3 renders that
    // button disabled (aria-disabled + a "Wider than this screen" title) so the
    // admin never sets an off-screen box, and clicking it persists nothing.
    window.innerWidth = 1024;
    const user = userEvent.setup();
    await renderGridEdit(true, true);
    const media = screen.getAllByTestId('app-grid-box')[0];
    const w8 = within(media).getByTestId('width-btn-8');
    expect(w8).toHaveAttribute('aria-disabled', 'true');
    expect(w8).toHaveAttribute('title', 'Wider than this screen');
    // A width that fits (width-3 = 634px) stays enabled.
    expect(within(media).getByTestId('width-btn-3')).not.toHaveAttribute('aria-disabled');
    await user.click(w8);
    expect(api.saveCategoryWidth).not.toHaveBeenCalled();
  });

  it('rolls the width back when the save fails', async () => {
    vi.mocked(api.saveCategoryWidth).mockResolvedValue(false);
    const user = userEvent.setup();
    await renderGridEdit(true, true);
    const media = screen.getAllByTestId('app-grid-box')[0];
    await user.click(within(media).getByTestId('width-btn-1'));
    await waitFor(() => expect(media.style.getPropertyValue('--w')).toBe('4'));
  });
});

describe('+ Add box (AC-019/020/021)', () => {
  it('shows the affordance only to admins (AC-019)', async () => {
    await renderGrid(false);
    expect(screen.queryByTestId('add-box')).not.toBeInTheDocument();
    render(<AppGrid isAdmin />);
    await waitFor(() => expect(screen.getAllByTestId('add-box').length).toBeGreaterThan(0));
  });

  it('creating a box prompts for a title, calls createCategory, and adds it (AC-020)', async () => {
    const user = userEvent.setup();
    await renderGrid(true);
    await user.click(screen.getByTestId('add-box'));
    await user.type(screen.getByTestId('add-box-input'), 'Downloads');
    await user.click(screen.getByTestId('add-box-create'));
    expect(api.createCategory).toHaveBeenCalledWith('Downloads');
    await waitFor(() => expect(screen.queryByTestId('add-box-modal')).not.toBeInTheDocument());
    expect(screen.getAllByTestId('box-title').map((n) => n.textContent)).toContain('New');
  });

  it('cancelling creates no box and leaves the grid unchanged (AC-021)', async () => {
    const user = userEvent.setup();
    await renderGrid(true);
    const before = screen.getAllByTestId('box-title').length;
    await user.click(screen.getByTestId('add-box'));
    await user.type(screen.getByTestId('add-box-input'), 'Nope');
    await user.click(screen.getByTestId('add-box-cancel'));
    expect(api.createCategory).not.toHaveBeenCalled();
    expect(screen.queryByTestId('add-box-modal')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('box-title')).toHaveLength(before);
  });

  it('disables Create for an empty/whitespace title', async () => {
    const user = userEvent.setup();
    await renderGrid(true);
    await user.click(screen.getByTestId('add-box'));
    expect(screen.getByTestId('add-box-create')).toBeDisabled();
    await user.type(screen.getByTestId('add-box-input'), '   ');
    expect(screen.getByTestId('add-box-create')).toBeDisabled();
  });
});

// AG-EDIT-1/2 — Edit Dashboard mode restores drag-to-rearrange for the App Grid
// boxes (regression: the App Grid replaced Catalog and dropped edit + reorder).
// Edit mode is admin-only + client-ephemeral; when on, each REAL category box
// gets a drag handle (the synthetic Uncategorized box stays pinned, not
// draggable). jsdom can't perform the drag itself (browser-gate territory); these
// cover the DOM contract that the handles appear/disappear with the mode.
describe('AppGrid Edit Dashboard mode (AG-EDIT-1/2)', () => {
  it('shows no drag handles when not in edit mode (view mode)', async () => {
    await renderGridEdit(true, false);
    expect(screen.queryByTestId('box-drag-handle')).not.toBeInTheDocument();
  });

  it('shows a drag handle on each real category box in edit mode (admin)', async () => {
    await renderGridEdit(true, true);
    const handles = screen.getAllByTestId('box-drag-handle');
    expect(handles).toHaveLength(2); // Media + Infra
    expect(handles[0]).toHaveAttribute('aria-label', expect.stringMatching(/reorder/i));
  });

  it('never shows drag handles to a non-admin, even with editMode set', async () => {
    await renderGridEdit(false, true);
    expect(screen.queryByTestId('box-drag-handle')).not.toBeInTheDocument();
  });

  it('does not make the synthetic Uncategorized box draggable', async () => {
    vi.mocked(api.services).mockResolvedValue([
      svc('s1', 'Plex', 'c1'),
      svc('s2', 'Grafana', 'c2'),
      svc('s3', 'Loose', null),
    ]);
    await renderGridEdit(true, true);
    // 3 boxes render (Media, Infra, Uncategorized) but only the 2 real ones drag.
    expect(screen.getAllByTestId('app-grid-box')).toHaveLength(3);
    expect(screen.getAllByTestId('box-drag-handle')).toHaveLength(2);
  });

  it('keeps the admin width selector working in edit mode (regression guard)', async () => {
    const user = userEvent.setup();
    await renderGridEdit(true, true);
    const media = screen.getAllByTestId('app-grid-box')[0];
    await user.click(within(media).getByTestId('width-btn-5'));
    await waitFor(() => expect(api.saveCategoryWidth).toHaveBeenCalledWith('c1', 5));
  });
});

// #240 — the App Grid's ToolLink dropped the per-tile favorite toggle when it
// replaced Catalog (the setFavorite API + the launcher Favorites section still
// exist, but there was no UI to pin/unpin). Restore a per-tile toggle (⋯/star)
// that calls setFavorite and pins/unpins live. Available to every user in the
// normal view (favoriting is a personal action, not admin edit).
describe('AppGrid favorite toggle (#240)', () => {
  it('renders a favorite toggle on every tool reflecting its favorite state', async () => {
    vi.mocked(api.services).mockResolvedValue([
      { ...svc('s1', 'Plex', 'c1'), favorite: true },
      svc('s2', 'Grafana', 'c2'),
    ]);
    await renderGrid(false); // any user, view mode
    const media = screen.getAllByTestId('app-grid-box')[0];
    const infra = screen.getAllByTestId('app-grid-box')[1];
    expect(within(media).getByTestId('tile-favorite')).toHaveAttribute('aria-pressed', 'true');
    expect(within(infra).getByTestId('tile-favorite')).toHaveAttribute('aria-pressed', 'false');
  });

  it('pins an app via the toggle (setFavorite true) and reflects it optimistically', async () => {
    const user = userEvent.setup();
    await renderGrid(false);
    const media = screen.getAllByTestId('app-grid-box')[0];
    await user.click(within(media).getByTestId('tile-favorite'));
    expect(api.setFavorite).toHaveBeenCalledWith('s1', true);
    await waitFor(() =>
      expect(within(media).getByTestId('tile-favorite')).toHaveAttribute('aria-pressed', 'true'),
    );
  });

  it('unpins an already-favorited app (setFavorite false)', async () => {
    vi.mocked(api.services).mockResolvedValue([{ ...svc('s1', 'Plex', 'c1'), favorite: true }]);
    const user = userEvent.setup();
    await renderGrid(false);
    const fav = screen.getByTestId('tile-favorite');
    await user.click(fav);
    expect(api.setFavorite).toHaveBeenCalledWith('s1', false);
    await waitFor(() => expect(screen.getByTestId('tile-favorite')).toHaveAttribute('aria-pressed', 'false'));
  });

  it('rolls the favorite back when the save fails', async () => {
    vi.mocked(api.setFavorite).mockResolvedValue(false);
    const user = userEvent.setup();
    await renderGrid(false);
    const media = screen.getAllByTestId('app-grid-box')[0];
    await user.click(within(media).getByTestId('tile-favorite'));
    await waitFor(() => expect(api.setFavorite).toHaveBeenCalledWith('s1', true));
    await waitFor(() =>
      expect(within(media).getByTestId('tile-favorite')).toHaveAttribute('aria-pressed', 'false'),
    );
  });

  it('does not navigate the tool link when the favorite toggle is activated', async () => {
    const user = userEvent.setup();
    await renderGrid(false);
    const media = screen.getAllByTestId('app-grid-box')[0];
    const link = within(media).getByTestId('tool-link');
    const onClick = vi.fn((e: Event) => e.preventDefault());
    link.addEventListener('click', onClick);
    await user.click(within(media).getByTestId('tile-favorite'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('mirrors the pin into the shared services context so the launcher stays in sync', async () => {
    const setItems = vi.fn();
    const ctx: services.ServicesContextValue = {
      items: [svc('s1', 'Plex', 'c1'), svc('s2', 'Grafana', 'c2')],
      setItems,
      lastUpdatedAt: null,
      recentChanges: [],
      clearRecentChanges: () => {},
    };
    const spy = vi.spyOn(services, 'useServicesContext').mockReturnValue(ctx);
    try {
      const user = userEvent.setup();
      await renderGrid(false);
      const media = screen.getAllByTestId('app-grid-box')[0];
      await user.click(within(media).getByTestId('tile-favorite'));
      expect(setItems).toHaveBeenCalled();
      expect(api.setFavorite).toHaveBeenCalledWith('s1', true);
    } finally {
      spy.mockRestore();
    }
  });
});

// #241 — §7 deferred box (category) rename + delete to Catalog's CategoryManager,
// which was retired with the App Grid replace, so admins could create boxes but
// not rename/delete them. Restore both in Edit Dashboard mode, per-box in the
// header (the App Grid-native home for the CategoryManager behavior): rename ↔
// PATCH /api/categories/{id}, delete ↔ DELETE /api/categories/{id}. Only real
// category boxes get the controls; the synthetic Uncategorized box never does.
describe('AppGrid box rename + delete (#241)', () => {
  it('shows no rename/delete controls in view mode', async () => {
    await renderGridEdit(true, false);
    expect(screen.queryByTestId('box-rename')).not.toBeInTheDocument();
    expect(screen.queryByTestId('box-delete')).not.toBeInTheDocument();
  });

  it('shows rename + delete on each real category box in edit mode (admin)', async () => {
    await renderGridEdit(true, true);
    expect(screen.getAllByTestId('box-rename')).toHaveLength(2);
    expect(screen.getAllByTestId('box-delete')).toHaveLength(2);
  });

  it('never shows them to a non-admin, even with editMode set', async () => {
    await renderGridEdit(false, true);
    expect(screen.queryByTestId('box-rename')).not.toBeInTheDocument();
    expect(screen.queryByTestId('box-delete')).not.toBeInTheDocument();
  });

  it('does not show them on the synthetic Uncategorized box', async () => {
    vi.mocked(api.services).mockResolvedValue([
      svc('s1', 'Plex', 'c1'),
      svc('s2', 'Grafana', 'c2'),
      svc('s3', 'Loose', null),
    ]);
    await renderGridEdit(true, true);
    expect(screen.getAllByTestId('app-grid-box')).toHaveLength(3);
    expect(screen.getAllByTestId('box-rename')).toHaveLength(2); // only the 2 real boxes
  });

  it('renames a box: seeds the input, calls renameCategory, updates the title', async () => {
    const user = userEvent.setup();
    await renderGridEdit(true, true);
    const media = screen.getAllByTestId('app-grid-box')[0];
    await user.click(within(media).getByTestId('box-rename'));
    const input = within(media).getByTestId('box-rename-input') as HTMLInputElement;
    expect(input.value).toBe('Media');
    await user.clear(input);
    await user.type(input, 'Movies');
    await user.click(within(media).getByTestId('box-rename-save'));
    expect(api.renameCategory).toHaveBeenCalledWith('c1', 'Movies');
    await waitFor(() => expect(within(media).getByTestId('box-title')).toHaveTextContent('Movies'));
    expect(within(media).queryByTestId('box-rename-input')).not.toBeInTheDocument();
  });

  it('rolls the rename back and surfaces an error when it fails', async () => {
    vi.mocked(api.renameCategory).mockResolvedValue({ ok: false, status: 409, error: 'Name taken' });
    const user = userEvent.setup();
    await renderGridEdit(true, true);
    const media = screen.getAllByTestId('app-grid-box')[0];
    await user.click(within(media).getByTestId('box-rename'));
    const input = within(media).getByTestId('box-rename-input');
    await user.clear(input);
    await user.type(input, 'Dup');
    await user.click(within(media).getByTestId('box-rename-save'));
    await waitFor(() => expect(within(media).getByTestId('box-rename-error')).toHaveTextContent('Name taken'));
    expect(within(media).getByTestId('box-title')).toHaveTextContent('Media');
  });

  it('cancelling rename leaves the title unchanged and makes no call', async () => {
    const user = userEvent.setup();
    await renderGridEdit(true, true);
    const media = screen.getAllByTestId('app-grid-box')[0];
    await user.click(within(media).getByTestId('box-rename'));
    await user.click(within(media).getByTestId('box-rename-cancel'));
    expect(within(media).queryByTestId('box-rename-input')).not.toBeInTheDocument();
    expect(within(media).getByTestId('box-title')).toHaveTextContent('Media');
    expect(api.renameCategory).not.toHaveBeenCalled();
  });

  it('deletes a box after confirm: calls deleteCategory and removes it', async () => {
    const user = userEvent.setup();
    await renderGridEdit(true, true);
    const media = screen.getAllByTestId('app-grid-box')[0];
    await user.click(within(media).getByTestId('box-delete'));
    await user.click(within(media).getByTestId('box-delete-yes'));
    expect(api.deleteCategory).toHaveBeenCalledWith('c1');
    await waitFor(() =>
      expect(screen.getAllByTestId('box-title').map((n) => n.textContent)).not.toContain('Media'),
    );
  });

  it('re-homes the deleted box apps into Uncategorized so they do not vanish', async () => {
    const user = userEvent.setup();
    await renderGridEdit(true, true);
    await user.click(within(screen.getAllByTestId('app-grid-box')[0]).getByTestId('box-delete'));
    await user.click(within(screen.getAllByTestId('app-grid-box')[0]).getByTestId('box-delete-yes'));
    await waitFor(() => expect(screen.getByText('Uncategorized')).toBeInTheDocument());
    expect(screen.getByText('Plex')).toBeInTheDocument(); // Media's app survives
  });

  it('keeps the box when the delete fails (rollback)', async () => {
    vi.mocked(api.deleteCategory).mockResolvedValue(false);
    const user = userEvent.setup();
    await renderGridEdit(true, true);
    const media = screen.getAllByTestId('app-grid-box')[0];
    await user.click(within(media).getByTestId('box-delete'));
    await user.click(within(media).getByTestId('box-delete-yes'));
    await waitFor(() => expect(api.deleteCategory).toHaveBeenCalledWith('c1'));
    await waitFor(() =>
      expect(screen.getAllByTestId('box-title').map((n) => n.textContent)).toContain('Media'),
    );
  });

  it('cancelling the delete confirm keeps the box and makes no call', async () => {
    const user = userEvent.setup();
    await renderGridEdit(true, true);
    const media = screen.getAllByTestId('app-grid-box')[0];
    await user.click(within(media).getByTestId('box-delete'));
    await user.click(within(media).getByTestId('box-delete-no'));
    expect(within(media).queryByTestId('box-delete-confirm')).not.toBeInTheDocument();
    expect(api.deleteCategory).not.toHaveBeenCalled();
  });
});
