import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  type LibraryOffer,
  type Service,
  type ServiceStatus,
} from './api';
import { DEFAULT_ICON, validateIconFile } from './icons';
import { ThemeProvider } from './theme';
import ThemeControl from './ThemeControl';

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

expect.extend(toHaveNoViolations);

// Keep the real precedence resolver + bundled default; only the async
// file-validation is stubbed so component tests don't decode real PNGs.
vi.mock('./icons', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./icons')>();
  return { ...actual, validateIconFile: vi.fn() };
});

const mockedServices = vi.mocked(services);
const mockedSetFavorite = vi.mocked(setFavorite);
const mockedSetLayout = vi.mocked(setLayout);
const mockedUploadIcon = vi.mocked(uploadIcon);
const mockedDeleteIcon = vi.mocked(deleteIcon);
const mockedDeleteService = vi.mocked(deleteService);
const mockedCreateService = vi.mocked(createService);
const mockedUpdateService = vi.mocked(updateService);
const mockedValidate = vi.mocked(validateIconFile);
const mockedSetThemePref = vi.mocked(setThemePref);
const mockedCategories = vi.mocked(categories);
const mockedCreateCategory = vi.mocked(createCategory);
const mockedRenameCategory = vi.mocked(renameCategory);
const mockedDeleteCategory = vi.mocked(deleteCategory);
const mockedSetCategoryOrder = vi.mocked(setCategoryOrder);
const mockedAssignCategory = vi.mocked(assignCategory);
const mockedGetCollapsed = vi.mocked(getCollapsedCategories);
const mockedSetCollapsed = vi.mocked(setCollapsedCategories);

function cat(over: Partial<Category> = {}): Category {
  return { id: 'c1', name: 'Media', sortIndex: 0, ...over };
}

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

function pngFile(name = 'icon.png'): File {
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type: 'image/png' });
}

// A matchMedia stub whose `matches` is live (getter) so flipping the OS theme
// re-runs registered listeners with the new value.
function stubMatchMedia(initialDark: boolean) {
  let dark = initialDark;
  const listeners = new Set<() => void>();
  const mql = {
    get matches() {
      return dark;
    },
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_t: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_t: string, cb: () => void) => listeners.delete(cb),
  };
  vi.stubGlobal('matchMedia', vi.fn(() => mql));
  return {
    set(next: boolean) {
      dark = next;
      listeners.forEach((cb) => cb());
    },
  };
}

beforeEach(() => {
  mockedServices.mockResolvedValue([svc()]);
  mockedSetFavorite.mockResolvedValue(true);
  mockedSetLayout.mockResolvedValue(true);
  mockedUploadIcon.mockResolvedValue({ ok: true, status: 204 });
  mockedDeleteIcon.mockResolvedValue(true);
  mockedDeleteService.mockResolvedValue(true);
  mockedCreateService.mockResolvedValue({ ok: true, status: 201, service: svc() });
  mockedUpdateService.mockResolvedValue({ ok: true, status: 200, service: svc() });
  mockedValidate.mockResolvedValue(null);
  mockedSetThemePref.mockResolvedValue(true);
  // Default: no categories → the catalog renders the flat v1 grid (A10), so
  // every pre-v4 suite below exercises the unchanged flat behavior.
  mockedCategories.mockResolvedValue([]);
  mockedCreateCategory.mockResolvedValue({ ok: true, status: 201, category: cat() });
  mockedRenameCategory.mockResolvedValue({ ok: true, status: 200, category: cat() });
  mockedDeleteCategory.mockResolvedValue(true);
  mockedSetCategoryOrder.mockResolvedValue(true);
  mockedAssignCategory.mockResolvedValue({ ok: true, status: 200, service: svc() });
  // v5: default = nothing collapsed (every section expanded), persist succeeds.
  mockedGetCollapsed.mockResolvedValue([]);
  mockedSetCollapsed.mockResolvedValue(true);
  // v9.3: the App Library powers the empty-state browse surface.
  vi.mocked(listLibrary).mockResolvedValue([]);
  vi.mocked(addFromLibrary).mockResolvedValue({ ok: true, status: 201, service: svc() });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.classList.remove('dark');
  localStorage.clear();
});

describe('A2 — catalog tiles render', () => {
  it('renders name, description, link-out URL and an icon for each service', async () => {
    mockedServices.mockResolvedValue([
      svc({ id: 'a', name: 'Plex', description: 'Media', url: 'https://plex.x', icon: 'https://plex.x/icon.png' }),
      svc({ id: 'b', name: 'Grafana', description: 'Dashboards', url: 'https://graf.x', icon: 'https://graf.x/icon.png' }),
    ]);
    render(<Catalog />);

    const tiles = await screen.findAllByTestId('service-tile');
    expect(tiles).toHaveLength(2);

    expect(screen.getByText('Plex')).toBeInTheDocument();
    expect(screen.getByText('Media')).toBeInTheDocument();
    expect(screen.getByText('Grafana')).toBeInTheDocument();

    const plex = tiles[0];
    expect(within(plex).getByRole('link')).toHaveAttribute('href', 'https://plex.x');
    // Link-outs open in a new tab safely.
    expect(within(plex).getByRole('link')).toHaveAttribute('rel', expect.stringContaining('noopener'));
    // No upload + legacy icon text → the icon field's full URL verbatim (precedence step 3).
    expect(within(plex).getByTestId('service-tile-icon')).toHaveAttribute(
      'src',
      'https://plex.x/icon.png',
    );
  });

  it('falls back to the bundled local default when a service has no icon', async () => {
    // cog CDN is gone — an empty icon with no uploads resolves to the local
    // default (precedence step 4), never a remote URL.
    mockedServices.mockResolvedValue([svc({ icon: '', iconLight: false, iconDark: false })]);
    render(<Catalog />);
    const icon = await screen.findByTestId('service-tile-icon');
    expect(icon).toHaveAttribute('src', DEFAULT_ICON);
    expect(icon.getAttribute('src')?.startsWith('http')).toBe(false);
  });

  it('shows the per-user empty-state CTA when the dashboard is empty (A16)', async () => {
    mockedServices.mockResolvedValue([]);
    render(<Catalog />);
    expect(await screen.findByTestId('dashboard-empty')).toBeInTheDocument();
    expect(screen.getByTestId('browse-library-cta')).toBeInTheDocument();
    expect(screen.queryByTestId('service-tile')).not.toBeInTheDocument();
  });
});

describe('A16 — empty-dashboard CTA opens the browse surface', () => {
  const offer: LibraryOffer = {
    id: 'L1', name: 'Jellyfin', url: 'https://jf.x', icon: 'https://jf.x/i.png',
    description: 'Media server', suggestedCategory: 'Media', sortIndex: 0, added: false,
  };

  it('the CTA is a real focusable button with an accessible name', async () => {
    mockedServices.mockResolvedValue([]);
    render(<Catalog />);
    const cta = await screen.findByTestId('browse-library-cta');
    expect(cta.tagName).toBe('BUTTON');
    expect(cta).toHaveAccessibleName(/browse the app library/i);
  });

  it('clicking the CTA opens the library browse surface listing offers', async () => {
    mockedServices.mockResolvedValue([]);
    vi.mocked(listLibrary).mockResolvedValue([offer]);
    render(<Catalog />);
    await userEvent.click(await screen.findByTestId('browse-library-cta'));
    expect(await screen.findByTestId('library-browse')).toBeInTheDocument();
    expect(screen.getByTestId('library-row')).toHaveAttribute('data-library-id', 'L1');
  });

  it('adding an offer reflects the new app on the dashboard', async () => {
    mockedServices.mockResolvedValue([]);
    vi.mocked(listLibrary).mockResolvedValue([offer]);
    vi.mocked(addFromLibrary).mockResolvedValue({
      ok: true, status: 201, service: svc({ id: 's9', name: 'Jellyfin' }),
    });
    render(<Catalog />);
    await userEvent.click(await screen.findByTestId('browse-library-cta'));
    await userEvent.click(await screen.findByTestId('library-add-L1'));
    await waitFor(() => expect(addFromLibrary).toHaveBeenCalledWith('L1'));
    // The new copy appears as a tile once the browse surface is dismissed.
    await userEvent.keyboard('{Escape}');
    expect(await screen.findByText('Jellyfin')).toBeInTheDocument();
  });

  it('has no axe violations on the empty dashboard (A19)', async () => {
    mockedServices.mockResolvedValue([]);
    const { container } = render(<Catalog />);
    await screen.findByTestId('dashboard-empty');
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('A3 — status badge color per state', () => {
  const cases: Array<[ServiceStatus, string]> = [
    ['UP', 'bg-emerald-500'],
    ['DOWN', 'bg-red-500'],
    ['DEGRADED', 'bg-amber-400'],
    ['UNKNOWN', 'bg-neutral-300'],
  ];

  it.each(cases)('%s renders data-status=%s with the right color class', async (status, colorClass) => {
    mockedServices.mockResolvedValue([svc({ status })]);
    render(<Catalog />);
    const badge = await screen.findByTestId('status-badge');
    expect(badge).toHaveAttribute('data-status', status);
    expect(badge.className).toContain(colorClass);
    expect(badge).toHaveAttribute('aria-label', `status: ${status}`);
  });
});

// The star toggle now lives behind Arrange mode (A5.1), so these favoriting
// tests render with `arrange` on — the toggle/persist/rollback logic itself is
// unchanged from before the gating.
describe('favorites toggle', () => {
  it('optimistically flips the star and persists via setFavorite', async () => {
    const user = userEvent.setup();
    mockedServices.mockResolvedValue([svc({ id: 'fav-me', favorite: false })]);
    render(<Catalog arrange />);

    const toggle = await screen.findByTestId('favorite-toggle');
    expect(toggle).toHaveAttribute('data-favorite', 'false');

    await user.click(toggle);

    expect(toggle).toHaveAttribute('data-favorite', 'true');
    expect(mockedSetFavorite).toHaveBeenCalledWith('fav-me', true);
  });

  it('rolls back the star when the API rejects the change', async () => {
    const user = userEvent.setup();
    mockedSetFavorite.mockResolvedValue(false);
    mockedServices.mockResolvedValue([svc({ id: 'fav-me', favorite: false })]);
    render(<Catalog arrange />);

    const toggle = await screen.findByTestId('favorite-toggle');
    await user.click(toggle);

    await waitFor(() => expect(toggle).toHaveAttribute('data-favorite', 'false'));
  });
});

// A5.1 — the favorite ★ toggle is a personalization control, revealed only in
// Arrange mode alongside the reorder arrows. The favorites *feature* (persist +
// top-pinning, A5) is untouched; only the editable control is gated.
describe('A5.1 — favorite star gated behind Arrange mode', () => {
  it('hides the favorite star by default (Arrange off — decluttered view)', async () => {
    mockedServices.mockResolvedValue([svc({ id: 'a', favorite: false })]);
    render(<Catalog />);
    await screen.findByTestId('service-tile');
    expect(screen.queryByTestId('favorite-toggle')).not.toBeInTheDocument();
  });

  it('keeps a favorited tile visibly favorited in the normal view, just without the editable star', async () => {
    // Pinning/ordering is server-driven (GET /api/services), so a favorite in
    // the normal view still renders — there's simply no toggle control to edit it.
    mockedServices.mockResolvedValue([svc({ id: 'a', favorite: true })]);
    render(<Catalog />);
    await screen.findByTestId('service-tile');
    expect(screen.queryByTestId('favorite-toggle')).not.toBeInTheDocument();
  });

  it('shows the favorite star when Arrange is on', async () => {
    mockedServices.mockResolvedValue([
      svc({ id: 'a', favorite: false }),
      svc({ id: 'b', favorite: true }),
    ]);
    render(<Catalog arrange />);
    await screen.findAllByTestId('service-tile');
    expect(screen.getAllByTestId('favorite-toggle').length).toBe(2);
  });

  it('lets a non-admin toggle + persist the star when Arrange is on (A5 preserved — not admin-gated)', async () => {
    const user = userEvent.setup();
    mockedServices.mockResolvedValue([svc({ id: 'fav-me', favorite: false })]);
    render(<Catalog isAdmin={false} arrange />);

    const toggle = await screen.findByTestId('favorite-toggle');
    await user.click(toggle);

    expect(toggle).toHaveAttribute('data-favorite', 'true');
    expect(mockedSetFavorite).toHaveBeenCalledWith('fav-me', true);
  });
});

describe('A5 — personal layout reorder', () => {
  function names() {
    return screen.getAllByTestId('service-tile-name').map((n) => n.textContent);
  }

  it('reflects the saved order on load (GET /api/services is order-aware)', async () => {
    mockedServices.mockResolvedValue([
      svc({ id: 'b', name: 'Grafana' }),
      svc({ id: 'a', name: 'Plex' }),
    ]);
    render(<Catalog />);
    await screen.findAllByTestId('service-tile');
    // Rendered in the exact order the API returned them — no client-side sort.
    expect(names()).toEqual(['Grafana', 'Plex']);
  });

  it('moves a tile down and persists the new order via setLayout', async () => {
    const user = userEvent.setup();
    mockedServices.mockResolvedValue([
      svc({ id: 'a', name: 'Plex' }),
      svc({ id: 'b', name: 'Grafana' }),
    ]);
    render(<Catalog arrange />);
    const tiles = await screen.findAllByTestId('service-tile');

    // Move the first tile (Plex) down a slot.
    await user.click(within(tiles[0]).getByTestId('move-down'));

    expect(names()).toEqual(['Grafana', 'Plex']);
    expect(mockedSetLayout).toHaveBeenCalledWith(['b', 'a']);
  });

  it('moves a tile up and persists the new order via setLayout', async () => {
    const user = userEvent.setup();
    mockedServices.mockResolvedValue([
      svc({ id: 'a', name: 'Plex' }),
      svc({ id: 'b', name: 'Grafana' }),
    ]);
    render(<Catalog arrange />);
    const tiles = await screen.findAllByTestId('service-tile');

    // Move the second tile (Grafana) up a slot.
    await user.click(within(tiles[1]).getByTestId('move-up'));

    expect(names()).toEqual(['Grafana', 'Plex']);
    expect(mockedSetLayout).toHaveBeenCalledWith(['b', 'a']);
  });

  it('rolls back to the prior order when the API rejects the reorder', async () => {
    const user = userEvent.setup();
    mockedSetLayout.mockResolvedValue(false);
    mockedServices.mockResolvedValue([
      svc({ id: 'a', name: 'Plex' }),
      svc({ id: 'b', name: 'Grafana' }),
    ]);
    render(<Catalog arrange />);
    const tiles = await screen.findAllByTestId('service-tile');

    await user.click(within(tiles[0]).getByTestId('move-down'));

    // Optimistically flipped, then reverted once the rejection lands.
    await waitFor(() => expect(names()).toEqual(['Plex', 'Grafana']));
    expect(mockedSetLayout).toHaveBeenCalledWith(['b', 'a']);
  });

  it('disables move-up on the first tile and move-down on the last', async () => {
    mockedServices.mockResolvedValue([
      svc({ id: 'a', name: 'Plex' }),
      svc({ id: 'b', name: 'Grafana' }),
    ]);
    render(<Catalog arrange />);
    const tiles = await screen.findAllByTestId('service-tile');

    expect(within(tiles[0]).getByTestId('move-up')).toBeDisabled();
    expect(within(tiles[0]).getByTestId('move-down')).toBeEnabled();
    expect(within(tiles[1]).getByTestId('move-up')).toBeEnabled();
    expect(within(tiles[1]).getByTestId('move-down')).toBeDisabled();
  });

  // v3 declutter: the reorder arrows are gated behind a per-user "Arrange"
  // toggle so the normal view stays clean. Default (Arrange off) hides them;
  // the personal-reorder capability itself (A5) is unchanged — see below.
  it('hides the reorder arrows by default (Arrange off — decluttered view)', async () => {
    mockedServices.mockResolvedValue([
      svc({ id: 'a', name: 'Plex' }),
      svc({ id: 'b', name: 'Grafana' }),
    ]);
    render(<Catalog />);
    await screen.findAllByTestId('service-tile');
    expect(screen.queryByTestId('move-up')).not.toBeInTheDocument();
    expect(screen.queryByTestId('move-down')).not.toBeInTheDocument();
  });

  it('shows the reorder arrows when Arrange is on', async () => {
    mockedServices.mockResolvedValue([
      svc({ id: 'a', name: 'Plex' }),
      svc({ id: 'b', name: 'Grafana' }),
    ]);
    render(<Catalog arrange />);
    await screen.findAllByTestId('service-tile');
    expect(screen.getAllByTestId('move-up').length).toBe(2);
    expect(screen.getAllByTestId('move-down').length).toBe(2);
  });

  it('lets a non-admin reorder when Arrange is on (A5 preserved — not admin-gated)', async () => {
    const user = userEvent.setup();
    mockedServices.mockResolvedValue([
      svc({ id: 'a', name: 'Plex' }),
      svc({ id: 'b', name: 'Grafana' }),
    ]);
    render(<Catalog isAdmin={false} arrange />);
    const tiles = await screen.findAllByTestId('service-tile');

    await user.click(within(tiles[0]).getByTestId('move-down'));

    expect(names()).toEqual(['Grafana', 'Plex']);
    expect(mockedSetLayout).toHaveBeenCalledWith(['b', 'a']);
  });
});

describe('A2(v2) — edit-mode icon controls', () => {
  it('shows a light + dark PNG slot and a delete-service control per tile in edit mode', async () => {
    render(<Catalog isAdmin editMode />);
    await screen.findByTestId('service-tile');

    const light = screen.getByTestId('icon-input-light');
    const dark = screen.getByTestId('icon-input-dark');
    expect(light).toHaveAttribute('accept', 'image/png');
    expect(dark).toHaveAttribute('accept', 'image/png');
    expect(screen.getByTestId('delete-service')).toBeInTheDocument();
    // Edit affordances replace the reorder arrows in edit mode.
    expect(screen.queryByTestId('move-up')).not.toBeInTheDocument();
  });

  it('does not show icon controls in view mode (reorder arrows instead when arranging)', async () => {
    render(<Catalog isAdmin editMode={false} arrange />);
    await screen.findByTestId('service-tile');
    expect(screen.queryByTestId('icon-controls')).not.toBeInTheDocument();
    expect(screen.getByTestId('move-up')).toBeInTheDocument();
  });

  it('does not show icon controls for a non-admin even if editMode is forced on', async () => {
    render(<Catalog isAdmin={false} editMode />);
    await screen.findByTestId('service-tile');
    expect(screen.queryByTestId('icon-controls')).not.toBeInTheDocument();
  });
});

describe('A3(v2) — upload, replace, remove an icon', () => {
  it('validates then PUTs a light PNG and reveals the remove control', async () => {
    const user = userEvent.setup();
    mockedServices.mockResolvedValue([svc({ id: 's1', iconLight: false })]);
    render(<Catalog isAdmin editMode />);

    const input = await screen.findByTestId('icon-input-light');
    const file = pngFile();
    await user.upload(input, file);

    expect(mockedValidate).toHaveBeenCalledWith(file);
    expect(mockedUploadIcon).toHaveBeenCalledWith('s1', 'light', file);
    // Flag flips true → the Remove control appears (and the slot says Replace).
    expect(await screen.findByTestId('icon-remove-light')).toBeInTheDocument();
  });

  it('replaces an existing icon via the same PUT path', async () => {
    const user = userEvent.setup();
    mockedServices.mockResolvedValue([svc({ id: 's1', iconDark: true })]);
    render(<Catalog isAdmin editMode />);

    const input = await screen.findByTestId('icon-input-dark');
    const file = pngFile('new.png');
    await user.upload(input, file);

    expect(mockedUploadIcon).toHaveBeenCalledWith('s1', 'dark', file);
  });

  it('removes an uploaded icon via deleteIcon and hides the remove control', async () => {
    const user = userEvent.setup();
    mockedServices.mockResolvedValue([svc({ id: 's1', iconLight: true })]);
    render(<Catalog isAdmin editMode />);

    const remove = await screen.findByTestId('icon-remove-light');
    await user.click(remove);

    expect(mockedDeleteIcon).toHaveBeenCalledWith('s1', 'light');
    await waitFor(() => expect(screen.queryByTestId('icon-remove-light')).not.toBeInTheDocument());
  });
});

describe('A3(v2) — client-side validation rejects before upload', () => {
  it('shows an inline error and does NOT call uploadIcon when validation fails', async () => {
    const user = userEvent.setup();
    mockedValidate.mockResolvedValue('Icon must be a PNG image.');
    mockedServices.mockResolvedValue([svc({ id: 's1' })]);
    render(<Catalog isAdmin editMode />);

    const input = await screen.findByTestId('icon-input-light');
    await user.upload(input, pngFile('bad.png'));

    expect(await screen.findByTestId('icon-error-light')).toHaveTextContent(/PNG/);
    expect(mockedUploadIcon).not.toHaveBeenCalled();
  });

  it('surfaces a server-side rejection inline when validation passes but upload fails', async () => {
    const user = userEvent.setup();
    mockedUploadIcon.mockResolvedValue({ ok: false, status: 413, error: 'too large' });
    mockedServices.mockResolvedValue([svc({ id: 's1' })]);
    render(<Catalog isAdmin editMode />);

    const input = await screen.findByTestId('icon-input-light');
    await user.upload(input, pngFile());

    expect(await screen.findByTestId('icon-error-light')).toHaveTextContent('too large');
    expect(screen.queryByTestId('icon-remove-light')).not.toBeInTheDocument();
  });
});

describe('delete service (edit mode)', () => {
  it('removes the tile optimistically and calls deleteService', async () => {
    const user = userEvent.setup();
    mockedServices.mockResolvedValue([
      svc({ id: 'a', name: 'Plex' }),
      svc({ id: 'b', name: 'Grafana' }),
    ]);
    render(<Catalog isAdmin editMode />);
    const tiles = await screen.findAllByTestId('service-tile');

    await user.click(within(tiles[0]).getByTestId('delete-service'));

    expect(mockedDeleteService).toHaveBeenCalledWith('a');
    await waitFor(() =>
      expect(screen.getAllByTestId('service-tile-name').map((n) => n.textContent)).toEqual(['Grafana']),
    );
  });

  it('rolls the tile back when deleteService rejects', async () => {
    const user = userEvent.setup();
    mockedDeleteService.mockResolvedValue(false);
    mockedServices.mockResolvedValue([svc({ id: 'a', name: 'Plex' })]);
    render(<Catalog isAdmin editMode />);
    const tile = await screen.findByTestId('service-tile');

    await user.click(within(tile).getByTestId('delete-service'));

    await waitFor(() => expect(screen.getByText('Plex')).toBeInTheDocument());
  });
});

describe('A6 — add app (admin edit mode)', () => {
  it('opens the form, POSTs the catalog fields and appends the new tile on success', async () => {
    const user = userEvent.setup();
    mockedServices.mockResolvedValue([svc({ id: 'a', name: 'Plex' })]);
    mockedCreateService.mockResolvedValue({
      ok: true,
      status: 201,
      service: svc({ id: 'new', name: 'Grafana', slug: 'grafana', url: 'https://graf.x' }),
    });
    render(<Catalog isAdmin editMode />);

    await user.click(await screen.findByTestId('add-service'));
    const form = await screen.findByTestId('service-form');

    await user.type(within(form).getByTestId('field-name'), 'Grafana');
    await user.type(within(form).getByTestId('field-slug'), 'grafana');
    await user.type(within(form).getByTestId('field-url'), 'https://graf.x');
    await user.type(within(form).getByTestId('field-icon'), 'https://graf.x/i.png');
    await user.type(within(form).getByTestId('field-gatus_key'), 'grafana');
    await user.click(within(form).getByTestId('form-submit'));

    // Full create payload incl. the snake_case gatus_key; description blank.
    expect(mockedCreateService).toHaveBeenCalledWith({
      name: 'Grafana',
      slug: 'grafana',
      url: 'https://graf.x',
      description: '',
      icon: 'https://graf.x/i.png',
      gatus_key: 'grafana',
    });
    // New tile reflected without a refetch; the form closes.
    expect(await screen.findByText('Grafana')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('service-form')).not.toBeInTheDocument());
  });

  it('surfaces a 409 slug collision inline and does not add a tile', async () => {
    const user = userEvent.setup();
    mockedServices.mockResolvedValue([svc({ id: 'a', name: 'Plex' })]);
    mockedCreateService.mockResolvedValue({
      ok: false,
      status: 409,
      error: 'a service with that slug already exists',
    });
    render(<Catalog isAdmin editMode />);

    await user.click(await screen.findByTestId('add-service'));
    const form = await screen.findByTestId('service-form');
    await user.type(within(form).getByTestId('field-name'), 'Plex Two');
    await user.type(within(form).getByTestId('field-slug'), 'plex');
    await user.type(within(form).getByTestId('field-url'), 'https://plex2.x');
    await user.click(within(form).getByTestId('form-submit'));

    expect(await screen.findByTestId('form-error')).toHaveTextContent(/already exists/);
    // Form stays open; the catalog is unchanged (still just Plex).
    expect(screen.getByTestId('service-form')).toBeInTheDocument();
    expect(screen.getAllByTestId('service-tile')).toHaveLength(1);
  });

  it('blocks submit on a missing required field and never calls createService', async () => {
    const user = userEvent.setup();
    mockedServices.mockResolvedValue([svc()]);
    render(<Catalog isAdmin editMode />);

    await user.click(await screen.findByTestId('add-service'));
    const form = await screen.findByTestId('service-form');
    // Fill slug + url but leave the required name blank.
    await user.type(within(form).getByTestId('field-slug'), 'grafana');
    await user.type(within(form).getByTestId('field-url'), 'https://graf.x');
    await user.click(within(form).getByTestId('form-submit'));

    expect(await screen.findByTestId('form-error')).toHaveTextContent(/required/i);
    expect(mockedCreateService).not.toHaveBeenCalled();
  });
});

describe('A6 — edit app (admin edit mode)', () => {
  it('prefills the form, PATCHes the fields and reflects the update (keeping favorite)', async () => {
    const user = userEvent.setup();
    mockedServices.mockResolvedValue([
      svc({ id: 's1', name: 'Plex', slug: 'plex', url: 'https://plex.x', favorite: true }),
    ]);
    mockedUpdateService.mockResolvedValue({
      ok: true,
      status: 200,
      // The API serializes favorite as false on update — the merge must not let
      // that clobber the existing star.
      service: svc({ id: 's1', name: 'Plex HD', slug: 'plex', url: 'https://plex.x', favorite: false }),
    });
    // Arrange on so the favorite star renders — we assert the merge keeps it set.
    render(<Catalog isAdmin editMode arrange />);

    await user.click(await screen.findByTestId('edit-service'));
    const form = await screen.findByTestId('service-form');
    // Prefilled from the service.
    expect(within(form).getByTestId('field-name')).toHaveValue('Plex');
    expect(within(form).getByTestId('field-slug')).toHaveValue('plex');
    expect(within(form).getByTestId('field-url')).toHaveValue('https://plex.x');

    const name = within(form).getByTestId('field-name');
    await user.clear(name);
    await user.type(name, 'Plex HD');
    await user.click(within(form).getByTestId('form-submit'));

    // Blank gatus_key on edit is OMITTED so the existing key is preserved.
    expect(mockedUpdateService).toHaveBeenCalledWith('s1', {
      name: 'Plex HD',
      slug: 'plex',
      url: 'https://plex.x',
      description: 'Media server',
      icon: 'plex',
    });
    expect(await screen.findByText('Plex HD')).toBeInTheDocument();
    // Favorite survives the update response's zero-value favorite.
    expect(screen.getByTestId('favorite-toggle')).toHaveAttribute('data-favorite', 'true');
  });

  it('includes gatus_key in the PATCH only when the admin types one', async () => {
    const user = userEvent.setup();
    mockedServices.mockResolvedValue([svc({ id: 's1', name: 'Plex' })]);
    render(<Catalog isAdmin editMode />);

    await user.click(await screen.findByTestId('edit-service'));
    const form = await screen.findByTestId('service-form');
    await user.type(within(form).getByTestId('field-gatus_key'), 'plex-probe');
    await user.click(within(form).getByTestId('form-submit'));

    expect(mockedUpdateService).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ gatus_key: 'plex-probe' }),
    );
  });
});

describe('A7 — theme-aware rendering (prefers-color-scheme)', () => {
  it('renders the light variant under the light OS theme and swaps to dark live', async () => {
    const media = stubMatchMedia(false); // OS = light
    mockedServices.mockResolvedValue([svc({ id: 's1', iconLight: true, iconDark: true, icon: '' })]);
    render(<Catalog />);

    const icon = await screen.findByTestId('service-tile-icon');
    expect(icon).toHaveAttribute('src', '/api/services/s1/icon/light');

    // OS flips to dark → the same <img> re-points with no reload.
    act(() => media.set(true));
    expect(icon).toHaveAttribute('src', '/api/services/s1/icon/dark');
  });
});

describe('A9 — icon variant follows the resolved theme (driven by the control)', () => {
  it('swaps /icon/light ↔ /icon/dark when the theme control flips, no reload', async () => {
    const user = userEvent.setup();
    stubMatchMedia(false); // OS light; pref starts at light so resolved = light
    mockedServices.mockResolvedValue([svc({ id: 's1', iconLight: true, iconDark: true, icon: '' })]);
    render(
      <ThemeProvider userPref="light">
        <ThemeControl />
        <Catalog />
      </ThemeProvider>,
    );

    const icon = await screen.findByTestId('service-tile-icon');
    expect(icon).toHaveAttribute('src', '/api/services/s1/icon/light');

    // Flip the real control to Dark — the SAME <img> re-points to the dark
    // variant in place (this is v2 A7 now exercised by a user-facing control).
    await user.click(screen.getByTestId('theme-dark'));
    expect(icon).toHaveAttribute('src', '/api/services/s1/icon/dark');

    await user.click(screen.getByTestId('theme-light'));
    expect(icon).toHaveAttribute('src', '/api/services/s1/icon/light');
  });
});

describe('A9 — never a broken image', () => {
  it('falls back to the bundled local default on an <img> error', async () => {
    mockedServices.mockResolvedValue([svc({ id: 's1', icon: 'https://plex.x/icon.png' })]);
    render(<Catalog />);
    const icon = await screen.findByTestId('service-tile-icon');
    // Starts on the icon field's full URL…
    expect(icon).toHaveAttribute('src', 'https://plex.x/icon.png');

    fireEvent.error(icon);

    // …then collapses to the local default (not a CDN URL) when it fails.
    expect(icon.getAttribute('src')).toBe(DEFAULT_ICON);
    expect(icon.getAttribute('src')?.startsWith('http')).toBe(false);
  });
});

// ── v4 app categories (grouped render + admin management) ────────────────────

// Find a section by its header text, tolerant of duplicate texts elsewhere on
// the page (e.g. the same name appearing in a per-tile category <select>).
function sectionByHeader(title: string): HTMLElement {
  const header = screen
    .getAllByTestId('category-header')
    .find((h) => h.textContent === title);
  return header!.closest('section') as HTMLElement;
}

function headerOrder(): (string | null)[] {
  return screen.getAllByTestId('category-header').map((h) => h.textContent);
}

describe('v4 A10 — flat v1 render when no categories defined', () => {
  it('renders no section headers and a single flat grid', async () => {
    mockedCategories.mockResolvedValue([]);
    mockedServices.mockResolvedValue([
      svc({ id: 'a', name: 'Plex' }),
      svc({ id: 'b', name: 'Grafana' }),
    ]);
    render(<Catalog />);
    await screen.findAllByTestId('service-tile');
    expect(screen.queryByTestId('category-header')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('service-tile')).toHaveLength(2);
  });
});

describe('v4 A9 — grouped catalog render', () => {
  it('renders Favorites first, categories in admin order, Uncategorized last', async () => {
    mockedCategories.mockResolvedValue([
      cat({ id: 'media', name: 'Media', sortIndex: 0 }),
      cat({ id: 'infra', name: 'Infra', sortIndex: 1 }),
    ]);
    mockedServices.mockResolvedValue([
      svc({ id: 'a', name: 'Plex', categoryId: 'media', categoryName: 'Media', favorite: true }),
      svc({ id: 'b', name: 'Grafana', categoryId: 'infra', categoryName: 'Infra' }),
      svc({ id: 'c', name: 'Notion' }), // uncategorized
    ]);
    render(<Catalog />);
    await screen.findAllByTestId('service-tile');
    expect(headerOrder()).toEqual(['Favorites', 'Media', 'Infra', 'Uncategorized']);
  });

  it('omits Favorites when nothing is favorited and Uncategorized when all are categorized', async () => {
    mockedCategories.mockResolvedValue([cat({ id: 'media', name: 'Media', sortIndex: 0 })]);
    mockedServices.mockResolvedValue([
      svc({ id: 'a', name: 'Plex', categoryId: 'media', categoryName: 'Media' }),
    ]);
    render(<Catalog />);
    await screen.findAllByTestId('service-tile');
    expect(headerOrder()).toEqual(['Media']);
  });

  it('shows a favorited categorized app in BOTH Favorites and its category (Q3)', async () => {
    mockedCategories.mockResolvedValue([cat({ id: 'media', name: 'Media', sortIndex: 0 })]);
    mockedServices.mockResolvedValue([
      svc({ id: 'a', name: 'Plex', categoryId: 'media', categoryName: 'Media', favorite: true }),
    ]);
    render(<Catalog />);
    await screen.findAllByTestId('service-tile');
    expect(headerOrder()).toEqual(['Favorites', 'Media']);
    // One tile in Favorites + one in Media = two Plex tiles.
    expect(screen.getAllByText('Plex')).toHaveLength(2);
    expect(within(sectionByHeader('Favorites')).getByText('Plex')).toBeInTheDocument();
    expect(within(sectionByHeader('Media')).getByText('Plex')).toBeInTheDocument();
  });

  it('renders an empty category section header even with no apps assigned', async () => {
    mockedCategories.mockResolvedValue([cat({ id: 'media', name: 'Media', sortIndex: 0 })]);
    mockedServices.mockResolvedValue([svc({ id: 'c', name: 'Notion' })]); // uncategorized only
    render(<Catalog />);
    await screen.findAllByTestId('service-tile');
    expect(headerOrder()).toEqual(['Media', 'Uncategorized']);
    expect(within(sectionByHeader('Media')).queryByTestId('service-tile')).not.toBeInTheDocument();
  });
});

describe('v4 A11 — tile behavior + reorder scoped within a section', () => {
  it('reorders within a section, swapping the section-neighbor (not the global neighbor)', async () => {
    const user = userEvent.setup();
    mockedCategories.mockResolvedValue([cat({ id: 'media', name: 'Media', sortIndex: 0 })]);
    // Global order: Plex(media), Notion(uncat), Jellyfin(media). Within Media: Plex, Jellyfin.
    mockedServices.mockResolvedValue([
      svc({ id: 'a', name: 'Plex', categoryId: 'media', categoryName: 'Media' }),
      svc({ id: 'c', name: 'Notion' }),
      svc({ id: 'd', name: 'Jellyfin', categoryId: 'media', categoryName: 'Media' }),
    ]);
    render(<Catalog arrange />);
    await screen.findAllByTestId('service-tile');

    const media = sectionByHeader('Media');
    const plexTile = within(media).getAllByTestId('service-tile')[0];
    await user.click(within(plexTile).getByTestId('move-down'));

    // Plex swaps with Jellyfin (its Media neighbor), NOT Notion (its global
    // neighbor) — the persisted global order reflects that scoped swap.
    expect(mockedSetLayout).toHaveBeenCalledWith(['d', 'c', 'a']);
    const mediaNames = within(sectionByHeader('Media'))
      .getAllByTestId('service-tile-name')
      .map((n) => n.textContent);
    expect(mediaNames).toEqual(['Jellyfin', 'Plex']);
  });

  it('disables move-up on the first and move-down on the last tile WITHIN a section', async () => {
    mockedCategories.mockResolvedValue([cat({ id: 'media', name: 'Media', sortIndex: 0 })]);
    mockedServices.mockResolvedValue([
      svc({ id: 'a', name: 'Plex', categoryId: 'media', categoryName: 'Media' }),
      svc({ id: 'd', name: 'Jellyfin', categoryId: 'media', categoryName: 'Media' }),
    ]);
    render(<Catalog arrange />);
    await screen.findAllByTestId('service-tile');
    const tiles = within(sectionByHeader('Media')).getAllByTestId('service-tile');
    expect(within(tiles[0]).getByTestId('move-up')).toBeDisabled();
    expect(within(tiles[1]).getByTestId('move-down')).toBeDisabled();
  });

  it('keeps status badge, favorite star and icon within a section', async () => {
    mockedCategories.mockResolvedValue([cat({ id: 'media', name: 'Media', sortIndex: 0 })]);
    mockedServices.mockResolvedValue([
      svc({ id: 'a', name: 'Plex', categoryId: 'media', categoryName: 'Media', status: 'DOWN', favorite: true }),
    ]);
    render(<Catalog arrange />);
    await screen.findAllByTestId('service-tile');
    const media = sectionByHeader('Media');
    expect(within(media).getByTestId('status-badge')).toHaveAttribute('data-status', 'DOWN');
    expect(within(media).getByTestId('favorite-toggle')).toHaveAttribute('data-favorite', 'true');
    expect(within(media).getByTestId('service-tile-icon')).toBeInTheDocument();
  });
});

// ── v4 admin category management (PART 2) ────────────────────────────────────
// The CRUD/reorder/assign controls live behind the EXISTING admin Edit mode —
// the same toggle that gates Add/Edit/Delete service + icon controls.

function managerRow(name: string): HTMLElement {
  const input = screen
    .getAllByTestId('category-rename-input')
    .find((i) => (i as HTMLInputElement).value === name);
  return input!.closest('[data-testid="category-row"]') as HTMLElement;
}

describe('v4 — category manager visibility (admin Edit mode)', () => {
  it('shows the category manager only in admin Edit mode', async () => {
    render(<Catalog isAdmin editMode />);
    await screen.findByTestId('service-tile');
    expect(screen.getByTestId('category-manager')).toBeInTheDocument();
  });

  it('hides it in view mode and for a non-admin even with editMode forced on', async () => {
    const { rerender } = render(<Catalog isAdmin editMode={false} />);
    await screen.findByTestId('service-tile');
    expect(screen.queryByTestId('category-manager')).not.toBeInTheDocument();

    rerender(<Catalog isAdmin={false} editMode />);
    await screen.findByTestId('service-tile');
    expect(screen.queryByTestId('category-manager')).not.toBeInTheDocument();
  });

  it('shows the manager even with zero categories so the first one can be created', async () => {
    mockedCategories.mockResolvedValue([]);
    render(<Catalog isAdmin editMode />);
    await screen.findByTestId('category-manager');
    expect(screen.queryByTestId('category-row')).not.toBeInTheDocument();
    expect(screen.getByTestId('category-name-input')).toBeInTheDocument();
  });
});

describe('v4 A1 — create category', () => {
  it('POSTs the typed name and renders the new section on success', async () => {
    const user = userEvent.setup();
    mockedCategories.mockResolvedValue([]);
    mockedServices.mockResolvedValue([svc({ id: 'a', name: 'Plex' })]); // uncategorized
    mockedCreateCategory.mockResolvedValue({
      ok: true,
      status: 201,
      category: cat({ id: 'media', name: 'Media', sortIndex: 0 }),
    });
    render(<Catalog isAdmin editMode />);
    await screen.findByTestId('category-manager');

    await user.type(screen.getByTestId('category-name-input'), 'Media');
    await user.click(screen.getByTestId('category-create'));

    expect(mockedCreateCategory).toHaveBeenCalledWith('Media');
    // The new category drives a grouped render: a Media section appears.
    await waitFor(() => expect(headerOrder()).toEqual(['Media', 'Uncategorized']));
    // Input clears for the next create.
    expect(screen.getByTestId('category-name-input')).toHaveValue('');
  });

  it('surfaces a 409 duplicate-name error inline and adds no section', async () => {
    const user = userEvent.setup();
    mockedCategories.mockResolvedValue([cat({ id: 'media', name: 'Media', sortIndex: 0 })]);
    mockedServices.mockResolvedValue([svc({ id: 'a', name: 'Plex', categoryId: 'media', categoryName: 'Media' })]);
    mockedCreateCategory.mockResolvedValue({
      ok: false,
      status: 409,
      error: 'a category with that name already exists',
    });
    render(<Catalog isAdmin editMode />);
    await screen.findByTestId('category-manager');

    await user.type(screen.getByTestId('category-name-input'), 'Media');
    await user.click(screen.getByTestId('category-create'));

    expect(await screen.findByTestId('category-create-error')).toHaveTextContent(/already exists/);
    expect(headerOrder()).toEqual(['Media']); // still just the one
  });
});

describe('v4 A3 — rename category', () => {
  it('PATCHes the new name and updates the section header', async () => {
    const user = userEvent.setup();
    mockedCategories.mockResolvedValue([cat({ id: 'media', name: 'Media', sortIndex: 0 })]);
    mockedServices.mockResolvedValue([svc({ id: 'a', name: 'Plex', categoryId: 'media', categoryName: 'Media' })]);
    mockedRenameCategory.mockResolvedValue({
      ok: true,
      status: 200,
      category: cat({ id: 'media', name: 'Infra', sortIndex: 0 }),
    });
    render(<Catalog isAdmin editMode />);
    await screen.findByTestId('category-manager');

    const row = managerRow('Media');
    const input = within(row).getByTestId('category-rename-input');
    await user.clear(input);
    await user.type(input, 'Infra');
    await user.click(within(row).getByTestId('category-rename'));

    expect(mockedRenameCategory).toHaveBeenCalledWith('media', 'Infra');
    await waitFor(() => expect(headerOrder()).toEqual(['Infra']));
  });

  it('surfaces a rename error (409/404) inline on the row', async () => {
    const user = userEvent.setup();
    mockedCategories.mockResolvedValue([
      cat({ id: 'media', name: 'Media', sortIndex: 0 }),
      cat({ id: 'infra', name: 'Infra', sortIndex: 1 }),
    ]);
    mockedRenameCategory.mockResolvedValue({
      ok: false,
      status: 409,
      error: 'a category with that name already exists',
    });
    render(<Catalog isAdmin editMode />);
    await screen.findByTestId('category-manager');

    const row = managerRow('Media');
    const input = within(row).getByTestId('category-rename-input');
    await user.clear(input);
    await user.type(input, 'Infra');
    await user.click(within(row).getByTestId('category-rename'));

    expect(await within(row).findByTestId('category-row-error')).toHaveTextContent(/already exists/);
  });
});

describe('v4 A7 — delete category', () => {
  it('deletes the category and its apps fall back to Uncategorized (no app deleted)', async () => {
    const user = userEvent.setup();
    mockedCategories.mockResolvedValue([cat({ id: 'media', name: 'Media', sortIndex: 0 })]);
    mockedServices.mockResolvedValue([
      svc({ id: 'a', name: 'Plex', categoryId: 'media', categoryName: 'Media' }),
    ]);
    render(<Catalog isAdmin editMode />);
    await screen.findByTestId('category-manager');

    await user.click(within(managerRow('Media')).getByTestId('category-delete'));

    expect(mockedDeleteCategory).toHaveBeenCalledWith('media');
    // Only category gone → flat render, no headers; the app survives.
    await waitFor(() => expect(screen.queryByTestId('category-row')).not.toBeInTheDocument());
    expect(screen.queryByTestId('category-header')).not.toBeInTheDocument();
    expect(screen.getByText('Plex')).toBeInTheDocument();
  });

  it('rolls back the manager + apps when the delete API rejects', async () => {
    const user = userEvent.setup();
    mockedDeleteCategory.mockResolvedValue(false);
    mockedCategories.mockResolvedValue([cat({ id: 'media', name: 'Media', sortIndex: 0 })]);
    mockedServices.mockResolvedValue([
      svc({ id: 'a', name: 'Plex', categoryId: 'media', categoryName: 'Media' }),
    ]);
    render(<Catalog isAdmin editMode />);
    await screen.findByTestId('category-manager');

    await user.click(within(managerRow('Media')).getByTestId('category-delete'));

    await waitFor(() => expect(managerRow('Media')).toBeInTheDocument());
    expect(headerOrder()).toEqual(['Media']);
  });
});

describe('v4 A4 — reorder categories', () => {
  it('moves a category down, persists the new order and reorders the sections', async () => {
    const user = userEvent.setup();
    mockedCategories.mockResolvedValue([
      cat({ id: 'media', name: 'Media', sortIndex: 0 }),
      cat({ id: 'infra', name: 'Infra', sortIndex: 1 }),
    ]);
    mockedServices.mockResolvedValue([svc({ id: 'c', name: 'Notion' })]); // uncategorized
    render(<Catalog isAdmin editMode />);
    await screen.findByTestId('category-manager');
    expect(headerOrder()).toEqual(['Media', 'Infra', 'Uncategorized']);

    await user.click(within(managerRow('Media')).getByTestId('category-move-down'));

    expect(mockedSetCategoryOrder).toHaveBeenCalledWith(['infra', 'media']);
    expect(headerOrder()).toEqual(['Infra', 'Media', 'Uncategorized']);
  });

  it('disables move-up on the first row and move-down on the last', async () => {
    mockedCategories.mockResolvedValue([
      cat({ id: 'media', name: 'Media', sortIndex: 0 }),
      cat({ id: 'infra', name: 'Infra', sortIndex: 1 }),
    ]);
    render(<Catalog isAdmin editMode />);
    await screen.findByTestId('category-manager');
    expect(within(managerRow('Media')).getByTestId('category-move-up')).toBeDisabled();
    expect(within(managerRow('Infra')).getByTestId('category-move-down')).toBeDisabled();
  });
});

describe('v4 A5 — assign a service to a category (per-tile, edit mode)', () => {
  it('assigns an uncategorized app to a category and moves its tile there', async () => {
    const user = userEvent.setup();
    mockedCategories.mockResolvedValue([cat({ id: 'media', name: 'Media', sortIndex: 0 })]);
    mockedServices.mockResolvedValue([svc({ id: 'a', name: 'Plex' })]); // uncategorized
    mockedAssignCategory.mockResolvedValue({
      ok: true,
      status: 200,
      service: svc({ id: 'a', name: 'Plex', categoryId: 'media', categoryName: 'Media' }),
    });
    render(<Catalog isAdmin editMode />);
    await screen.findByTestId('service-tile');

    // The tile starts in Uncategorized; pick Media from its assign <select>.
    const tile = within(sectionByHeader('Uncategorized')).getByTestId('service-tile');
    await user.selectOptions(within(tile).getByTestId('category-select'), 'media');

    expect(mockedAssignCategory).toHaveBeenCalledWith('a', 'media');
    await waitFor(() =>
      expect(within(sectionByHeader('Media')).getByText('Plex')).toBeInTheDocument(),
    );
  });

  it('clears a categorized app back to Uncategorized (categoryId → null)', async () => {
    const user = userEvent.setup();
    mockedCategories.mockResolvedValue([cat({ id: 'media', name: 'Media', sortIndex: 0 })]);
    mockedServices.mockResolvedValue([
      svc({ id: 'a', name: 'Plex', categoryId: 'media', categoryName: 'Media' }),
    ]);
    mockedAssignCategory.mockResolvedValue({
      ok: true,
      status: 200,
      service: svc({ id: 'a', name: 'Plex', categoryId: null, categoryName: null }),
    });
    render(<Catalog isAdmin editMode />);
    await screen.findByTestId('service-tile');

    const tile = within(sectionByHeader('Media')).getByTestId('service-tile');
    await user.selectOptions(within(tile).getByTestId('category-select'), '');

    expect(mockedAssignCategory).toHaveBeenCalledWith('a', null);
    await waitFor(() =>
      expect(within(sectionByHeader('Uncategorized')).getByText('Plex')).toBeInTheDocument(),
    );
  });

  it('surfaces a 400 (bogus category) inline and leaves the tile put', async () => {
    const user = userEvent.setup();
    mockedCategories.mockResolvedValue([cat({ id: 'media', name: 'Media', sortIndex: 0 })]);
    mockedServices.mockResolvedValue([svc({ id: 'a', name: 'Plex' })]); // uncategorized
    mockedAssignCategory.mockResolvedValue({ ok: false, status: 400, error: 'no such category' });
    render(<Catalog isAdmin editMode />);
    await screen.findByTestId('service-tile');

    const tile = within(sectionByHeader('Uncategorized')).getByTestId('service-tile');
    await user.selectOptions(within(tile).getByTestId('category-select'), 'media');

    expect(await within(tile).findByTestId('category-select-error')).toHaveTextContent(/no such category/);
    // Still Uncategorized — the failed assign didn't move it.
    expect(within(sectionByHeader('Uncategorized')).getByText('Plex')).toBeInTheDocument();
  });
});

// ── v5 collapsible categories (disclosure interaction + per-user persistence) ─

// The collapsible category header is a <button> (Favorites/Uncategorized stay a
// static <h2>). Find it by its title text, tolerant of the trailing "· count".
function catHeaderButton(title: string): HTMLButtonElement {
  return screen
    .getAllByTestId('category-header')
    .find((h) => h.tagName === 'BUTTON' && h.textContent!.startsWith(title)) as HTMLButtonElement;
}

// Like sectionByHeader but tolerant of a collapsed header's trailing "· count".
function catSection(title: string): HTMLElement {
  const header = screen
    .getAllByTestId('category-header')
    .find((h) => h.textContent!.startsWith(title));
  return header!.closest('section') as HTMLElement;
}

describe('v5 A1 — header is a disclosure: click toggles collapsed↔expanded', () => {
  beforeEach(() => {
    mockedCategories.mockResolvedValue([cat({ id: 'media', name: 'Media', sortIndex: 0 })]);
    mockedServices.mockResolvedValue([
      svc({ id: 'a', name: 'Plex', categoryId: 'media', categoryName: 'Media' }),
    ]);
  });

  it('hides the tiles when collapsed and shows them again when re-expanded', async () => {
    const user = userEvent.setup();
    render(<Catalog />);
    await screen.findByTestId('service-tile');
    // Default expanded — the tile is shown.
    expect(within(catSection('Media')).getByTestId('service-tile')).toBeInTheDocument();

    await user.click(catHeaderButton('Media'));
    // Collapsed — tiles hidden, count shown.
    expect(within(catSection('Media')).queryByTestId('service-tile')).not.toBeInTheDocument();
    expect(screen.getByTestId('category-count')).toHaveTextContent('· 1');

    await user.click(catHeaderButton('Media'));
    // Expanded again — tiles back.
    expect(within(catSection('Media')).getByTestId('service-tile')).toBeInTheDocument();
  });

  it('PUTs the whole collapsed set on toggle (whole-set replace contract)', async () => {
    const user = userEvent.setup();
    render(<Catalog />);
    await screen.findByTestId('service-tile');
    await user.click(catHeaderButton('Media'));
    expect(mockedSetCollapsed).toHaveBeenCalledWith(['media']);
    // Re-expanding sends the empty set.
    await user.click(catHeaderButton('Media'));
    expect(mockedSetCollapsed).toHaveBeenLastCalledWith([]);
  });
});

describe('v5 A2 — default is expanded (no stored collapse state)', () => {
  it('renders every section open and the chevron rotated (expanded) when the set is empty', async () => {
    mockedGetCollapsed.mockResolvedValue([]);
    mockedCategories.mockResolvedValue([
      cat({ id: 'media', name: 'Media', sortIndex: 0 }),
      cat({ id: 'infra', name: 'Infra', sortIndex: 1 }),
    ]);
    mockedServices.mockResolvedValue([
      svc({ id: 'a', name: 'Plex', categoryId: 'media', categoryName: 'Media' }),
      svc({ id: 'b', name: 'Grafana', categoryId: 'infra', categoryName: 'Infra' }),
    ]);
    render(<Catalog />);
    await screen.findAllByTestId('service-tile');
    expect(catHeaderButton('Media')).toHaveAttribute('aria-expanded', 'true');
    expect(catHeaderButton('Infra')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByTestId('category-count')).not.toBeInTheDocument();
  });
});

describe('v5 A3 — collapse state persists per-user (rendered on boot)', () => {
  it('renders a stored-collapsed category folded on load', async () => {
    mockedGetCollapsed.mockResolvedValue(['media']);
    mockedCategories.mockResolvedValue([cat({ id: 'media', name: 'Media', sortIndex: 0 })]);
    mockedServices.mockResolvedValue([
      svc({ id: 'a', name: 'Plex', categoryId: 'media', categoryName: 'Media' }),
    ]);
    render(<Catalog />);
    await waitFor(() =>
      expect(catHeaderButton('Media')).toHaveAttribute('aria-expanded', 'false'),
    );
    expect(within(catSection('Media')).queryByTestId('service-tile')).not.toBeInTheDocument();
  });

  it('paints from the localStorage cache on first render — no flash before the server resolves', async () => {
    // Cache says Media is folded; the server fetch is left pending.
    localStorage.setItem('homepad.collapsedCategories', JSON.stringify(['media']));
    mockedGetCollapsed.mockReturnValue(new Promise(() => {}));
    mockedCategories.mockResolvedValue([cat({ id: 'media', name: 'Media', sortIndex: 0 })]);
    mockedServices.mockResolvedValue([
      svc({ id: 'a', name: 'Plex', categoryId: 'media', categoryName: 'Media' }),
    ]);
    render(<Catalog />);
    // Media is folded the moment the section first renders (cache-seeded state).
    await waitFor(() => expect(catHeaderButton('Media')).toBeInTheDocument());
    expect(catHeaderButton('Media')).toHaveAttribute('aria-expanded', 'false');
    expect(within(catSection('Media')).queryByTestId('service-tile')).not.toBeInTheDocument();
  });
});

describe('v5 Q2 — Favorites and Uncategorized are always-expanded (no toggle)', () => {
  it('renders their headers as static, non-button headers', async () => {
    mockedCategories.mockResolvedValue([cat({ id: 'media', name: 'Media', sortIndex: 0 })]);
    mockedServices.mockResolvedValue([
      svc({ id: 'a', name: 'Plex', categoryId: 'media', categoryName: 'Media', favorite: true }),
      svc({ id: 'b', name: 'Notion' }), // uncategorized
    ]);
    render(<Catalog />);
    await screen.findAllByTestId('service-tile');
    const headers = screen.getAllByTestId('category-header');
    const fav = headers.find((h) => h.textContent === 'Favorites')!;
    const unc = headers.find((h) => h.textContent === 'Uncategorized')!;
    expect(fav.tagName).toBe('H2');
    expect(unc.tagName).toBe('H2');
    expect(fav).not.toHaveAttribute('aria-expanded');
    expect(unc).not.toHaveAttribute('aria-expanded');
    // Only the real category exposes a disclosure button.
    expect(screen.getByRole('button', { expanded: true })).toBe(catHeaderButton('Media'));
  });
});

describe('v5 A9 — disclosure is keyboard + screen-reader operable', () => {
  beforeEach(() => {
    mockedCategories.mockResolvedValue([cat({ id: 'media', name: 'Media', sortIndex: 0 })]);
    mockedServices.mockResolvedValue([
      svc({ id: 'a', name: 'Plex', categoryId: 'media', categoryName: 'Media' }),
    ]);
  });

  it('the header is a button with aria-expanded controlling the tile region', async () => {
    render(<Catalog />);
    await screen.findByTestId('service-tile');
    const btn = catHeaderButton('Media');
    expect(btn.tagName).toBe('BUTTON');
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    const controls = btn.getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    // The controlled region exists and holds the tiles while expanded.
    expect(document.getElementById(controls!)).toContainElement(screen.getByTestId('service-tile'));
  });

  it('toggles on Enter and Space (native button keyboard semantics)', async () => {
    const user = userEvent.setup();
    render(<Catalog />);
    await screen.findByTestId('service-tile');
    catHeaderButton('Media').focus();
    await user.keyboard('{Enter}');
    expect(catHeaderButton('Media')).toHaveAttribute('aria-expanded', 'false');
    await user.keyboard(' ');
    expect(catHeaderButton('Media')).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('v5 A10 — toggle is optimistic with rollback on a failed PUT', () => {
  it('reverts the section to its prior state and shows an inline error', async () => {
    const user = userEvent.setup();
    mockedSetCollapsed.mockResolvedValue(false); // PUT fails
    mockedCategories.mockResolvedValue([cat({ id: 'media', name: 'Media', sortIndex: 0 })]);
    mockedServices.mockResolvedValue([
      svc({ id: 'a', name: 'Plex', categoryId: 'media', categoryName: 'Media' }),
    ]);
    render(<Catalog />);
    await screen.findByTestId('service-tile');

    await user.click(catHeaderButton('Media'));
    // Rolled back to expanded, with an inline "couldn't save".
    await waitFor(() =>
      expect(catHeaderButton('Media')).toHaveAttribute('aria-expanded', 'true'),
    );
    expect(within(catSection('Media')).getByTestId('service-tile')).toBeInTheDocument();
    expect(screen.getByTestId('collapse-error')).toBeInTheDocument();
  });
});

describe('v5 A11/A12 — new category expands by default; no categories → no disclosure', () => {
  it('a category absent from the collapsed set renders expanded', async () => {
    mockedGetCollapsed.mockResolvedValue(['media']); // only Media folded
    mockedCategories.mockResolvedValue([
      cat({ id: 'media', name: 'Media', sortIndex: 0 }),
      cat({ id: 'fresh', name: 'Fresh', sortIndex: 1 }), // brand-new, not in the set
    ]);
    mockedServices.mockResolvedValue([svc({ id: 'a', name: 'Plex', categoryId: 'fresh', categoryName: 'Fresh' })]);
    render(<Catalog />);
    await waitFor(() => expect(catHeaderButton('Fresh')).toHaveAttribute('aria-expanded', 'true'));
    expect(within(sectionByHeader('Fresh')).getByTestId('service-tile')).toBeInTheDocument();
  });

  it('renders no disclosure controls in flat (no-category) mode', async () => {
    mockedCategories.mockResolvedValue([]);
    mockedServices.mockResolvedValue([svc({ id: 'a', name: 'Plex' })]);
    render(<Catalog />);
    await screen.findByTestId('service-tile');
    expect(screen.queryByTestId('category-header')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { expanded: true })).not.toBeInTheDocument();
  });
});
