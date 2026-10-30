import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusBar from './StatusBar';
import { useServicesContext } from '../services';
import type { Service } from '../api';

// SPEC-kid-accounts (TASK-405) — POST /api/status/refresh is kid-forbidden
// (server.go), so a kid's panel must not offer "Retry now": the button would
// only ever 403. canRetry={false} keeps the stale verdict and drops the action.

vi.mock('../services', () => ({ useServicesContext: vi.fn() }));

const UP: Service = {
  id: 'a', slug: 'a', name: 'a', description: '', url: 'https://a.test', icon: '', status: 'UP',
  favorite: false, iconLight: false, iconDark: false, categoryId: null, categoryName: null,
};

function stale() {
  vi.mocked(useServicesContext).mockReturnValue({
    items: [UP],
    setItems: vi.fn(),
    lastUpdatedAt: Date.now() - 16 * 60_000,
    recentChanges: [],
    clearRecentChanges: vi.fn(),
    refresh: vi.fn(async () => 'refreshed' as const),
  });
}

afterEach(() => vi.clearAllMocks());

describe('StatusBar canRetry', () => {
  it('without canRetry the stale verdict stands but "Retry now" is gone', () => {
    stale();
    render(<StatusBar canRetry={false} />);
    expect(screen.getByTestId('health-led')).toHaveAttribute('data-variant', 'stale');
    expect(screen.queryByTestId('health-retry')).toBeNull();
  });

  it('defaults to offering Retry now (AC-018: unchanged for adults)', () => {
    stale();
    render(<StatusBar />);
    expect(screen.getByTestId('health-retry')).toBeInTheDocument();
  });
});
