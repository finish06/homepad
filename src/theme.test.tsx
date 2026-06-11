import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ThemeProvider,
  resolveBootTheme,
  useResolvedTheme,
  useTheme,
  THEME_CACHE_KEY,
} from './theme';
import { setThemePref } from './api';

// Only setThemePref is exercised here (the persist call behind the optimistic
// control); the type import is erased, so a minimal module mock suffices.
vi.mock('./api', () => ({ setThemePref: vi.fn() }));
const mockedSetThemePref = vi.mocked(setThemePref);

// Live-getter matchMedia stub so flipping the OS re-runs registered listeners
// (the same shape Catalog.test uses).
function stubMatchMedia(initialDark: boolean) {
  let dark = initialDark;
  const listeners = new Set<() => void>();
  const mql = {
    get matches() {
      return dark;
    },
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_t: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_t: string, cb: () => void) => listeners.delete(cb),
  };
  vi.stubGlobal('matchMedia', vi.fn(() => mql));
  return {
    set(next: boolean) {
      dark = next;
      listeners.forEach((cb) => cb());
    },
  };
}

// Reads the full control surface so tests can assert pref/resolved and drive setPref.
function Probe() {
  const { pref, resolved, os, setPref } = useTheme();
  return (
    <div>
      <span data-testid="pref">{pref}</span>
      <span data-testid="resolved">{resolved}</span>
      <span data-testid="os">{os}</span>
      <button data-testid="go-dark" onClick={() => setPref('dark')}>
        dark
      </button>
      <button data-testid="go-system" onClick={() => setPref('system')}>
        system
      </button>
    </div>
  );
}

const hasDark = () => document.documentElement.classList.contains('dark');

beforeEach(() => {
  mockedSetThemePref.mockResolvedValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.classList.remove('dark');
  localStorage.clear();
});

describe('resolveBootTheme (A8 anti-flash precedence)', () => {
  it('prefers a valid cache value over the OS', () => {
    expect(resolveBootTheme('dark', false)).toBe('dark');
    expect(resolveBootTheme('light', true)).toBe('light');
  });
  it('falls back to the OS when the cache is absent or invalid', () => {
    expect(resolveBootTheme(null, true)).toBe('dark');
    expect(resolveBootTheme(null, false)).toBe('light');
    expect(resolveBootTheme('bogus', true)).toBe('dark');
  });
});

describe('A2 — default System resolves to the OS preference', () => {
  it('a fresh user (no stored pref) follows a dark OS', () => {
    stubMatchMedia(true);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('pref')).toHaveTextContent('system');
    expect(screen.getByTestId('resolved')).toHaveTextContent('dark');
    expect(hasDark()).toBe(true);
  });
});

describe('A3 — Light / Dark pin the surface', () => {
  it('userPref=light → no dark class', () => {
    stubMatchMedia(true); // OS dark, but the pinned pref wins
    render(
      <ThemeProvider userPref="light">
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('resolved')).toHaveTextContent('light');
    expect(hasDark()).toBe(false);
  });
  it('userPref=dark → dark class', () => {
    stubMatchMedia(false);
    render(
      <ThemeProvider userPref="dark">
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('resolved')).toHaveTextContent('dark');
    expect(hasDark()).toBe(true);
  });
});

describe('A4 — System follows the OS live (no reload)', () => {
  it('flipping prefers-color-scheme re-resolves the surface in place', () => {
    const media = stubMatchMedia(false); // OS light
    render(
      <ThemeProvider userPref="system">
        <Probe />
      </ThemeProvider>,
    );
    expect(hasDark()).toBe(false);

    act(() => media.set(true)); // OS → dark
    expect(screen.getByTestId('resolved')).toHaveTextContent('dark');
    expect(hasDark()).toBe(true);

    act(() => media.set(false)); // back to light
    expect(hasDark()).toBe(false);
  });

  it('a pinned Light pref ignores OS flips', () => {
    const media = stubMatchMedia(false);
    render(
      <ThemeProvider userPref="light">
        <Probe />
      </ThemeProvider>,
    );
    act(() => media.set(true));
    expect(hasDark()).toBe(false);
  });
});

describe('A8 — dark applied on first paint, and cached', () => {
  it('sets the dark class synchronously (layout effect) for a dark pref', () => {
    stubMatchMedia(false);
    render(
      <ThemeProvider userPref="dark">
        <Probe />
      </ThemeProvider>,
    );
    // Asserted right after render — no waitFor — proving it is pre-paint.
    expect(hasDark()).toBe(true);
    expect(localStorage.getItem(THEME_CACHE_KEY)).toBe('dark');
  });
});

describe('A10 — optimistic with rollback', () => {
  it('reverts pref + surface when the PATCH fails', async () => {
    const user = userEvent.setup();
    stubMatchMedia(false);
    mockedSetThemePref.mockResolvedValue(false); // server rejects
    render(
      <ThemeProvider userPref="light">
        <Probe />
      </ThemeProvider>,
    );

    await user.click(screen.getByTestId('go-dark'));

    expect(mockedSetThemePref).toHaveBeenCalledWith('dark');
    // Rolled back to the prior light pref and surface.
    expect(screen.getByTestId('pref')).toHaveTextContent('light');
    expect(hasDark()).toBe(false);
  });

  it('keeps the new pref when the PATCH succeeds', async () => {
    const user = userEvent.setup();
    stubMatchMedia(false);
    render(
      <ThemeProvider userPref="light">
        <Probe />
      </ThemeProvider>,
    );
    await user.click(screen.getByTestId('go-dark'));
    expect(screen.getByTestId('pref')).toHaveTextContent('dark');
    expect(hasDark()).toBe(true);
  });
});

describe('A12 — useResolvedTheme falls back to OS with no provider (pre-auth)', () => {
  function Bare() {
    return <span data-testid="resolved">{useResolvedTheme()}</span>;
  }
  it('resolves to the mocked OS preference without a ThemeProvider', () => {
    stubMatchMedia(true);
    render(<Bare />);
    expect(screen.getByTestId('resolved')).toHaveTextContent('dark');
  });
});
