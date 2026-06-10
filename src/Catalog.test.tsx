import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Catalog from './Catalog';
import { services, setFavorite, setLayout, type Service, type ServiceStatus } from './api';

vi.mock('./api', () => ({
  services: vi.fn(),
  setFavorite: vi.fn(),
  setLayout: vi.fn(),
}));

const mockedServices = vi.mocked(services);
const mockedSetFavorite = vi.mocked(setFavorite);
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
    ...over,
  };
}

beforeEach(() => {
  mockedServices.mockResolvedValue([svc()]);
  mockedSetFavorite.mockResolvedValue(true);
  mockedSetLayout.mockResolvedValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('A2 — catalog tiles render', () => {
  it('renders name, description, link-out URL and an icon for each service', async () => {
    mockedServices.mockResolvedValue([
      svc({ id: 'a', name: 'Plex', description: 'Media', url: 'https://plex.x', icon: 'plex' }),
      svc({ id: 'b', name: 'Grafana', description: 'Dashboards', url: 'https://graf.x', icon: 'grafana' }),
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
    expect(within(plex).getByTestId('service-tile-icon')).toHaveAttribute(
      'src',
      'https://cdn.jsdelivr.net/gh/selfhst/icons/svg/plex.svg',
    );
  });

  it('falls back to a cog icon when a service has no icon', async () => {
    mockedServices.mockResolvedValue([svc({ icon: '' })]);
    render(<Catalog />);
    const icon = await screen.findByTestId('service-tile-icon');
    expect(icon).toHaveAttribute('src', 'https://cdn.jsdelivr.net/gh/selfhst/icons/svg/cog.svg');
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
