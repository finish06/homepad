import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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
  mockedCtx.mockReturnValue(items === null ? { items: null, setItems: vi.fn() } : { items, setItems: vi.fn() });
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
