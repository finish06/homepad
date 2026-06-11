// v3 theme mode. Three distinct concepts (spec §"How the preference drives the
// app"): the stored `pref` (system|light|dark), the live OS preference, and the
// `resolved` surface (light|dark) actually applied to the document. The provider
// owns all three, mirrors the resolved theme onto `<html class="dark">`
// (Tailwind's class strategy) and into a localStorage cache, and follows the OS
// live while pref==='system'. The icon precedence (v2) reads the resolved theme
// via useResolvedTheme.

import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { setThemePref, type ThemePref } from './api';

export type ResolvedTheme = 'light' | 'dark';

// Mirrors the resolved theme so the inline boot script in index.html can paint
// the right surface before the React bundle loads (anti-flash). The provider
// keeps this in sync; it is a render cache, never the source of truth (the
// server `themePref` wins once /api/me resolves).
export const THEME_CACHE_KEY = 'homepad.theme';

// matchMedia is absent in jsdom/older runtimes — guard it and default light.
function osTheme(): ResolvedTheme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// resolveBootTheme picks the first-paint surface from the cache, falling back to
// the OS. Shared by the provider's initial state and mirrored by the index.html
// boot script. A bad/empty cache value degrades to the OS preference.
export function resolveBootTheme(cache: string | null, osDark: boolean): ResolvedTheme {
  if (cache === 'light' || cache === 'dark') return cache;
  return osDark ? 'dark' : 'light';
}

// useOsTheme tracks the live OS preference. The listener stays mounted (it is
// cheap) but callers only fold it into the resolved theme while pref==='system'.
function useOsTheme(): ResolvedTheme {
  const [theme, setTheme] = useState<ResolvedTheme>(osTheme);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const onChange = () => setTheme(mq.matches ? 'dark' : 'light');
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return theme;
}

export type ThemeContextValue = {
  pref: ThemePref;
  resolved: ResolvedTheme;
  os: ResolvedTheme;
  // Optimistically applies `next`, persists via PATCH /api/me, and rolls back to
  // the prior pref on failure (returning false) — the favorites/reorder pattern.
  setPref: (next: ThemePref) => Promise<boolean>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  userPref,
  children,
}: {
  userPref?: ThemePref;
  children: ReactNode;
}) {
  const [pref, setPrefState] = useState<ThemePref>(userPref ?? 'system');
  const os = useOsTheme();

  // The stored preference arrives with /api/me (and changes on login/logout).
  // Sync internal state to it whenever the prop's value changes — keyed on the
  // value so it can't clobber an in-session optimistic setPref (which mutates
  // internal state only, never the prop).
  useEffect(() => {
    setPrefState(userPref ?? 'system');
  }, [userPref]);

  const resolved: ResolvedTheme = pref === 'system' ? os : pref;

  // Apply before paint to avoid a flash, and mirror into the first-paint cache.
  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
    try {
      localStorage.setItem(THEME_CACHE_KEY, resolved);
    } catch {
      // Private-mode / disabled storage — the cache is an optimization only.
    }
  }, [resolved]);

  async function setPref(next: ThemePref): Promise<boolean> {
    const prev = pref;
    if (next === prev) return true;
    setPrefState(next); // optimistic — instant surface feedback
    const ok = await setThemePref(next);
    if (!ok) setPrefState(prev); // roll back to the prior choice
    return ok;
  }

  return (
    <ThemeContext.Provider value={{ pref, resolved, os, setPref }}>
      {children}
    </ThemeContext.Provider>
  );
}

// useTheme exposes the full control surface; must be used under a ThemeProvider.
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}

// useResolvedTheme returns the active surface for theme-derived rendering (v2
// icon precedence). Under a provider it tracks the resolved theme; without one
// (pre-auth, isolated component tests) it falls back to the live OS preference.
export function useResolvedTheme(): ResolvedTheme {
  const ctx = useContext(ThemeContext);
  const os = useOsTheme();
  return ctx ? ctx.resolved : os;
}
