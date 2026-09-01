import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import AccentControl from './AccentControl';
import { ACCENTS, ACCENT_CACHE_KEY } from './accent';

// SPEC-v15-design-system §3.6/§7 — the eight-accent picker in the user menu's
// Appearance section (unchanged placement — Caleb's hard constraint). Assertions
// follow the design-system bar the reviews hold homepad to: ≥44px hit areas (the
// #182/#190 class of miss), selected state announced AND drawn as a checkmark —
// never colour alone (§6.3). v15 applies the accent by setting `data-theme` on
// <html>; the stylesheet owns the colour values.

// Self-contained in-memory localStorage (see accent.test.ts — some jsdom builds
// expose a partial Storage; the suite brings its own).
beforeEach(() => {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  });
});

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
});

describe('AccentControl', () => {
  it('renders all eight accent swatches as ≥44px buttons with accessible names', () => {
    render(<AccentControl />);
    expect(ACCENTS).toHaveLength(8);
    for (const a of ACCENTS) {
      const btn = screen.getByTestId(`accent-${a.id}`);
      expect(btn).toHaveAccessibleName(`${a.label} accent`);
      expect(btn.className).toContain('min-h-[44px]');
      expect(btn.className).toContain('min-w-[44px]');
    }
  });

  it('marks the default (blue) selected via aria-pressed + checkmark, not colour alone', () => {
    render(<AccentControl />);
    expect(screen.getByTestId('accent-blue')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('accent-check')).toBeInTheDocument();
    expect(screen.getByTestId('accent-red')).toHaveAttribute('aria-pressed', 'false');
  });

  it('clicking a swatch sets data-theme on <html> and persists it', async () => {
    const user = userEvent.setup();
    render(<AccentControl />);
    await user.click(screen.getByTestId('accent-green'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('green');
    expect(window.localStorage.getItem(ACCENT_CACHE_KEY)).toBe('green');
    expect(screen.getByTestId('accent-green')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('accent-blue')).toHaveAttribute('aria-pressed', 'false');
  });

  it('boots selected from the cached preference', () => {
    window.localStorage.setItem(ACCENT_CACHE_KEY, 'teal');
    render(<AccentControl />);
    expect(screen.getByTestId('accent-teal')).toHaveAttribute('aria-pressed', 'true');
  });

  it('migrates a retired v14 accent (indigo) to purple on boot', () => {
    window.localStorage.setItem(ACCENT_CACHE_KEY, 'indigo');
    render(<AccentControl />);
    expect(screen.getByTestId('accent-purple')).toHaveAttribute('aria-pressed', 'true');
  });
});
