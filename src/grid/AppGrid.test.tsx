import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { boxWidthPx, contentMaxPx, frameContentPx } from './appGridLayout';
import { cancelPendingShapeWrite, SHAPE_KEY } from './gridShapeCache';
import AppGrid from './AppGrid';
import type { Category, Service } from '../api';
import * as api from '../api';
import * as services from '../services';

// SPEC-app-grid — AppGrid component. jsdom has no layout, so the CSS grid pack
// (AC-001..008) is browser-gate territory; these cover the DOM contract: box +
// title (AC-009), tool link name + new-tab (AC-010/011), the admin-only width
// selector (AC-013/014/015) and "+ Add box" flow (AC-019/020/021), and the
// empty-box state (AC-012/§6.6).

vi.mock('../api', () => ({
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

expect.extend(toHaveNoViolations);

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
  vi.mocked(api.categories).mockResolvedValue([cat('c1', 'Media', 0, 4), cat('c2', 'Infra', 1, 3)]);
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
    // §10.4 — floors are the span's share of the CURRENT frame, so the expected
    // px are computed from the same helpers the component uses, at the viewport
    // the test runs in, rather than hard-coded 190px multiples.
    const floorFor = (span: number) => `${boxWidthPx(span, frameContentPx(window.innerWidth))}px`;

    // Gitea #446 — the frame is sized from clientWidth (no scrollbar), so floors
    // must be too; innerWidth is only the jsdom fallback (clientWidth reads 0).
    it('sizes floors from document.clientWidth, not window.innerWidth (#446)', async () => {
      const desc = Object.getOwnPropertyDescriptor(document.documentElement, 'clientWidth');
      Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 1425 });
      window.innerWidth = 1440;
      try {
        await renderGrid(true);
        const media = screen.getAllByTestId('app-grid-box')[0];
        expect(media.style.getPropertyValue('--floor')).toBe(`${boxWidthPx(4, frameContentPx(1425))}px`);
        expect(media.style.getPropertyValue('--floor')).not.toBe(`${boxWidthPx(4, frameContentPx(1440))}px`);
      } finally {
        if (desc) Object.defineProperty(document.documentElement, 'clientWidth', desc);
        else delete (document.documentElement as unknown as Record<string, unknown>).clientWidth;
      }
    });

    it('exposes --floor, --grow, --cap on each box (R3)', async () => {
      // Media = span 4 (third), 1 app (Plex); shares the row with Infra (span 3),
      // so it is NOT lone: floor = a third of the frame, grow = 1 app, cap =
      // max(floor, contentMaxPx(1)=222) = floor (the admin span is honoured).
      await renderGrid(true);
      const media = screen.getAllByTestId('app-grid-box')[0];
      expect(media.style.getPropertyValue('--floor')).toBe(floorFor(4));
      expect(media.style.getPropertyValue('--grow')).toBe('1');
      expect(media.style.getPropertyValue('--cap')).toBe(floorFor(4));
    });

    it('caps a many-app box at its content-max, above the span floor (R3)', async () => {
      // Media span 3 (a quarter) with 4 apps → cap grows to contentMaxPx(4)=840,
      // above its quarter-frame floor. A sibling Infra keeps it off a lone row.
      vi.mocked(api.categories).mockResolvedValue([cat('c1', 'Media', 0, 3), cat('c2', 'Infra', 1, 3)]);
      vi.mocked(api.services).mockResolvedValue([
        svc('s1', 'Plex', 'c1'),
        svc('s2', 'Sonarr', 'c1'),
        svc('s3', 'Radarr', 'c1'),
        svc('s4', 'Jellyfin', 'c1'),
        svc('s5', 'Grafana', 'c2'),
      ]);
      await renderGrid(true);
      const media = screen.getAllByTestId('app-grid-box')[0];
      expect(media.style.getPropertyValue('--floor')).toBe(floorFor(3));
      expect(media.style.getPropertyValue('--grow')).toBe('4');
      expect(media.style.getPropertyValue('--cap')).toBe('840px');
    });

    it('keeps an empty box at its floor with grow 0 (AC-R3-5)', async () => {
      vi.mocked(api.services).mockResolvedValue([]);
      await renderGrid(true);
      const media = screen.getAllByTestId('app-grid-box')[0]; // Media span 4, no apps
      expect(media.style.getPropertyValue('--grow')).toBe('0');
      expect(media.style.getPropertyValue('--floor')).toBe(floorFor(4));
      // cap never drops below the floor, so max-width can't shrink it under --w.
      expect(media.style.getPropertyValue('--cap')).toBe(floorFor(4));
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
      expect(media.style.getPropertyValue('--floor')).toBe(floorFor(3));
    });

    it('does NOT lift a lone EMPTY box to 100% — it stays at floor (AC-R3-5 over R4)', async () => {
      vi.mocked(api.categories).mockResolvedValue([cat('c1', 'Media', 0, 3)]);
      vi.mocked(api.services).mockResolvedValue([]);
      await renderGrid(true);
      const media = screen.getAllByTestId('app-grid-box')[0];
      expect(media.style.getPropertyValue('--grow')).toBe('0');
      expect(media.style.getPropertyValue('--cap')).toBe(floorFor(3));
    });
  });

  it('shows an empty state for a category with no tools (AC-012)', async () => {
    vi.mocked(api.services).mockResolvedValue([]);
    await renderGrid(true);
    expect(screen.getAllByTestId('box-empty')).toHaveLength(2);
  });
});

// SPEC-dashboard-empty-loading AC-009, AC-021, AC-022 — who sees what in an
// empty box. The admin's button and the member's short line depend only on the
// dashboardEmpty prop; AppGrid never works that out itself.
describe('empty box copy and the Library button (AC-009, AC-021, AC-022)', () => {
  beforeEach(() => {
    vi.mocked(api.services).mockResolvedValue([svc('s2', 'Grafana', 'c2')]); // Media (c1) is empty
  });
  const mediaBox = () => screen.getAllByTestId('app-grid-box')[0];

  it('admin: "No apps yet." and a Browse the App Library button', async () => {
    const onAddToBox = vi.fn();
    render(<AppGrid isAdmin onAddToBox={onAddToBox} dashboardEmpty={false} />);
    await screen.findByTestId('app-grid');
    expect(within(mediaBox()).getByTestId('box-empty')).toHaveTextContent(/^No apps yet\.$/);
    const btn = within(mediaBox()).getByRole('button', { name: 'Browse the App Library' });
    await userEvent.setup().click(btn);
    expect(onAddToBox).toHaveBeenCalledWith({ id: 'c1', title: 'Media' }, btn);
  });

  it('admin in arrange mode sees the same line and button', async () => {
    render(<AppGrid isAdmin editMode onAddToBox={vi.fn()} dashboardEmpty={false} />);
    await screen.findByTestId('app-grid');
    expect(within(mediaBox()).getByTestId('box-empty')).toHaveTextContent(/^No apps yet\.$/);
    expect(within(mediaBox()).getByRole('button', { name: 'Browse the App Library' })).toBeInTheDocument();
  });

  it('admin: the button is hidden while admin-empty shows (OQ-3)', async () => {
    render(<AppGrid isAdmin onAddToBox={vi.fn()} dashboardEmpty />);
    await screen.findByTestId('app-grid');
    expect(within(mediaBox()).getByTestId('box-empty')).toHaveTextContent(/^No apps yet\.$/);
    expect(within(mediaBox()).queryByRole('button', { name: 'Browse the App Library' })).toBeNull();
  });

  it('admin without onAddToBox gets no button', async () => {
    render(<AppGrid isAdmin dashboardEmpty={false} />);
    await screen.findByTestId('app-grid');
    expect(within(mediaBox()).queryByRole('button', { name: 'Browse the App Library' })).toBeNull();
  });

  it('member: the ask-an-admin line and no button', async () => {
    render(<AppGrid isAdmin={false} dashboardEmpty={false} />);
    await screen.findByTestId('app-grid');
    expect(within(mediaBox()).getByTestId('box-empty')).toHaveTextContent(
      /^No apps here yet\. Ask an admin to add some\.$/,
    );
    // The header's fold chevron (SPEC-group-header-collapse) is the box's only button.
    expect(within(mediaBox()).queryAllByRole('button').map((b) => b.dataset.testid)).toEqual(['box-chevron']);
  });

  it('kid (any non-admin, large tiles): the same line and no button', async () => {
    render(<AppGrid isAdmin={false} isKid density="large" dashboardEmpty={false} />);
    await screen.findByTestId('app-grid');
    expect(within(mediaBox()).getByTestId('box-empty')).toHaveTextContent(
      'No apps here yet. Ask an admin to add some.',
    );
    // A kid has no fold chevron either (SPEC-group-header-collapse §3.7).
    expect(within(mediaBox()).queryByRole('button')).toBeNull();
  });

  it('member while member-empty shows: only "No apps here yet." (AC-021)', async () => {
    render(<AppGrid isAdmin={false} dashboardEmpty />);
    await screen.findByTestId('app-grid');
    expect(within(mediaBox()).getByTestId('box-empty')).toHaveTextContent(/^No apps here yet\.$/);
  });

  it('a member render never shows the button even with onAddToBox passed (AC-022)', async () => {
    render(<AppGrid isAdmin={false} onAddToBox={vi.fn()} dashboardEmpty={false} />);
    await screen.findByTestId('app-grid');
    expect(screen.queryByRole('button', { name: 'Browse the App Library' })).toBeNull();
  });
});

// SPEC-dashboard-empty-loading §3.4 — focus targets App.tsx uses after the
// Library closes: a service id on every tile wrapper and a focusable heading.
describe('focus targets for the Library return (AC-011)', () => {
  it('every tile wrapper carries its service id, in view and arrange mode', async () => {
    const { unmount } = render(<AppGrid isAdmin />);
    await screen.findByTestId('app-grid');
    const link = within(screen.getAllByTestId('app-grid-box')[0]).getByTestId('tool-link');
    expect(link.closest('.app-grid-tool-wrap')).toHaveAttribute('data-service-id', 's1');
    unmount();
    render(<AppGrid isAdmin editMode />);
    await screen.findByTestId('app-grid');
    const editLink = within(screen.getAllByTestId('app-grid-box')[0]).getByTestId('tool-link');
    expect(editLink.closest('.app-grid-tool-wrap')).toHaveAttribute('data-service-id', 's1');
  });

  it('the box heading is focusable by script only', async () => {
    await renderGrid(false);
    for (const h of screen.getAllByTestId('box-title')) expect(h).toHaveAttribute('tabindex', '-1');
  });
});

describe('width selector (AC-013/014/015)', () => {
  it('renders the four spans and highlights the current one (§10.4)', async () => {
    await renderGridEdit(true, true);
    const media = screen.getAllByTestId('app-grid-box')[0];
    const sel = within(media).getByTestId('width-selector');
    expect(within(sel).getAllByRole('button')).toHaveLength(4);
    expect(within(sel).getByTestId('width-btn-4')).toHaveAttribute('aria-pressed', 'true');
    expect(within(sel).getByTestId('width-btn-3')).toHaveAttribute('aria-pressed', 'false');
    expect(within(sel).getByTestId('width-btn-12')).toHaveAttribute('aria-label', 'Full width');
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

  it('never disables a span — a fraction of the row fits every screen (D-3 retired by §10.4)', async () => {
    window.innerWidth = 1024;
    await renderGridEdit(true, true);
    const media = screen.getAllByTestId('app-grid-box')[0];
    for (const n of [3, 4, 6, 12]) {
      expect(within(media).getByTestId(`width-btn-${n}`)).not.toHaveAttribute('aria-disabled');
    }
  });

  it('rolls the width back when the save fails', async () => {
    vi.mocked(api.saveCategoryWidth).mockResolvedValue(false);
    const user = userEvent.setup();
    await renderGridEdit(true, true);
    const media = screen.getAllByTestId('app-grid-box')[0];
    await user.click(within(media).getByTestId('width-btn-3'));
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
    await user.click(within(media).getByTestId('width-btn-12'));
    await waitFor(() => expect(api.saveCategoryWidth).toHaveBeenCalledWith('c1', 12));
  });
});

// #240 — the App Grid's ToolLink dropped the per-tile favorite toggle when it
// replaced Catalog (the setFavorite API + the launcher Favorites section still
// exist, but there was no UI to pin/unpin). Restore a per-tile toggle (⋯/star)
// that calls setFavorite and pins/unpins live.
//
// SUPERSEDED IN PART by SPEC-v29-favorite-star-arrange-only (2026-10-01). #240's
// last clause used to read "available to every user in the NORMAL VIEW" — v29
// reverses that half: the ★ is a control only in arrange mode, because in the
// normal view it sits inside the tile's hit area and a stray tap silently
// destroys a user's own curation.
//
// What #240 established and v29 KEEPS: favoriting is a personal action available
// to every user, not an admin one. v29 is why "Arrange apps" stopped being
// admin-only — gating the ★ on the admin flag would have broken exactly the
// property #240 was written to establish.
//
// So these cases now render in arrange mode. The companion assertions — that no
// interactive favorite control exists in the normal view, and that a favorited
// tile still SHOWS an inert ★ there — live in
// src/grid/app-grid-fav-arrange-gate.test.tsx.
describe('AppGrid favorite toggle (#240, control relocated to arrange mode by v29)', () => {
  it('renders a favorite toggle on every tool reflecting its favorite state', async () => {
    vi.mocked(api.services).mockResolvedValue([
      { ...svc('s1', 'Plex', 'c1'), favorite: true },
      svc('s2', 'Grafana', 'c2'),
    ]);
    await renderGridEdit(false, true); // any user, ARRANGE mode (v29)
    const media = screen.getAllByTestId('app-grid-box')[0];
    const infra = screen.getAllByTestId('app-grid-box')[1];
    expect(within(media).getByTestId('tile-favorite')).toHaveAttribute('aria-pressed', 'true');
    expect(within(infra).getByTestId('tile-favorite')).toHaveAttribute('aria-pressed', 'false');
  });

  it('pins an app via the toggle (setFavorite true) and reflects it optimistically', async () => {
    const user = userEvent.setup();
    await renderGridEdit(false, true);
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
    await renderGridEdit(false, true);
    const fav = screen.getByTestId('tile-favorite');
    await user.click(fav);
    expect(api.setFavorite).toHaveBeenCalledWith('s1', false);
    await waitFor(() => expect(screen.getByTestId('tile-favorite')).toHaveAttribute('aria-pressed', 'false'));
  });

  it('rolls the favorite back when the save fails', async () => {
    vi.mocked(api.setFavorite).mockResolvedValue(false);
    const user = userEvent.setup();
    await renderGridEdit(false, true);
    const media = screen.getAllByTestId('app-grid-box')[0];
    await user.click(within(media).getByTestId('tile-favorite'));
    await waitFor(() => expect(api.setFavorite).toHaveBeenCalledWith('s1', true));
    await waitFor(() =>
      expect(within(media).getByTestId('tile-favorite')).toHaveAttribute('aria-pressed', 'false'),
    );
  });

  it('does not navigate the tool link when the favorite toggle is activated', async () => {
    const user = userEvent.setup();
    await renderGridEdit(false, true);
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
      clearRecentChanges: () => {}, refresh: async () => 'refreshed' as const,
    };
    const spy = vi.spyOn(services, 'useServicesContext').mockReturnValue(ctx);
    try {
      const user = userEvent.setup();
      await renderGridEdit(false, true);
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

// SPEC-dashboard-empty-loading AC-001, AC-002 (DOM half), AC-005, AC-008,
// AC-020 — the loading skeleton. Real geometry is the browser gate's job
// (tests/browser-gate/app-grid-skeleton.spec.ts).
describe('loading skeleton (AC-001, AC-005, AC-008, AC-020)', () => {
  function deferred<T>() {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => (resolve = r));
    return { promise, resolve };
  }
  const putShape = (v: unknown) => localStorage.setItem(SHAPE_KEY, JSON.stringify(v));
  beforeEach(() => localStorage.clear());

  it('renders the skeleton inside a real .app-grid with the density, and no spinner', async () => {
    const cats = deferred<Category[]>();
    vi.mocked(api.categories).mockReturnValue(cats.promise);
    const { container } = render(<AppGrid isAdmin={false} density="compact" userId="u1" />);
    const loading = screen.getByTestId('app-grid-loading');
    const grid = loading.querySelector('.app-grid');
    expect(grid).not.toBeNull();
    expect(grid).toHaveAttribute('data-density', 'compact');
    expect(container.querySelector('.app-spinner')).toBeNull();
    expect(screen.queryByTestId('app-grid')).toBeNull();
    // Built from the real grid classes.
    expect(grid!.querySelectorAll('.app-grid-box').length).toBe(3);
    expect(grid!.querySelectorAll('.app-grid-box-header').length).toBe(3);
    expect(grid!.querySelectorAll('.app-grid-tools .app-grid-tool').length).toBe(10);
    await act(async () => cats.resolve([cat('c1', 'Media', 0, 4)]));
    expect(screen.queryByTestId('app-grid-loading')).toBeNull();
    expect(screen.getByTestId('app-grid')).toBeInTheDocument();
  });

  it('stays while services are pending even after categories arrive', async () => {
    const svcs = deferred<Service[]>();
    vi.mocked(api.services).mockReturnValue(svcs.promise);
    render(<AppGrid isAdmin={false} />);
    await act(async () => {});
    expect(api.categories).toHaveBeenCalled();
    expect(screen.getByTestId('app-grid-loading')).toBeInTheDocument();
    await act(async () => svcs.resolve([]));
    expect(screen.queryByTestId('app-grid-loading')).toBeNull();
  });

  it('sets --floor, --grow and --cap with the real helpers, from the exact cached count', () => {
    vi.mocked(api.categories).mockReturnValue(new Promise(() => {}));
    putShape({ v: 1, user: 'u1', recent: false, boxes: [{ span: 6, count: 30, collapsed: false }, { span: 6, count: 0, collapsed: false }] });
    render(<AppGrid isAdmin={false} userId="u1" />);
    const boxes = screen.getByTestId('app-grid-loading').querySelectorAll<HTMLElement>('.app-grid-box');
    expect(boxes).toHaveLength(2);
    const floor = boxWidthPx(6, frameContentPx(1920));
    expect(boxes[0].style.getPropertyValue('--floor')).toBe(`${floor}px`);
    expect(boxes[0].style.getPropertyValue('--grow')).toBe('30');
    expect(boxes[0].style.getPropertyValue('--cap')).toBe(`${Math.max(floor, contentMaxPx(30))}px`);
    expect(boxes[0].querySelectorAll('.app-grid-tool')).toHaveLength(30);
    expect(boxes[1].style.getPropertyValue('--grow')).toBe('0');
    expect(boxes[1].querySelectorAll('.app-grid-tool')).toHaveLength(0);
  });

  it('another user\'s cache draws the fallback (AC-019)', () => {
    vi.mocked(api.categories).mockReturnValue(new Promise(() => {}));
    putShape({ v: 1, user: 'admin-1', recent: true, boxes: [{ span: 12, count: 30, collapsed: false }] });
    render(<AppGrid isAdmin={false} userId="kid-1" />);
    const loading = screen.getByTestId('app-grid-loading');
    expect(loading.querySelectorAll('.app-grid-box')).toHaveLength(3);
    expect(loading.querySelector('.recently-opened')).toBeNull();
  });

  it('reserves the Recently opened row only when the cache says recent (AC-005)', () => {
    vi.mocked(api.categories).mockReturnValue(new Promise(() => {}));
    putShape({ v: 1, user: 'u1', recent: true, boxes: [{ span: 12, count: 2, collapsed: false }] });
    const { unmount } = render(<AppGrid isAdmin={false} userId="u1" />);
    expect(screen.getByTestId('app-grid-loading').querySelector('.recently-opened')).not.toBeNull();
    unmount();
    putShape({ v: 1, user: 'u1', recent: false, boxes: [{ span: 12, count: 2, collapsed: false }] });
    render(<AppGrid isAdmin={false} userId="u1" />);
    expect(screen.getByTestId('app-grid-loading').querySelector('.recently-opened')).toBeNull();
  });

  it('a collapsed box draws its header row only (AC-020)', () => {
    vi.mocked(api.categories).mockReturnValue(new Promise(() => {}));
    putShape({ v: 1, user: 'u1', recent: false, boxes: [{ span: 6, count: 5, collapsed: true }] });
    render(<AppGrid isAdmin={false} userId="u1" />);
    const box = screen.getByTestId('app-grid-loading').querySelector<HTMLElement>('.app-grid-box')!;
    expect(box.querySelector('.app-grid-box-header')).not.toBeNull();
    expect(box.querySelector('.app-grid-tools')).toBeNull();
    // At its full width: the same grow model as an open box of 5.
    expect(box.style.getPropertyValue('--grow')).toBe('5');
  });

  it('reserves the admin\'s empty-box button, except when every box is empty (admin-empty)', () => {
    vi.mocked(api.categories).mockReturnValue(new Promise(() => {}));
    const reserved = () => screen.getByTestId('app-grid-loading').querySelectorAll('.app-grid-empty-add').length;
    putShape({ v: 1, user: 'u1', recent: false, boxes: [{ span: 6, count: 2, collapsed: false }, { span: 6, count: 0, collapsed: false }] });
    const { unmount } = render(<AppGrid isAdmin userId="u1" />);
    expect(reserved()).toBe(1);
    unmount();
    const member = render(<AppGrid isAdmin={false} userId="u1" />);
    expect(reserved()).toBe(0);
    member.unmount();
    putShape({ v: 1, user: 'u1', recent: false, boxes: [{ span: 6, count: 0, collapsed: false }] });
    render(<AppGrid isAdmin userId="u1" />);
    expect(reserved()).toBe(0);
  });

  it('an empty box draws its real line, unseen, so a wrapping line wraps in the skeleton too', () => {
    vi.mocked(api.categories).mockReturnValue(new Promise(() => {}));
    const line = () =>
      screen.getByTestId('app-grid-loading').querySelector('.app-grid-empty.app-grid-skel-hidden')?.textContent;
    putShape({ v: 1, user: 'u1', recent: false, boxes: [{ span: 3, count: 2, collapsed: false }, { span: 3, count: 0, collapsed: false }] });
    const a = render(<AppGrid isAdmin={false} userId="u1" />);
    expect(line()).toBe('No apps here yet. Ask an admin to add some.');
    a.unmount();
    const b = render(<AppGrid isAdmin userId="u1" />);
    expect(line()).toBe('No apps yet.');
    b.unmount();
    // Every box empty: the member-empty case, so the short line (AC-021).
    putShape({ v: 1, user: 'u1', recent: false, boxes: [{ span: 3, count: 0, collapsed: false }] });
    render(<AppGrid isAdmin={false} userId="u1" />);
    expect(line()).toBe('No apps here yet.');
  });

  it('draws the cached boxes empty when App already knows the dashboard is empty', () => {
    vi.mocked(api.categories).mockReturnValue(new Promise(() => {}));
    putShape({ v: 1, user: 'u1', recent: true, boxes: [{ span: 6, count: 4, collapsed: false }, { span: 6, count: 2, collapsed: false }] });
    render(<AppGrid isAdmin userId="u1" dashboardEmpty />);
    const loading = screen.getByTestId('app-grid-loading');
    expect(loading.querySelectorAll('.app-grid-box')).toHaveLength(2);
    expect(loading.querySelectorAll('.app-grid-tool')).toHaveLength(0);
    expect(loading.querySelectorAll('.app-grid-empty-add')).toHaveLength(0);
    expect(loading.querySelector('.recently-opened')).toBeNull();
  });

  it('with no cache and an empty dashboard, draws no boxes (a new install has none)', () => {
    vi.mocked(api.categories).mockReturnValue(new Promise(() => {}));
    render(<AppGrid isAdmin userId="u1" dashboardEmpty />);
    const loading = screen.getByTestId('app-grid-loading');
    expect(loading.querySelectorAll('.app-grid-box')).toHaveLength(0);
    // The admin's "+ Add box" row is still reserved.
    expect(loading.querySelectorAll('.app-grid-add')).toHaveLength(1);
  });

  it('reserves the admin\'s "+ Add box" row, and only for an admin', () => {
    vi.mocked(api.categories).mockReturnValue(new Promise(() => {}));
    const a = render(<AppGrid isAdmin userId="u1" />);
    expect(screen.getByTestId('app-grid-loading').querySelectorAll('.app-grid .app-grid-add')).toHaveLength(1);
    a.unmount();
    render(<AppGrid isAdmin={false} userId="u1" />);
    expect(screen.getByTestId('app-grid-loading').querySelectorAll('.app-grid-add')).toHaveLength(0);
  });

  it('is accessible: shapes aria-hidden, one polite status, nothing focusable, no axe violations (AC-008)', async () => {
    vi.mocked(api.categories).mockReturnValue(new Promise(() => {}));
    putShape({ v: 1, user: 'u1', recent: true, boxes: [{ span: 6, count: 3, collapsed: false }] });
    const { container } = render(<AppGrid isAdmin userId="u1" />);
    const loading = screen.getByTestId('app-grid-loading');
    const statuses = within(loading).getAllByRole('status');
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toHaveAttribute('aria-live', 'polite');
    expect(statuses[0]).toHaveTextContent('Loading dashboard…');
    for (const el of loading.querySelectorAll('.app-grid, .recently-opened')) {
      expect(el).toHaveAttribute('aria-hidden', 'true');
    }
    expect(loading.querySelectorAll('a, button, input, select, textarea, [tabindex]')).toHaveLength(0);
    expect(await axe(container)).toHaveNoViolations();
  });
});

// SPEC-dashboard-empty-loading AC-006 — when the grid writes its shape. Fake
// setTimeout only, and act() instead of findBy (whose polling would stall).
describe('shape cache writes (AC-006)', () => {
  const writes = () =>
    vi.mocked(Storage.prototype.setItem).mock.calls.filter(([k]) => k === SHAPE_KEY);
  const flush = () => act(async () => {});
  const tick = (ms: number) =>
    act(() => {
      vi.advanceTimersByTime(ms);
    });

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.spyOn(Storage.prototype, 'setItem');
  });
  afterEach(() => {
    cancelPendingShapeWrite();
    vi.useRealTimers();
    vi.mocked(Storage.prototype.setItem).mockRestore();
  });

  it('writes once, 500 ms after load', async () => {
    render(<AppGrid isAdmin={false} userId="u1" />);
    await flush();
    tick(499);
    expect(writes()).toHaveLength(0);
    tick(1);
    expect(writes()).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(SHAPE_KEY)!)).toEqual({
      v: 1,
      user: 'u1',
      recent: false,
      boxes: [
        { span: 4, count: 1, collapsed: false },
        { span: 3, count: 1, collapsed: false },
      ],
    });
  });

  it('writes nothing without a userId', async () => {
    render(<AppGrid isAdmin={false} />);
    await flush();
    tick(1000);
    expect(writes()).toHaveLength(0);
  });

  it('a burst of app changes is one debounced write; an equal shape is none', async () => {
    const ctx = (items: Service[]): services.ServicesContextValue => ({
      items,
      setItems: vi.fn(),
      lastUpdatedAt: null,
      recentChanges: [],
      clearRecentChanges: () => {},
      refresh: async () => 'refreshed' as const,
    });
    const base = [svc('s1', 'Plex', 'c1'), svc('s2', 'Grafana', 'c2')];
    const spy = vi.spyOn(services, 'useServicesContext').mockReturnValue(ctx(base));
    try {
      const { rerender } = render(<AppGrid isAdmin={false} userId="u1" />);
      await flush();
      tick(500);
      expect(writes()).toHaveLength(1);
      // An app added, then another moved between boxes, inside 500 ms.
      spy.mockReturnValue(ctx([...base, svc('s3', 'Sonarr', 'c1')]));
      rerender(<AppGrid isAdmin={false} userId="u1" />);
      tick(200);
      spy.mockReturnValue(ctx([svc('s1', 'Plex', 'c1'), svc('s2', 'Grafana', 'c1'), svc('s3', 'Sonarr', 'c1')]));
      rerender(<AppGrid isAdmin={false} userId="u1" />);
      tick(500);
      expect(writes()).toHaveLength(2);
      expect(JSON.parse(localStorage.getItem(SHAPE_KEY)!).boxes.map((b: { count: number }) => b.count)).toEqual([3, 0]);
      // A status-only change keeps the shape: no write.
      spy.mockReturnValue(
        ctx([{ ...svc('s1', 'Plex', 'c1'), status: 'UP' }, svc('s2', 'Grafana', 'c1'), svc('s3', 'Sonarr', 'c1')]),
      );
      rerender(<AppGrid isAdmin={false} userId="u1" />);
      tick(1000);
      expect(writes()).toHaveLength(2);
    } finally {
      spy.mockRestore();
    }
  });

  it('does not write while arranging, and writes the view shape when arranging turns off', async () => {
    const { rerender } = render(<AppGrid isAdmin editMode userId="u1" />);
    await flush();
    tick(1000);
    expect(writes()).toHaveLength(0);
    // A box resize in arrange mode.
    fireEvent.click(within(screen.getAllByTestId('app-grid-box')[0]).getByTestId('width-btn-12'));
    await flush();
    tick(1000);
    expect(writes()).toHaveLength(0);
    rerender(<AppGrid isAdmin editMode={false} userId="u1" />);
    tick(500);
    expect(writes()).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(SHAPE_KEY)!).boxes[0].span).toBe(12);
  });

  it('records whether the Recently opened row drew', async () => {
    localStorage.setItem('homepad.recentlyOpened', JSON.stringify(['s1']));
    render(<AppGrid isAdmin={false} userId="u1" />);
    await flush();
    expect(screen.getByTestId('recently-opened-row')).toBeInTheDocument();
    tick(500);
    expect(JSON.parse(localStorage.getItem(SHAPE_KEY)!).recent).toBe(true);
  });

  it('unmount within 500 ms writes nothing', async () => {
    const { unmount } = render(<AppGrid isAdmin={false} userId="u1" />);
    await flush();
    tick(200);
    unmount();
    tick(1000);
    expect(writes()).toHaveLength(0);
  });

  it('a read that throws falls back without error', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.mocked(api.categories).mockReturnValue(new Promise(() => {}));
    try {
      render(<AppGrid isAdmin={false} userId="u1" />);
      expect(screen.getByTestId('app-grid-loading').querySelectorAll('.app-grid-box')).toHaveLength(3);
    } finally {
      get.mockRestore();
    }
  });
});
