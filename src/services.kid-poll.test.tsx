import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { KID_POLL_MS, POLL_MS, ServicesProvider, useServicesContext } from './services';
import { servicesWithStatus, type Service } from './api';

// SPEC-household-basics AC-033…AC-035 (#548, plan TASK-205) — the kid shell
// polls every 20 seconds so an allow-list change shows within 30; adults stay
// at v13's 60. A hidden kid dashboard still doesn't poll, and one that becomes
// visible polls at once.

vi.mock('./api', () => ({ servicesWithStatus: vi.fn(), refreshStatus: vi.fn() }));

function svc(id: string): Service {
  return {
    id, slug: id, name: id, description: '', url: `https://${id}.test`, icon: '', status: 'UP',
    favorite: false, iconLight: false, iconDark: false,
  };
}

function Probe() {
  const ctx = useServicesContext();
  return <div data-testid="probe">{(ctx?.items ?? []).map((s) => s.id).join(',')}</div>;
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

const calls = () => vi.mocked(servicesWithStatus).mock.calls.length;
const tick = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  vi.mocked(servicesWithStatus).mockResolvedValue({ status: 200, services: [svc('plex')] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

describe('poll intervals', () => {
  it('the constants: kids 20s, adults 60s', () => {
    expect(KID_POLL_MS).toBe(20_000);
    expect(POLL_MS).toBe(60_000);
  });

  it('AC-033 — with pollMs={KID_POLL_MS} a changed list shows within 30s of the save, no reload', async () => {
    render(
      <ServicesProvider syncMembership pollMs={KID_POLL_MS}>
        <Probe />
      </ServicesProvider>,
    );
    await tick(0);
    expect(screen.getByTestId('probe')).toHaveTextContent('plex');
    // The admin saves just after a poll: the worst case is one full interval.
    await tick(1);
    vi.mocked(servicesWithStatus).mockResolvedValue({ status: 200, services: [svc('plex'), svc('khan')] });
    await tick(KID_POLL_MS);
    expect(screen.getByTestId('probe')).toHaveTextContent('plex,khan');
    expect(KID_POLL_MS).toBeLessThan(30_000);
  });

  it('AC-033 — a kid provider polls every 20s; the default (adult) provider every 60s', async () => {
    const kid = render(
      <ServicesProvider syncMembership pollMs={KID_POLL_MS}>
        <Probe />
      </ServicesProvider>,
    );
    await tick(0);
    expect(calls()).toBe(1);
    await tick(20_000);
    expect(calls()).toBe(2);
    await tick(20_000);
    expect(calls()).toBe(3);
    kid.unmount();
    vi.mocked(servicesWithStatus).mockClear();

    render(
      <ServicesProvider>
        <Probe />
      </ServicesProvider>,
    );
    await tick(0);
    expect(calls()).toBe(1);
    await tick(40_000);
    expect(calls()).toBe(1);
    await tick(20_000);
    expect(calls()).toBe(2);
  });

  it('AC-035 — a hidden kid dashboard does not poll', async () => {
    render(
      <ServicesProvider syncMembership pollMs={KID_POLL_MS}>
        <Probe />
      </ServicesProvider>,
    );
    await tick(0);
    expect(calls()).toBe(1);
    act(() => setVisibility('hidden'));
    await tick(KID_POLL_MS * 5);
    expect(calls()).toBe(1);
  });

  it('AC-034 — becoming visible again polls at once and shows the current list', async () => {
    render(
      <ServicesProvider syncMembership pollMs={KID_POLL_MS}>
        <Probe />
      </ServicesProvider>,
    );
    await tick(0);
    act(() => setVisibility('hidden'));
    await tick(KID_POLL_MS * 3);
    vi.mocked(servicesWithStatus).mockResolvedValue({ status: 200, services: [svc('immich')] });
    act(() => setVisibility('visible'));
    await tick(0);
    expect(calls()).toBe(2);
    expect(screen.getByTestId('probe')).toHaveTextContent('immich');
  });
});
