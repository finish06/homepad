// Kare's v12.4.0 (9aaad1e) design-system alignment findings — the last-mile
// light-mode contrast misses (#188/#189/#191) and sub-44 touch targets
// (#189/#190) that keep the reference app from passing its own system, plus the
// #185 advisory on the "+ Add apps" button. Source: design-review-20260629.md.
//
// jsdom has NO layout/paint/contrast engine (same constraint as
// dashboard-a11y.test.ts), so we guard the class hooks / CSS rules that ENFORCE
// each rule; Kare re-measures the real pixels in the browser before merge. Each
// test is named for the observed symptom and tagged with its issue id.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
const catalog = read('src/Catalog.tsx');
const appHeader = read('src/AppHeader.tsx');
const statusBar = read('src/StatusBar.tsx');
const css = read('src/index.css');

// Grab the className string of the element carrying a given data-testid (mirrors
// dashboard-a11y.test.ts so attribute reordering can't break the assertion).
function classesFor(src: string, testid: string): string {
  const i = src.indexOf(`data-testid="${testid}"`);
  expect(i, `data-testid="${testid}" not found`).toBeGreaterThan(-1);
  const window = src.slice(i, i + 1600);
  const m = window.match(/className=\{?`([^`]*)`/) ?? window.match(/className="([^"]*)"/);
  expect(m, `className for ${testid} not found`).not.toBeNull();
  return m![1];
}

describe('#188 — tile overflow "..." glyph contrast (light)', () => {
  // Measured: neutral-400 #a3a3a3 @18px on white = 2.52:1. neutral-500 is
  // 4.75:1; dark keeps neutral-400 (rides near-black at ~7:1).
  it('A188 — tile-menu trigger glyph drops the failing neutral-400 light color', () => {
    const cls = classesFor(catalog, 'tile-menu');
    expect(cls).not.toMatch(/(?<!dark:)text-neutral-400/); // light 2.52:1 gone
    expect(cls).toContain('text-neutral-500'); // light now 4.75:1
    expect(cls).toContain('dark:text-neutral-400'); // dark unchanged (~7:1)
  });
});

describe('#189 — quick-launcher placeholder contrast + bar height', () => {
  // Measured: placeholder rgb(154,163,184) #9aa3b8 = 2.53:1; bar 36px tall.
  it('A189 — launcher placeholder drops the failing #9aa3b8 for #6e6e6e (5:1)', () => {
    const rule = css.match(/\.launcher-trigger-placeholder\s*\{([^}]*)\}/);
    expect(rule, '.launcher-trigger-placeholder rule not found').not.toBeNull();
    expect(rule![1]).not.toMatch(/#9aa3b8/);
    expect(rule![1]).toMatch(/#6e6e6e/);
  });

  it('A189 — launcher trigger bar is >=44px tall', () => {
    const rule = css.match(/\.launcher-trigger\s*\{([^}]*)\}/);
    expect(rule, '.launcher-trigger rule not found').not.toBeNull();
    expect(rule![1]).toMatch(/min-height:\s*44px/);
  });
});

describe('#190 — settings gear touch target', () => {
  // Measured: 36x36 (h-9 w-9); the bell beside it is 44. Match the bell + "...".
  it('A190 — settings gear is >=44px (h-11 w-11, no h-9 w-9)', () => {
    const cls = classesFor(appHeader, 'settings-gear');
    expect(cls).toContain('h-11');
    expect(cls).toContain('w-11');
    expect(cls).not.toContain('h-9');
    expect(cls).not.toContain('w-9');
  });
});

describe('#191 — header status captions contrast (light)', () => {
  // Measured: "Updated just now" neutral-400 @12px on white = 2.52:1.
  it('A191 — "Updated X ago" caption drops the failing neutral-400 light color', () => {
    const cls = classesFor(appHeader, 'status-last-updated');
    expect(cls).not.toMatch(/(?<!dark:)text-neutral-400/);
    expect(cls).toContain('text-neutral-500'); // light now 4.74:1
    // dark unified onto neutral-400 (matches the "N not monitored" caption,
    // ~7.7:1) — neutral-500 measured a borderline ~4.1:1 on the dark header.
    expect(cls).toContain('dark:text-neutral-400');
  });

  it('A191 — the not-monitored count is a token-driven health chip (AA), not a resting neutral caption', () => {
    // v15: the count strip → health panel (§4.2). The "not monitored" count is no
    // longer a Tailwind neutral caption — it renders as a .health-chip whose
    // number/label read --v-muted (light ≈4.9:1, AA) via CSS, so the contrast
    // that #191 guarded now lives in the token layer (dashboard-a11y guards it).
    expect(statusBar).toMatch(/health-chip-label/);
    expect(statusBar).toMatch(/not monitored/);
  });
});

describe('#185 — "+ Add apps" button touch target (advisory)', () => {
  // Measured: ~34px tall (py-1.5). Bump to a >=44px hit area.
  it('A185 — open-library "+ Add apps" button is >=44px tall', () => {
    const cls = classesFor(catalog, 'open-library');
    expect(cls).toContain('min-h-11');
  });
});
