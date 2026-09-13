// SPEC-v24 §12.3 (OQ-5) — ServicesProvider.refresh(): prod the BACKEND poller via
// POST /api/status/refresh, then reload the list so the freshness counter resets
// on real new evidence. The three outcomes the health panel must distinguish are
// decided HERE, from what the backend said, not guessed from the payload.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ServicesProvider, useServicesContext } from './services';
import { refreshStatus, servicesWithStatus, type Service } from './api';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return { ...actual, servicesWithStatus: vi.fn(), refreshStatus: vi.fn() };
});
const mockedList = vi.mocked(servicesWithStatus);
const mockedRefresh = vi.mocked(refreshStatus);

const one: Service = {
  id: 's1', slug: 's1', name: 'S1', description: '', url: 'https://x', icon: 's1', status: 'UP',
  favorite: false, iconLight: false, iconDark: false, categoryId: null, categoryName: null,
};
const wrapper = ({ children }: { children: ReactNode }) => <ServicesProvider>{children}</ServicesProvider>;

beforeEach(() => {
  mockedList.mockResolvedValue({ status: 200, services: [one] });
});
afterEach(() => vi.clearAllMocks());

async function mount() {
  const hook = renderHook(() => useServicesContext(), { wrapper });
  await act(async () => {}); // initial load settles
  return hook;
}

describe('ServicesProvider.refresh — SPEC-v24 §12.3', () => {
  it('"refreshed": backend re-polled with a NEWER as_of → reloads and resets the freshness counter', async () => {
    const { result } = await mount();
    const before = result.current!.lastUpdatedAt!;
    mockedRefresh.mockResolvedValue({ ok: true, status: 200, asOf: '2026-09-13T12:00:30Z' });
    await new Promise((r) => setTimeout(r, 5));
    let outcome = '';
    await act(async () => {
      outcome = await result.current!.refresh();
    });
    expect(outcome).toBe('refreshed');
    expect(mockedList).toHaveBeenCalledTimes(2);
    expect(result.current!.lastUpdatedAt!).toBeGreaterThan(before);
  });

  it('"unreachable": backend 503 → no reload, counter untouched', async () => {
    const { result } = await mount();
    const before = result.current!.lastUpdatedAt;
    mockedRefresh.mockResolvedValue({ ok: false, status: 503, asOf: '2026-09-13T12:00:00Z' });
    let outcome = '';
    await act(async () => {
      outcome = await result.current!.refresh();
    });
    expect(outcome).toBe('unreachable');
    expect(mockedList).toHaveBeenCalledTimes(1);
    expect(result.current!.lastUpdatedAt).toBe(before);
  });

  it('"unreachable": an older backend without the endpoint (404) reads the same way', async () => {
    const { result } = await mount();
    mockedRefresh.mockResolvedValue({ ok: false, status: 404 });
    let outcome = '';
    await act(async () => {
      outcome = await result.current!.refresh();
    });
    expect(outcome).toBe('unreachable');
    expect(mockedList).toHaveBeenCalledTimes(1);
  });

  it('"still-stale": a second retry whose as_of did not move → no reload, counter untouched (ST5)', async () => {
    const { result } = await mount();
    // First retry: the backend re-polled and reports as_of T. Fresh → reloads.
    mockedRefresh.mockResolvedValue({ ok: true, status: 200, asOf: '2026-09-13T12:00:00Z' });
    await act(async () => {
      await result.current!.refresh();
    });
    expect(mockedList).toHaveBeenCalledTimes(2);
    const before = result.current!.lastUpdatedAt;
    // Second retry: the backend answered again but as_of is STILL T — it had
    // nothing newer. Reloading would reset the age over identical evidence.
    let outcome = '';
    await act(async () => {
      outcome = await result.current!.refresh();
    });
    expect(outcome).toBe('still-stale');
    expect(mockedList).toHaveBeenCalledTimes(2);
    expect(result.current!.lastUpdatedAt).toBe(before);
  });
});
