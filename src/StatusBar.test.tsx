import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StatusBar from './StatusBar';
import { useServicesContext } from './services';
import type { Service, ServiceStatus } from './api';

// StatusBar derives purely from useServicesContext(). Mock the context hook so
// each test injects an exact items array (no fetch, no provider plumbing).
vi.mock('./services', () => ({
  useServicesContext: vi.fn(),
}));

const mockedCtx = vi.mocked(useServicesContext);

function svc(status: ServiceStatus, id: string): Service {
  return {
    id,
    slug: id,
    name: id,
    description: '',
    url: 'https://example.com',
    icon: id,
    status,
    favorite: false,
    iconLight: false,
    iconDark: false,
    categoryId: null,
    categoryName: null,
  };
}

function setItems(items: Service[] | null) {
  mockedCtx.mockReturnValue(
    items === null
      ? { items: null, setItems: vi.fn(), lastUpdatedAt: null, recentChanges: [], clearRecentChanges: vi.fn() }
      : { items, setItems: vi.fn(), lastUpdatedAt: null, recentChanges: [], clearRecentChanges: vi.fn() },
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('StatusBar', () => {
  // AC-006: null items (still loading) → nothing rendered.
  it('renders nothing while items is null', () => {
    setItems(null);
    const { container } = render(<StatusBar />);
    expect(screen.queryByTestId('status-bar')).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  // AC-002/AC-003/AC-004/AC-005: mixed list → correct counts, UNKNOWN excluded.
  it('shows correct counts for a mixed list and excludes UNKNOWN', () => {
    setItems([
      svc('UP', 'u1'),
      svc('UP', 'u2'),
      svc('UP', 'u3'),
      svc('DOWN', 'd1'),
      svc('DOWN', 'd2'),
      svc('DEGRADED', 'g1'),
      svc('UNKNOWN', 'k1'),
      svc('NOT_MONITORED', 'n1'),
      svc('NOT_MONITORED', 'n2'),
    ]);
    render(<StatusBar />);

    expect(screen.getByTestId('status-bar')).toHaveAttribute('role', 'status');
    expect(screen.getByTestId('status-bar')).toHaveAttribute('aria-label', 'Service status summary');
    expect(screen.getByTestId('status-bar-up')).toHaveTextContent('3 UP');
    // 2 DOWN + 1 DEGRADED = 3
    expect(screen.getByTestId('status-bar-down')).toHaveTextContent('3 DOWN');
    expect(screen.getByTestId('status-bar-not-monitored')).toHaveTextContent('2 not monitored');
  });

  // AC-002: all UP → only the UP segment, no zero-count placeholders.
  it('renders only the UP segment when every service is UP', () => {
    setItems([svc('UP', 'u1'), svc('UP', 'u2')]);
    render(<StatusBar />);

    expect(screen.getByTestId('status-bar-up')).toHaveTextContent('2 UP');
    expect(screen.queryByTestId('status-bar-down')).toBeNull();
    expect(screen.queryByTestId('status-bar-not-monitored')).toBeNull();
  });

  // AC-003/AC-004/AC-005: UNKNOWN-only services produce no segments at all.
  it('renders nothing when the only services are UNKNOWN', () => {
    setItems([svc('UNKNOWN', 'k1'), svc('UNKNOWN', 'k2')]);
    const { container } = render(<StatusBar />);
    expect(screen.queryByTestId('status-bar')).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  // AC-006 (empty): zero services → nothing rendered.
  it('renders nothing for an empty items array', () => {
    setItems([]);
    const { container } = render(<StatusBar />);
    expect(screen.queryByTestId('status-bar')).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });
});

// ---------------------------------------------------------------------------
// v16 — Status Bar Quick-Peek. Each non-empty chip is a <button> that opens a
// popover listing the matching services with links. (AC-001..AC-015)
// ---------------------------------------------------------------------------

// Like svc() but lets a test set a distinct display name + url so popover
// contents (alphabetical order, anchor hrefs) are observable.
function named(status: ServiceStatus, id: string, name: string, url: string): Service {
  return { ...svc(status, id), name, url };
}

describe('StatusBar quick-peek popover', () => {
  // AC-001: a non-empty chip is a real <button>, not a <span>.
  it('renders each status chip as a button (A16-1)', () => {
    setItems([svc('UP', 'u1'), svc('DOWN', 'd1'), svc('NOT_MONITORED', 'n1')]);
    render(<StatusBar />);
    expect(screen.getByTestId('status-bar-up').tagName).toBe('BUTTON');
    expect(screen.getByTestId('status-bar-down').tagName).toBe('BUTTON');
    expect(screen.getByTestId('status-bar-not-monitored').tagName).toBe('BUTTON');
  });

  // AC-014: existing testids and summary text survive the button rewrite.
  it('preserves status-bar testids and counts (A16-2)', () => {
    setItems([svc('UP', 'u1'), svc('DOWN', 'd1'), svc('DEGRADED', 'g1')]);
    render(<StatusBar />);
    expect(screen.getByTestId('status-bar')).toBeInTheDocument();
    expect(screen.getByTestId('status-bar-up')).toHaveTextContent('1 UP');
    expect(screen.getByTestId('status-bar-down')).toHaveTextContent('2 DOWN');
  });

  // AC-002/AC-004/AC-005/AC-015a: clicking DOWN opens a popover listing the
  // DOWN+DEGRADED services (alphabetical) as new-tab anchors to their url.
  it('opens a popover of DOWN/DEGRADED services on DOWN-chip click (A16-3)', async () => {
    const user = userEvent.setup();
    setItems([
      named('UP', 'u1', 'Alpha', 'https://alpha.test'),
      named('DEGRADED', 'g1', 'Zulu', 'https://zulu.test'),
      named('DOWN', 'd1', 'Jellyfin', 'https://jelly.test'),
    ]);
    render(<StatusBar />);

    expect(screen.queryByTestId('status-peek-popover')).toBeNull();
    await user.click(screen.getByTestId('status-bar-down'));

    const pop = screen.getByTestId('status-peek-popover');
    expect(pop).toHaveAttribute('role', 'dialog');
    const links = within(pop).getAllByRole('link');
    // Only the two DOWN/DEGRADED services, sorted by name: Jellyfin, Zulu.
    expect(links).toHaveLength(2);
    expect(links.map((a) => a.textContent)).toEqual(['Jellyfin', 'Zulu']);
    expect(links[0]).toHaveAttribute('href', 'https://jelly.test');
    expect(links[0]).toHaveAttribute('target', '_blank');
    expect(links[0]).toHaveAttribute('rel', 'noreferrer noopener');
    // UP service must not leak into the DOWN popover.
    expect(within(pop).queryByText('Alpha')).toBeNull();
  });

  // AC-011: DOWN and DEGRADED both render a red dot in the popover (not amber).
  it('renders the DEGRADED service dot red like DOWN (A16-9)', async () => {
    const user = userEvent.setup();
    setItems([
      named('DOWN', 'd1', 'Jellyfin', 'https://jelly.test'),
      named('DEGRADED', 'g1', 'Zulu', 'https://zulu.test'),
    ]);
    render(<StatusBar />);

    await user.click(screen.getByTestId('status-bar-down'));
    const pop = screen.getByTestId('status-peek-popover');
    const links = within(pop).getAllByRole('link');
    const dotOf = (a: HTMLElement) => a.querySelector('span[aria-hidden]') as HTMLElement;

    // Jellyfin (DOWN) and Zulu (DEGRADED) must both be red.
    for (const link of links) {
      const dot = dotOf(link);
      expect(dot.className).toContain('bg-red-500');
      expect(dot.className).not.toContain('bg-amber-400');
    }
  });

  // AC-002: clicking the same open chip again closes the popover.
  it('toggles closed when the open chip is re-clicked (A16-4)', async () => {
    const user = userEvent.setup();
    setItems([svc('DOWN', 'd1'), svc('DOWN', 'd2')]);
    render(<StatusBar />);
    const downChip = screen.getByTestId('status-bar-down');

    await user.click(downChip);
    expect(screen.getByTestId('status-peek-popover')).toBeInTheDocument();
    await user.click(downChip);
    expect(screen.queryByTestId('status-peek-popover')).toBeNull();
  });

  // AC-003/AC-015d: clicking a different chip switches the popover (only one open).
  it('switches the popover when a different chip is clicked (A16-5)', async () => {
    const user = userEvent.setup();
    setItems([
      named('UP', 'u1', 'Alpha', 'https://alpha.test'),
      named('NOT_MONITORED', 'n1', 'Router', 'https://router.test'),
    ]);
    render(<StatusBar />);

    await user.click(screen.getByTestId('status-bar-up'));
    let pop = screen.getByTestId('status-peek-popover');
    expect(within(pop).getByText('Alpha')).toBeInTheDocument();

    await user.click(screen.getByTestId('status-bar-not-monitored'));
    // Still exactly one popover, now showing the not-monitored service.
    expect(screen.getAllByTestId('status-peek-popover')).toHaveLength(1);
    pop = screen.getByTestId('status-peek-popover');
    expect(within(pop).getByText('Router')).toBeInTheDocument();
    expect(within(pop).queryByText('Alpha')).toBeNull();
  });

  // AC-008/AC-015b: a mousedown outside the popover closes it.
  it('closes on outside mousedown (A16-6)', async () => {
    const user = userEvent.setup();
    setItems([svc('DOWN', 'd1')]);
    render(<StatusBar />);
    await user.click(screen.getByTestId('status-bar-down'));
    expect(screen.getByTestId('status-peek-popover')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('status-peek-popover')).toBeNull();
  });

  // AC-009/AC-015c: Escape closes and returns focus to the triggering chip.
  it('closes on Escape and restores focus to the chip (A16-7)', async () => {
    const user = userEvent.setup();
    setItems([svc('DOWN', 'd1')]);
    render(<StatusBar />);
    const downChip = screen.getByTestId('status-bar-down');
    await user.click(downChip);
    expect(screen.getByTestId('status-peek-popover')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('status-peek-popover')).toBeNull();
    expect(downChip).toHaveFocus();
  });

  // AC-013: chip button carries an action-describing aria-label.
  it('gives each chip button an action aria-label (A16-8)', () => {
    setItems([svc('DOWN', 'd1'), svc('DOWN', 'd2')]);
    render(<StatusBar />);
    expect(screen.getByTestId('status-bar-down')).toHaveAttribute(
      'aria-label',
      'Show 2 services that are DOWN',
    );
  });
});
