import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CommandLauncher from './CommandLauncher';
import { LauncherProvider } from './launcher';
import type { Service } from './api';

// v8 §4–6 — the dialog + keyboard shell. CLIENT-SIDE ONLY: the launcher filters
// the Service[] it is handed (no fetch). These component tests drive A1-A3, A5,
// A8-A12 (specs/v8-command-launcher.md §11); the on-screen trigger, full a11y
// wiring and responsive polish land in slice 3.

function svc(over: Partial<Service> = {}): Service {
  return {
    id: over.id ?? over.name ?? 's',
    slug: 'slug',
    name: 'Service',
    description: '',
    url: `https://${over.id ?? 'svc'}.example.com`,
    icon: 'x',
    status: 'UP',
    favorite: false,
    iconLight: false,
    iconDark: false,
    categoryId: null,
    categoryName: null,
    ...over,
  };
}

const CATALOG: Service[] = [
  svc({ id: 'jellyfin', name: 'Jellyfin', categoryName: 'Media', url: 'https://jf.example.com' }),
  svc({ id: 'jellyseerr', name: 'Jellyseerr', categoryName: 'Media' }),
  svc({ id: 'gitea', name: 'Gitea', categoryName: 'Dev' }),
  svc({ id: 'grafana', name: 'Grafana', categoryName: 'Observability' }),
];

function setup(services: Service[] = CATALOG) {
  return render(
    <LauncherProvider>
      <button data-testid="outside-button">prior focus</button>
      <input data-testid="outside-field" aria-label="a field" />
      <CommandLauncher services={services} />
    </LauncherProvider>,
  );
}

const openWithMeta = () => fireEvent.keyDown(document, { key: 'k', metaKey: true });
const queryDialog = () => screen.queryByTestId('launcher-modal');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('A1 — ⌘K / Ctrl+K open the launcher with the input focused', () => {
  it('opens on ⌘K (metaKey)', () => {
    setup();
    expect(queryDialog()).toBeNull();
    openWithMeta();
    const modal = screen.getByTestId('launcher-modal');
    expect(modal).toHaveAttribute('role', 'dialog');
    expect(document.activeElement).toBe(screen.getByTestId('launcher-input'));
  });

  it('opens on Ctrl+K (ctrlKey)', () => {
    setup();
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    expect(screen.getByTestId('launcher-modal')).toHaveAttribute('role', 'dialog');
    expect(document.activeElement).toBe(screen.getByTestId('launcher-input'));
  });

  it('a second ⌘K while open is a no-op (does not toggle closed)', () => {
    setup();
    openWithMeta();
    openWithMeta();
    expect(screen.getByTestId('launcher-modal')).toBeInTheDocument();
  });
});

describe('A2 — `/` opens on the page body but not while typing in a field', () => {
  it('opens when focus is on the body', () => {
    setup();
    fireEvent.keyDown(document.body, { key: '/' });
    expect(screen.getByTestId('launcher-modal')).toBeInTheDocument();
  });

  it('does NOT open when focus is in a text field — types a slash instead', async () => {
    setup();
    const field = screen.getByTestId('outside-field') as HTMLInputElement;
    field.focus();
    await userEvent.keyboard('/');
    expect(queryDialog()).toBeNull();
    expect(field.value).toBe('/');
  });
});

describe('A3 — Esc and scrim-click close, restoring prior focus', () => {
  it('Esc closes and restores focus to the element focused before opening', () => {
    setup();
    const prior = screen.getByTestId('outside-button');
    prior.focus();
    openWithMeta();
    expect(screen.getByTestId('launcher-modal')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByTestId('launcher-input'), { key: 'Escape' });
    expect(queryDialog()).toBeNull();
    expect(document.activeElement).toBe(prior);
  });

  it('clicking the overlay (outside the panel) closes it', () => {
    setup();
    openWithMeta();
    fireEvent.click(screen.getByTestId('launcher-overlay'));
    expect(queryDialog()).toBeNull();
  });

  it('clicking inside the panel does NOT close it', () => {
    setup();
    openWithMeta();
    fireEvent.click(screen.getByTestId('launcher-input'));
    expect(screen.getByTestId('launcher-modal')).toBeInTheDocument();
  });
});

describe('A5 — typing filters to fuzzy matches; each row shows icon + name + category', () => {
  it('filters to Jellyfin for "jelly" and renders its icon, name and category', () => {
    setup();
    openWithMeta();
    fireEvent.change(screen.getByTestId('launcher-input'), { target: { value: 'jelly' } });
    const rows = screen.getAllByTestId('launcher-result');
    const names = rows.map((r) => within(r).getByTestId('launcher-result-name').textContent);
    expect(names).toContain('Jellyfin');
    const jelly = rows.find((r) => within(r).getByTestId('launcher-result-name').textContent === 'Jellyfin')!;
    // The icon is decorative (alt="") since the name text sits beside it — same
    // as the tile; assert it by its testid hook rather than the img role.
    const icon = within(jelly).getByTestId('launcher-result-icon');
    expect(icon.tagName).toBe('IMG');
    expect(icon).toHaveAttribute('src');
    expect(within(jelly).getByTestId('launcher-result-category').textContent).toMatch(/media/i);
    // gitea is not a subsequence of the query → excluded
    expect(names).not.toContain('Gitea');
  });
});

describe('A7/A8 — first row selected by default; arrows move + wrap; activedescendant tracks', () => {
  it('selects the first result (rank 0) by default after typing', () => {
    setup();
    openWithMeta();
    fireEvent.change(screen.getByTestId('launcher-input'), { target: { value: 'j' } });
    const rows = screen.getAllByTestId('launcher-result');
    const first = rows.find((r) => r.getAttribute('data-rank') === '0')!;
    expect(first).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('launcher-input')).toHaveAttribute(
      'aria-activedescendant',
      first.id,
    );
  });

  it('ArrowDown moves selection to index 1 and updates aria-activedescendant', () => {
    setup();
    openWithMeta();
    const input = screen.getByTestId('launcher-input');
    fireEvent.change(input, { target: { value: 'j' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const rows = screen.getAllByTestId('launcher-result');
    const second = rows.find((r) => r.getAttribute('data-rank') === '1')!;
    expect(second).toHaveAttribute('data-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', second.id);
  });

  it('ArrowUp from the first result wraps to the last', () => {
    setup();
    openWithMeta();
    const input = screen.getByTestId('launcher-input');
    fireEvent.change(input, { target: { value: 'j' } });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    const rows = screen.getAllByTestId('launcher-result');
    const last = rows[rows.length - 1];
    expect(last).toHaveAttribute('data-selected', 'true');
  });
});

describe('A9 — Enter opens the selected service in a new tab and closes the launcher', () => {
  it('renders rows as <a target=_blank rel="noreferrer noopener">', () => {
    setup();
    openWithMeta();
    fireEvent.change(screen.getByTestId('launcher-input'), { target: { value: 'jelly' } });
    const row = screen.getAllByTestId('launcher-result')[0];
    expect(row.tagName).toBe('A');
    expect(row).toHaveAttribute('target', '_blank');
    expect(row).toHaveAttribute('rel', 'noreferrer noopener');
  });

  it('Enter activates the selected anchor with its url and closes the launcher', () => {
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    setup();
    openWithMeta();
    const input = screen.getByTestId('launcher-input');
    fireEvent.change(input, { target: { value: 'jelly' } });
    const selected = screen.getAllByTestId('launcher-result')[0] as HTMLAnchorElement;
    expect(selected).toHaveAttribute('href', 'https://jf.example.com');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(clickSpy).toHaveBeenCalled();
    expect(queryDialog()).toBeNull();
  });
});

describe('A10 — empty-query default: Favorites first, then All services', () => {
  it('shows FAVORITES then ALL SERVICES with favorites not repeated; first row selected', () => {
    const withFavs: Service[] = [
      svc({ id: 'gitea', name: 'Gitea', favorite: true, categoryName: 'Dev' }),
      svc({ id: 'jellyfin', name: 'Jellyfin', favorite: false, categoryName: 'Media' }),
      svc({ id: 'grafana', name: 'Grafana', favorite: true, categoryName: 'Obs' }),
    ];
    setup(withFavs);
    openWithMeta();
    expect(screen.getByText(/favorites/i)).toBeInTheDocument();
    expect(screen.getByText(/all services/i)).toBeInTheDocument();
    const rows = screen.getAllByTestId('launcher-result');
    // favorites (gitea, grafana) come before the non-favorite (jellyfin)
    const order = rows.map((r) => r.getAttribute('data-service-id'));
    expect(order).toEqual(['gitea', 'grafana', 'jellyfin']);
    // a favorite is not repeated in the ALL section → 3 rows total, not 5
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveAttribute('data-selected', 'true');
  });

  it('with no favorites shows only ALL SERVICES, first row selected', () => {
    setup(CATALOG); // none favorited
    openWithMeta();
    expect(screen.queryByText(/^favorites$/i)).toBeNull();
    expect(screen.getByText(/all services/i)).toBeInTheDocument();
    const rows = screen.getAllByTestId('launcher-result');
    expect(rows[0]).toHaveAttribute('data-selected', 'true');
  });
});

describe('A11 — no-match query shows the empty state; Enter is a no-op', () => {
  it('shows launcher-no-results, no rows, and Enter does not navigate or close', () => {
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    setup();
    openWithMeta();
    const input = screen.getByTestId('launcher-input');
    fireEvent.change(input, { target: { value: 'zzzzz' } });
    expect(screen.getByTestId('launcher-no-results')).toBeInTheDocument();
    expect(screen.queryAllByTestId('launcher-result')).toHaveLength(0);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(clickSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('launcher-modal')).toBeInTheDocument();
  });
});

describe('A12 — the launcher makes no network request', () => {
  it('does not call fetch on open, type, arrow, or enter', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]'));
    setup();
    openWithMeta();
    const input = screen.getByTestId('launcher-input');
    fireEvent.change(input, { target: { value: 'jelly' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('reopen is always empty (D5)', () => {
  it('clears the query on close so the next open starts blank', () => {
    setup();
    openWithMeta();
    fireEvent.change(screen.getByTestId('launcher-input'), { target: { value: 'jelly' } });
    fireEvent.keyDown(screen.getByTestId('launcher-input'), { key: 'Escape' });
    openWithMeta();
    expect((screen.getByTestId('launcher-input') as HTMLInputElement).value).toBe('');
  });
});

beforeEach(() => {
  // jsdom lacks scrollIntoView; the launcher calls it to keep the selection in
  // view (§6.4). Provide a no-op so those calls don't throw under test.
  Element.prototype.scrollIntoView = vi.fn();
});
