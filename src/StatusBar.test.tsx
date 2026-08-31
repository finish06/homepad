import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StatusBar from './StatusBar';
import { useServicesContext } from './services';
import { CONTENT_WIDTH } from './layout';
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

// v15 — StatusBar is now the health summary panel (chips restyled as stacked
// number+label quick-peek buttons; loading/empty/unknown-only now render a panel
// rather than nothing). The count/quick-peek contract below is preserved.
describe('StatusBar chips (health panel)', () => {
  // v15: null items → the loading panel (was: nothing).
  it('renders the loading panel while items is null', () => {
    setItems(null);
    render(<StatusBar />);
    expect(screen.getByTestId('health-led')).toHaveAttribute('data-variant', 'loading');
    expect(screen.getByTestId('health-headline')).toHaveTextContent('Checking services');
  });

  // #386 — the health card edges must line up with the app grid below. The
  // wrapper must NOT add its own horizontal inset (a stray `px-3` made the card
  // 12px narrower per side than the header + grid, which both use CONTENT_WIDTH
  // directly). Named for the observed symptom: edges don't line up with the grid.
  it('health card wrapper adds no horizontal inset beyond the shared frame (#386)', () => {
    setItems([svc('UP', 'u1')]);
    render(<StatusBar />);

    const wrapper = screen.getByTestId('status-bar');
    // No horizontal-padding utility on the wrapper — its only inset is the
    // shared CONTENT_WIDTH frame, identical to the header + app grid.
    const horizPad = [...wrapper.classList].filter((c) => /^(px|pl|pr)-/.test(c));
    expect(horizPad).toEqual([]);
    // Structural spacing classes are preserved.
    expect(wrapper).toHaveClass('relative');
    expect(wrapper).toHaveClass('pt-3');
    // The inner content frame is the shared CONTENT_WIDTH (single source of inset).
    for (const cls of CONTENT_WIDTH.split(' ')) {
      expect(screen.getByTestId('status-bar-content')).toHaveClass(cls);
    }
  });

  // AC-002/AC-003/AC-004/AC-005: mixed list → correct chip counts, UNKNOWN excluded.
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
    const upChip = screen.getByTestId('status-bar-up');
    expect(upChip).toHaveTextContent('3');
    expect(upChip).toHaveTextContent('UP');
    // 2 DOWN + 1 DEGRADED = 3
    const downChip = screen.getByTestId('status-bar-down');
    expect(downChip).toHaveTextContent('3');
    expect(downChip).toHaveTextContent('DOWN');
    const nmChip = screen.getByTestId('status-bar-not-monitored');
    expect(nmChip).toHaveTextContent('2');
    expect(nmChip).toHaveTextContent('not monitored');
  });

  // AC-002: all UP → only the UP chip, no zero-count placeholders.
  it('renders only the UP chip when every service is UP', () => {
    setItems([svc('UP', 'u1'), svc('UP', 'u2')]);
    render(<StatusBar />);

    expect(screen.getByTestId('status-bar-up')).toHaveTextContent('2');
    expect(screen.queryByTestId('status-bar-down')).toBeNull();
    expect(screen.queryByTestId('status-bar-not-monitored')).toBeNull();
  });

  // v15/AC-V15-018: UNKNOWN-only → operational panel with no chips (was: nothing).
  it('shows an operational panel with no chips when only UNKNOWN', () => {
    setItems([svc('UNKNOWN', 'k1'), svc('UNKNOWN', 'k2')]);
    render(<StatusBar />);
    expect(screen.getByTestId('health-led')).toHaveAttribute('data-variant', 'operational');
    expect(screen.queryByTestId('status-bar-up')).toBeNull();
    expect(screen.queryByTestId('status-bar-down')).toBeNull();
    expect(screen.queryByTestId('status-bar-not-monitored')).toBeNull();
  });

  // v15/AC-V15-015: zero services → the empty panel (was: nothing).
  it('renders the empty panel for an empty items array', () => {
    setItems([]);
    render(<StatusBar />);
    expect(screen.getByTestId('health-headline')).toHaveTextContent('No services yet');
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
    expect(screen.getByTestId('status-bar-up')).toHaveTextContent('1');
    // 1 DOWN + 1 DEGRADED = 2
    expect(screen.getByTestId('status-bar-down')).toHaveTextContent('2');
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
