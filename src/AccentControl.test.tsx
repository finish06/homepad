import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import AccentControl from './AccentControl';
import { ACCENTS, ACCENT_CACHE_KEY } from './accent';

// SPEC-glass-v2-accent — the ROYGBIV picker in the user menu's Appearance
// section. Assertions follow the design-system bar the reviews hold homepad to:
// ≥44px hit areas (the #182/#190 class of miss), selected state announced AND
// drawn as a checkmark — never color alone (§6.3).

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
  document.documentElement.style.removeProperty('--accent-1');
  document.documentElement.style.removeProperty('--accent-2');
});

describe('AccentControl', () => {
  it('renders all seven ROYGBIV swatches as ≥44px buttons with accessible names', () => {
    render(<AccentControl />);
    for (const a of ACCENTS) {
      const btn = screen.getByTestId(`accent-${a.id}`);
      expect(btn).toHaveAccessibleName(`${a.label} accent`);
      expect(btn.className).toContain('min-h-[44px]');
      expect(btn.className).toContain('min-w-[44px]');
    }
  });

  it('marks the default (indigo) selected via aria-pressed + checkmark, not color alone', () => {
    render(<AccentControl />);
    expect(screen.getByTestId('accent-indigo')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('accent-check')).toBeInTheDocument();
    expect(screen.getByTestId('accent-red')).toHaveAttribute('aria-pressed', 'false');
  });

  it('clicking a swatch applies the pair to <html> and persists it', async () => {
    const user = userEvent.setup();
    render(<AccentControl />);
    await user.click(screen.getByTestId('accent-green'));
    const green = ACCENTS.find((a) => a.id === 'green')!;
    expect(document.documentElement.style.getPropertyValue('--accent-1')).toBe(green.a);
    expect(window.localStorage.getItem(ACCENT_CACHE_KEY)).toBe('green');
    expect(screen.getByTestId('accent-green')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('accent-indigo')).toHaveAttribute('aria-pressed', 'false');
  });

  it('boots selected from the cached preference', () => {
    window.localStorage.setItem(ACCENT_CACHE_KEY, 'blue');
    render(<AccentControl />);
    expect(screen.getByTestId('accent-blue')).toHaveAttribute('aria-pressed', 'true');
  });

  it('re-choosing the default clears the inline override (stylesheet owns brand values)', async () => {
    const user = userEvent.setup();
    render(<AccentControl />);
    await user.click(screen.getByTestId('accent-red'));
    await user.click(screen.getByTestId('accent-indigo'));
    expect(document.documentElement.style.getPropertyValue('--accent-1')).toBe('');
    expect(window.localStorage.getItem(ACCENT_CACHE_KEY)).toBe('indigo');
  });
});
