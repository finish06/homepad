import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppGrid from './AppGrid';
import type { Category, Service } from './api';
import * as api from './api';

// SPEC-app-grid — AppGrid component. jsdom has no layout, so the CSS grid pack
// (AC-001..008) is browser-gate territory; these cover the DOM contract: box +
// title (AC-009), tool link name + new-tab (AC-010/011), the admin-only width
// selector (AC-013/014/015) and "+ Add box" flow (AC-019/020/021), and the
// empty-box state (AC-012/§6.6).

vi.mock('./api', () => ({
  categories: vi.fn(),
  services: vi.fn(),
  saveCategoryWidth: vi.fn(),
  createCategory: vi.fn(),
}));

const cat = (id: string, name: string, sortIndex: number, gridWidth: number): Category => ({
  id,
  name,
  sortIndex,
  gridWidth,
});
const svc = (id: string, name: string, categoryId: string | null): Service =>
  ({ id, name, categoryId, slug: id, description: '', url: `https://${id}.test`, icon: '', status: 'UNKNOWN', favorite: false, iconLight: false, iconDark: false }) as Service;

beforeEach(() => {
  vi.mocked(api.categories).mockResolvedValue([cat('c1', 'Media', 0, 4), cat('c2', 'Infra', 1, 2)]);
  vi.mocked(api.services).mockResolvedValue([svc('s1', 'Plex', 'c1'), svc('s2', 'Grafana', 'c2')]);
  vi.mocked(api.saveCategoryWidth).mockResolvedValue(true);
  vi.mocked(api.createCategory).mockResolvedValue({ ok: true, status: 201, category: cat('c3', 'New', 2, 3) });
});

afterEach(() => vi.clearAllMocks());

async function renderGrid(isAdmin: boolean) {
  render(<AppGrid isAdmin={isAdmin} />);
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
  it('renders 6 buttons and highlights the current width (AC-013)', async () => {
    await renderGrid(true);
    const media = screen.getAllByTestId('app-grid-box')[0];
    const sel = within(media).getByTestId('width-selector');
    expect(within(sel).getAllByRole('button')).toHaveLength(6);
    expect(within(sel).getByTestId('width-btn-4')).toHaveAttribute('aria-pressed', 'true');
    expect(within(sel).getByTestId('width-btn-2')).toHaveAttribute('aria-pressed', 'false');
  });

  it('is not rendered at all for non-admins (AC-014)', async () => {
    await renderGrid(false);
    expect(screen.queryByTestId('width-selector')).not.toBeInTheDocument();
  });

  it('clicking a width re-renders the box and persists (AC-015)', async () => {
    const user = userEvent.setup();
    await renderGrid(true);
    const media = screen.getAllByTestId('app-grid-box')[0];
    await user.click(within(media).getByTestId('width-btn-6'));
    expect(media.style.getPropertyValue('--w')).toBe('6');
    expect(within(media).getByTestId('width-btn-6')).toHaveAttribute('aria-pressed', 'true');
    expect(api.saveCategoryWidth).toHaveBeenCalledWith('c1', 6);
  });

  it('rolls the width back when the save fails', async () => {
    vi.mocked(api.saveCategoryWidth).mockResolvedValue(false);
    const user = userEvent.setup();
    await renderGrid(true);
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
