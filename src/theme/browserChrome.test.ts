// SPEC-ui-quick-wins AC-001 — <meta name="theme-color"> holds the resolved page
// background (--bg-1, decided §7 Q1), and follows the theme pref, the OS theme
// (pref = system) and the accent. jsdom resolves custom properties from a
// <style> element, so the field tokens are stubbed with a few of index.css's
// real values rather than the whole stylesheet.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { createElement } from 'react';
import { syncThemeColor } from './browserChrome';
import { ThemeProvider } from './theme';
import { setAccent } from './accent';

vi.mock('../api', () => ({ setThemePref: vi.fn(() => Promise.resolve(true)) }));

const FIELD_CSS = `
  :root { --bg-1: #eef3fb; }
  .dark { --bg-1: #0d1526; }
  .dark[data-theme="teal"] { --bg-1: #08201f; }
  :root:not(.dark)[data-theme="teal"] { --bg-1: #e9f6f6; }
`;

let style: HTMLStyleElement;
let meta: HTMLMetaElement;

// A controllable prefers-color-scheme query, so a test can flip the OS theme.
let osDark = false;
const listeners = new Set<() => void>();
function installMatchMedia() {
  vi.stubGlobal('matchMedia', (q: string) => ({
    get matches() {
      return q.includes('dark') ? osDark : false;
    },
    media: q,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  }));
}
function flipOs(dark: boolean) {
  osDark = dark;
  act(() => listeners.forEach((fn) => fn()));
}

const themeColor = () => meta.getAttribute('content');

beforeEach(() => {
  style = document.createElement('style');
  style.textContent = FIELD_CSS;
  document.head.appendChild(style);
  meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = '#6366F1';
  document.head.appendChild(meta);
  osDark = false;
  listeners.clear();
  installMatchMedia();
  localStorage.clear();
});

afterEach(() => {
  style.remove();
  meta.remove();
  document.documentElement.classList.remove('dark');
  document.documentElement.removeAttribute('data-theme');
  vi.unstubAllGlobals();
});

describe('syncThemeColor', () => {
  it('writes the resolved --bg-1 into the theme-color meta', () => {
    syncThemeColor();
    expect(themeColor()).toBe('#eef3fb');
    document.documentElement.classList.add('dark');
    syncThemeColor();
    expect(themeColor()).toBe('#0d1526');
  });

  it('is a no-op without a theme-color meta, and leaves the meta alone when --bg-1 is unset', () => {
    meta.remove();
    expect(() => syncThemeColor()).not.toThrow();
    document.head.appendChild(meta);
    style.remove();
    syncThemeColor();
    expect(themeColor()).toBe('#6366F1');
  });
});

describe('AC-001 — theme-color follows the theme', () => {
  it('follows the theme pref (light, then dark)', () => {
    const { rerender } = render(createElement(ThemeProvider, { userPref: 'light', children: null }));
    expect(themeColor()).toBe('#eef3fb');
    rerender(createElement(ThemeProvider, { userPref: 'dark', children: null }));
    expect(themeColor()).toBe('#0d1526');
  });

  it('follows the OS while pref = system', () => {
    render(createElement(ThemeProvider, { userPref: 'system', children: null }));
    expect(themeColor()).toBe('#eef3fb');
    flipOs(true);
    expect(themeColor()).toBe('#0d1526');
    flipOs(false);
    expect(themeColor()).toBe('#eef3fb');
  });

  it('follows an accent change, in both modes', () => {
    render(createElement(ThemeProvider, { userPref: 'light', children: null }));
    act(() => setAccent('teal'));
    expect(themeColor()).toBe('#e9f6f6');
    document.documentElement.classList.add('dark');
    act(() => setAccent('teal'));
    expect(themeColor()).toBe('#08201f');
  });
});
