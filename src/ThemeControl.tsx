import { useState } from 'react';
import type { ThemePref } from './api';
import { useTheme } from './theme';

// v3 theme control — a three-segment System / Light / Dark switch for the header
// user menu. Renders for every logged-in user (personalization, not admin-gated,
// unlike the v2 Edit toggle). A segmented control (not a two-state toggle)
// because "System" must be explicitly selectable. Selecting a segment is
// optimistic: useTheme().setPref applies the surface immediately, fires
// PATCH /api/me, and rolls back with an inline error on failure.

const SEGMENTS: { value: ThemePref; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function ThemeControl() {
  const { pref, os, setPref } = useTheme();
  const [error, setError] = useState(false);

  async function choose(next: ThemePref) {
    setError(false);
    const ok = await setPref(next);
    if (!ok) setError(true); // setPref already rolled the surface back
  }

  return (
    <div
      data-testid="theme-control"
      role="group"
      // When System is active, hint what the OS is currently resolving to so the
      // user understands why the surface looks the way it does ("System · Dark").
      aria-label={`Theme${pref === 'system' ? ` (System · ${os === 'dark' ? 'Dark' : 'Light'})` : ''}`}
      className="inline-flex items-center rounded-lg border border-neutral-200 p-0.5 dark:border-neutral-700"
    >
      {SEGMENTS.map((seg) => {
        const active = pref === seg.value;
        return (
          <button
            key={seg.value}
            type="button"
            data-testid={`theme-${seg.value}`}
            aria-pressed={active}
            onClick={() => choose(seg.value)}
            className={`inline-flex min-h-[44px] items-center justify-center rounded-md px-2.5 py-1 text-xs font-medium transition ${
              active
                ? 'bg-indigo-600 text-white'
                : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'
            }`}
          >
            {seg.label}
            {active && seg.value === 'system' && (
              <span className="ml-1 opacity-80" data-testid="theme-system-hint">
                · {os === 'dark' ? 'Dark' : 'Light'}
              </span>
            )}
          </button>
        );
      })}
      {error && (
        <span data-testid="theme-error" role="alert" className="ml-2 text-xs text-red-600">
          Couldn’t save
        </span>
      )}
    </div>
  );
}
