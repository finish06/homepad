import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { ServicesProvider, useServicesContext } from './services';
import { servicesWithStatus, type Service } from './api';

// SPEC-kid-accounts AC-002 / TC-003 — an admin changes a kid's apps from another
// device; the kid's board shows the change on its next poll, within 60s, with
// no reload. The v13 poll merges STATUS only (tile identity and order kept,
// AC-009), so a provider in syncMembership mode also adopts the served list
// when its membership changes, and bumps membershipVersion so the grid can
// re-read the sections. Without the flag nothing changes (AC-018).

vi.mock('./api', () => ({ servicesWithStatus: vi.fn(), refreshStatus: vi.fn() }));

function svc(id: string): Service {
  return {
    id, slug: id, name: id, description: '', url: `https://${id}.test`, icon: '', status: 'UP',
    favorite: false, iconLight: false, iconDark: false,
  };
}

function Probe() {
  const ctx = useServicesContext();
  return (
    <div data-testid="probe" data-version={ctx?.membershipVersion ?? 0}>
      {(ctx?.items ?? []).map((s) => s.id).join(',')}
    </div>
  );
}

function poll() {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

afterEach(() => vi.clearAllMocks());

describe('ServicesProvider syncMembership', () => {
  it('adopts a changed served list on the next poll and bumps membershipVersion', async () => {
    vi.mocked(servicesWithStatus)
      .mockResolvedValueOnce({ status: 200, services: [svc('plex'), svc('immich')] })
      .mockResolvedValue({ status: 200, services: [svc('plex'), svc('navidrome')] });
    render(
      <ServicesProvider syncMembership>
        <Probe />
      </ServicesProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('plex,immich'));
    expect(screen.getByTestId('probe')).toHaveAttribute('data-version', '0');
    poll();
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('plex,navidrome'));
    expect(screen.getByTestId('probe')).toHaveAttribute('data-version', '1');
  });

  it('a poll with the same membership only merges status (no version bump)', async () => {
    vi.mocked(servicesWithStatus)
      .mockResolvedValueOnce({ status: 200, services: [svc('plex')] })
      .mockResolvedValue({ status: 200, services: [{ ...svc('plex'), status: 'DOWN' }] });
    render(
      <ServicesProvider syncMembership>
        <Probe />
      </ServicesProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('plex'));
    poll();
    await waitFor(() => expect(servicesWithStatus).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('probe')).toHaveAttribute('data-version', '0');
  });

  it('without the flag, membership never changes from a poll (v13, AC-018)', async () => {
    vi.mocked(servicesWithStatus)
      .mockResolvedValueOnce({ status: 200, services: [svc('plex'), svc('immich')] })
      .mockResolvedValue({ status: 200, services: [svc('plex'), svc('navidrome')] });
    render(
      <ServicesProvider>
        <Probe />
      </ServicesProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('plex,immich'));
    poll();
    await waitFor(() => expect(servicesWithStatus).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('probe')).toHaveTextContent('plex,immich');
  });
});
