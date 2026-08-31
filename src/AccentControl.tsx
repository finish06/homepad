import { useState } from 'react';
import { ACCENTS, initAccent, setAccent, type AccentId } from './accent';

// Glass v2 (SPEC-glass-v2-accent) — the accent picker for the user menu's
// Appearance section, sitting under ThemeControl. Seven ROYGBIV swatches that
// re-hue the glass backdrop blobs (accent.ts). Client-only preference — applies
// instantly, persists to localStorage, no network, so unlike ThemeControl there
// is no rollback/error path.
//
// A11y per the design system: every swatch is a ≥44×44 hit area (the visible
// disc is smaller, the button is the target — the #182 avatar lesson); the
// selected state is a checkmark + aria-pressed, never color alone (§6.3). The
// 248px menu wraps the seven into two rows.

// Mid-spectrum swatches (yellow/orange/green) are too light for a white check
// (≈1.6–2.4:1); they get the near-black one. The high-contrast selection RING is
// the primary indicator either way — the check is §6.3 redundancy.
const DARK_CHECK: ReadonlySet<AccentId> = new Set(['yellow', 'orange', 'green', 'teal']);

export default function AccentControl() {
  const [accent, setAccentState] = useState<AccentId>(() => initAccent());

  function choose(id: AccentId) {
    setAccent(id);
    setAccentState(id);
  }

  return (
    <div
      data-testid="accent-control"
      role="group"
      aria-label={`Accent color (${ACCENTS.find((a) => a.id === accent)?.label})`}
      className="flex flex-wrap gap-0.5"
    >
      {ACCENTS.map((a) => {
        const active = accent === a.id;
        return (
          <button
            key={a.id}
            type="button"
            data-testid={`accent-${a.id}`}
            aria-pressed={active}
            aria-label={`${a.label} accent`}
            title={`${a.label} accent`}
            onClick={() => choose(a.id)}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md transition hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <span
              aria-hidden="true"
              className={`flex h-6 w-6 items-center justify-center rounded-full ${
                active
                  ? 'ring-2 ring-neutral-900 ring-offset-2 ring-offset-white dark:ring-white dark:ring-offset-neutral-900'
                  : ''
              }`}
              style={{ backgroundColor: a.swatch }}
            >
              {active && (
                <svg
                  data-testid="accent-check"
                  viewBox="0 0 24 24"
                  className={`h-3.5 w-3.5 ${DARK_CHECK.has(a.id) ? 'text-neutral-900' : 'text-white'}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
