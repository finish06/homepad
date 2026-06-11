import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Catalog from './Catalog';
import {
  createService,
  deleteIcon,
  deleteService,
  services,
  setFavorite,
  setLayout,
  updateService,
  uploadIcon,
  type Service,
  type ServiceStatus,
} from './api';
import { DEFAULT_ICON, validateIconFile } from './icons';

vi.mock('./api', () => ({
  services: vi.fn(),
  setFavorite: vi.fn(),
  setLayout: vi.fn(),
  uploadIcon: vi.fn(),
  deleteIcon: vi.fn(),
  deleteService: vi.fn(),
  createService: vi.fn(),
  updateService: vi.fn(),
}));

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
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
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

  it('shows an empty-state message when the catalog is empty', async () => {
    mockedServices.mockResolvedValue([]);
    render(<Catalog />);
    expect(await screen.findByText(/no services in the catalog yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId('service-tile')).not.toBeInTheDocument();
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

describe('favorites toggle', () => {
  it('optimistically flips the star and persists via setFavorite', async () => {
    const user = userEvent.setup();
    mockedServices.mockResolvedValue([svc({ id: 'fav-me', favorite: false })]);
    render(<Catalog />);

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
    render(<Catalog />);

    const toggle = await screen.findByTestId('favorite-toggle');
    await user.click(toggle);

    await waitFor(() => expect(toggle).toHaveAttribute('data-favorite', 'false'));
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
    render(<Catalog />);
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
    render(<Catalog />);
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
    render(<Catalog />);
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
    render(<Catalog />);
    const tiles = await screen.findAllByTestId('service-tile');

    expect(within(tiles[0]).getByTestId('move-up')).toBeDisabled();
    expect(within(tiles[0]).getByTestId('move-down')).toBeEnabled();
    expect(within(tiles[1]).getByTestId('move-up')).toBeEnabled();
    expect(within(tiles[1]).getByTestId('move-down')).toBeDisabled();
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

  it('does not show icon controls in view mode (reorder arrows instead)', async () => {
    render(<Catalog isAdmin editMode={false} />);
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
    render(<Catalog isAdmin editMode />);

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
