// v13 — Live Status Auto-Refresh + "Last Updated" indicator.
// Behaviour-level tests driven through the real ServicesProvider / AppHeader /
// Catalog so each failure is "the feature is missing", not a wiring typo. Global
// fetch is stubbed (same idiom as api.test) and time is faked so the polling
// cadence is deterministic.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import AppHeader, { formatUpdatedAgo } from './AppHeader';
import Catalog from './Catalog';
import { LauncherProvider } from './launcher';
import { ServicesProvider } from './services';
import type { Service, User } from './api';

const USER: User = { id: 'u1', email: 'nani@ohana.io', role: 'user', themePref: 'system' };

function svc(id: string, status: Service['status']): Service {
  return {
    id,
    slug: id,
    name: `App ${id}`,
    description: '',
    url: `https://${id}.test`,
    icon: '',
    status,
    favorite: false,
    iconLight: false,
    iconDark: false,
  };
}

// A mutable payload the fetch stub serves on every /api/services call, plus the
// status it answers with, so a test can flip the upstream data/HTTP code between
// poll cycles. categories/collapsed-categories answer empty so Catalog renders
// the flat grid.
let servicesPayload: Service[];
let servicesStatus: number;

function installFetch() {
  servicesPayload = [svc('a', 'UP'), svc('b', 'DOWN')];
  servicesStatus = 200;
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/services')) {
      return new Response(JSON.stringify({ services: servicesPayload }), {
        status: servicesStatus,
      });
    }
    if (url.includes('/api/categories')) return new Response(JSON.stringify({ categories: [] }), { status: 200 });
    if (url.includes('/collapsed-categories')) return new Response(JSON.stringify({ collapsed: [] }), { status: 200 });
    return new Response('{}', { status: 200 });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function servicesCalls(fn: ReturnType<typeof vi.fn>): number {
  return fn.mock.calls.filter((c) => String(c[0]).includes('/api/services')).length;
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.useFakeTimers();
  setVisibility('visible');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AC-001 — auto re-poll on interval', () => {
  it('re-issues GET /api/services roughly every 60s after the initial load', async () => {
    const fn = installFetch();
    render(
      <ServicesProvider>
        <div />
      </ServicesProvider>,
    );
    // initial load resolves
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(servicesCalls(fn)).toBe(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(servicesCalls(fn)).toBe(2);

    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(servicesCalls(fn)).toBe(3);
  });
});

describe('AC-002 — suspend while hidden, resume on visible', () => {
  it('does not poll while the tab is hidden and re-polls within 5s of returning', async () => {
    const fn = installFetch();
    render(
      <ServicesProvider>
        <div />
      </ServicesProvider>,
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(servicesCalls(fn)).toBe(1);

    setVisibility('hidden');
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    // suspended — still just the initial load
    expect(servicesCalls(fn)).toBe(1);

    await act(async () => { setVisibility('visible'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(servicesCalls(fn)).toBeGreaterThanOrEqual(2);
  });
});

describe('AC-003 — status badges reflect the latest value without reload', () => {
  it('updates a tile status-badge after a refresh cycle', async () => {
    installFetch();
    render(
      <ServicesProvider>
        <Catalog />
      </ServicesProvider>,
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const badgeStatus = (href: string) =>
      document
        .querySelector(`[href="${href}"]`)
        ?.closest('[data-testid="service-tile"]')
        ?.querySelector('[data-testid="status-badge"]')
        ?.getAttribute('data-status');
    // tile b starts DOWN
    expect(badgeStatus('https://b.test')).toBe('DOWN');

    // upstream recovers b → UP
    servicesPayload = [svc('a', 'UP'), svc('b', 'UP')];
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });

    expect(badgeStatus('https://b.test')).toBe('UP');
  });
});

describe('AC-004 / AC-010 — "Updated X ago" indicator in the header', () => {
  it('renders status-last-updated after load and ticks the elapsed label', async () => {
    installFetch();
    render(
      <LauncherProvider>
        <ServicesProvider>
          <AppHeader
            user={USER}
            onToggleEdit={() => {}}
            onOpenAdminSettings={() => {}}
            onGoToDashboard={() => {}}
            onLogout={() => {}}
            alertCount={0}
            onAlertClick={() => {}}
          />
        </ServicesProvider>
      </LauncherProvider>,
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByTestId('status-last-updated').textContent).toMatch(/just now/i);

    // Ticks up in real time toward the next poll (which lands at 60s and would
    // reset the label to "just now" — correct freshness semantics, AC-008).
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(screen.getByTestId('status-last-updated').textContent).toMatch(/10s ago/i);

    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(screen.getByTestId('status-last-updated').textContent).toMatch(/30s ago/i);
  });
});

describe('AC-005 — elapsed label format & cap', () => {
  it('shows seconds, then whole minutes, then caps at 5m+', () => {
    expect(formatUpdatedAgo(0)).toBe('just now');
    expect(formatUpdatedAgo(3)).toBe('just now');
    expect(formatUpdatedAgo(10)).toBe('10s ago');
    expect(formatUpdatedAgo(59)).toBe('59s ago');
    expect(formatUpdatedAgo(60)).toBe('1m ago');
    expect(formatUpdatedAgo(125)).toBe('2m ago');
    expect(formatUpdatedAgo(299)).toBe('4m ago');
    expect(formatUpdatedAgo(300)).toBe('5m+ ago');
    expect(formatUpdatedAgo(99999)).toBe('5m+ ago');
    expect(formatUpdatedAgo(-5)).toBe('just now');
  });
});

describe('AC-006 / AC-007 — pulse on status change only', () => {
  it('pulses a tile whose status changed and leaves unchanged tiles alone', async () => {
    installFetch();
    render(
      <ServicesProvider>
        <Catalog />
      </ServicesProvider>,
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    // b: DOWN → UP (changes), a: UP → UP (unchanged)
    servicesPayload = [svc('a', 'UP'), svc('b', 'UP')];
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });

    const tile = (href: string) =>
      document.querySelector(`[href="${href}"]`)?.closest('[data-testid="service-tile"]');
    const badge = (href: string) => tile(href)?.querySelector('[data-testid="status-badge"]');

    expect(badge('https://b.test')?.getAttribute('data-pulsing')).toBe('true');
    expect(badge('https://a.test')?.getAttribute('data-pulsing')).toBe('false');
  });

  it('does not pulse when prefers-reduced-motion is set', async () => {
    installFetch();
    vi.stubGlobal(
      'matchMedia',
      vi.fn((q: string) => ({
        matches: q.includes('reduce'),
        media: q,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
        onchange: null,
      })),
    );
    render(
      <ServicesProvider>
        <Catalog />
      </ServicesProvider>,
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    servicesPayload = [svc('a', 'UP'), svc('b', 'UP')];
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });

    const badgeB = document
      .querySelector('[href="https://b.test"]')
      ?.closest('[data-testid="service-tile"]')
      ?.querySelector('[data-testid="status-badge"]');
    // status updated...
    expect(badgeB?.getAttribute('data-status')).toBe('UP');
    // ...but no pulse
    expect(badgeB?.getAttribute('data-pulsing')).toBe('false');
  });
});

describe('AC-011 — stop polling on 401', () => {
  it('stops re-polling once a refresh returns 401', async () => {
    const fn = installFetch();
    render(
      <ServicesProvider>
        <div />
      </ServicesProvider>,
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(servicesCalls(fn)).toBe(1);

    servicesStatus = 401;
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    const afterUnauthorized = servicesCalls(fn);
    expect(afterUnauthorized).toBe(2); // the 401 poll happened

    servicesStatus = 200;
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); });
    expect(servicesCalls(fn)).toBe(2); // ...and no polls after it
  });
});

describe('AC-008 — failed refresh is silently ignored', () => {
  it('keeps the last good data when a poll returns non-200', async () => {
    installFetch();
    render(
      <ServicesProvider>
        <Catalog />
      </ServicesProvider>,
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const statusOfB = () =>
      document
        .querySelector('[href="https://b.test"]')
        ?.closest('[data-testid="service-tile"]')
        ?.querySelector('[data-testid="status-badge"]')
        ?.getAttribute('data-status');
    expect(statusOfB()).toBe('DOWN');

    servicesStatus = 500;
    servicesPayload = [];
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });

    // data unchanged — b is still rendered and still DOWN
    expect(statusOfB()).toBe('DOWN');
  });
});
