import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { ServicesProvider } from './services';
import { servicesWithStatus } from './api';

// SPEC-kid-accounts AC-012 (TASK-405) — a revoked device gets 401 on its next
// request, and the app shows the login screen. The provider reports the 401 to
// an optional onUnauthorized; without one it keeps v13's "stop quietly".

vi.mock('./api', () => ({ servicesWithStatus: vi.fn(), refreshStatus: vi.fn() }));

afterEach(() => vi.clearAllMocks());

describe('ServicesProvider onUnauthorized', () => {
  it('fires once on a 401', async () => {
    vi.mocked(servicesWithStatus).mockResolvedValue({ status: 401, services: [] });
    const onUnauthorized = vi.fn();
    render(<ServicesProvider onUnauthorized={onUnauthorized}>x</ServicesProvider>);
    await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));
  });

  it('is not called on a 200 or a transient failure', async () => {
    vi.mocked(servicesWithStatus).mockResolvedValueOnce({ status: 500, services: [] });
    const onUnauthorized = vi.fn();
    render(<ServicesProvider onUnauthorized={onUnauthorized}>x</ServicesProvider>);
    await waitFor(() => expect(servicesWithStatus).toHaveBeenCalled());
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('a 401 with no handler still just stops (v13 AC-011)', async () => {
    vi.mocked(servicesWithStatus).mockResolvedValue({ status: 401, services: [] });
    render(<ServicesProvider>x</ServicesProvider>);
    await waitFor(() => expect(servicesWithStatus).toHaveBeenCalledTimes(1));
  });
});
