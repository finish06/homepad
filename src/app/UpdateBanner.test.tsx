import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UpdateBanner from './UpdateBanner';

function stubVersionJson(payload: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => payload }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('UpdateBanner', () => {
  it('shows the banner when a newer sha is deployed', async () => {
    stubVersionJson({ version: '13.4.0', sha: 'bbbbbbb' });
    render(<UpdateBanner currentSha="aaaaaaa" />);
    expect(await screen.findByTestId('update-banner')).toHaveTextContent(
      'homepad v13.4.0 is available.',
    );
  });

  it('renders nothing when the deployed sha matches this build', async () => {
    stubVersionJson({ version: '13.3.0', sha: 'aaaaaaa' });
    render(<UpdateBanner currentSha="aaaaaaa" />);
    // The check is async — give it a tick, then assert absence.
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByTestId('update-banner')).toBeNull();
  });

  it('renders nothing (and never fetches) for a dev build', async () => {
    stubVersionJson({ version: '13.4.0', sha: 'bbbbbbb' });
    render(<UpdateBanner currentSha="dev" />);
    expect(screen.queryByTestId('update-banner')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('Refresh reloads the page', async () => {
    stubVersionJson({ version: '13.4.0', sha: 'bbbbbbb' });
    const reload = vi.fn();
    // jsdom's location.reload is non-configurable on `location` itself — swap
    // the whole object.
    vi.stubGlobal('location', { ...window.location, reload });
    render(<UpdateBanner currentSha="aaaaaaa" />);
    await userEvent.click(await screen.findByTestId('update-banner-refresh'));
    expect(reload).toHaveBeenCalled();
  });

  it('Dismiss hides the banner for this release', async () => {
    stubVersionJson({ version: '13.4.0', sha: 'bbbbbbb' });
    render(<UpdateBanner currentSha="aaaaaaa" />);
    await userEvent.click(await screen.findByTestId('update-banner-dismiss'));
    expect(screen.queryByTestId('update-banner')).toBeNull();
  });
});
