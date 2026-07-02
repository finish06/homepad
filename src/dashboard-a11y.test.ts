// Kare's authenticated-dashboard design findings (#180–#185), measured off the
// live staging DOM against the merged design system (DESIGN-SYSTEM.md):
//   muted text must clear AA body 4.5:1; interactive targets need a >=44x44 hit
//   area. jsdom has NO layout/paint/compositing engine, so it can neither measure
//   rendered px nor compute contrast — the same constraint that makes
//   library-chip-contrast.test.ts and the #177/#178 login fix guard the source.
//   We assert the class hooks / CSS rules that ENFORCE each rule here; Kare
//   re-measures the real pixels in the browser before merge. Each test is named
//   for the observed symptom and tagged with its issue id.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
const catalog = read('src/Catalog.tsx');
const app = read('src/App.tsx');
const userMenu = read('src/UserMenu.tsx');
const themeControl = read('src/ThemeControl.tsx');
const css = read('src/index.css');

// Pull the className string of the element carrying a given data-testid, so a
// reordering of attributes doesn't break the assertion.
function classesFor(src: string, testid: string): string {
  const i = src.indexOf(`data-testid="${testid}"`);
  expect(i, `data-testid="${testid}" not found`).toBeGreaterThan(-1);
  // In this codebase className follows data-testid on the element — grab the
  // FIRST className after the testid so a neighbour's className can't leak in.
  const window = src.slice(i, i + 1600);
  const m = window.match(/className=\{?`([^`]*)`/) ?? window.match(/className="([^"]*)"/);
  expect(m, `className for ${testid} not found`).not.toBeNull();
  return m![1];
}

describe('#180 — tile description dark-mode contrast', () => {
  // Measured: text-neutral-500 with NO dark: override → 4.18:1 in dark (light
  // 4.74:1). A `dark:text-neutral-400` override lifts dark to ~7:1 while light
  // keeps neutral-500's passing 4.74:1.
  it('A180 — service tile description carries a dark-mode color override', () => {
    const cls = classesFor(catalog, 'service-tile-description');
    expect(cls).toContain('text-neutral-500'); // light stays 4.74:1
    expect(cls).toContain('dark:text-neutral-400'); // dark now ~7:1, was 4.18:1
  });
});

describe('#181 — footer "Open changelog" link contrast', () => {
  // Measured: neutral-400 @12px → 2.52:1 (axe serious). neutral-500 (#737373) is
  // 4.74:1 on white; dark gets neutral-400 for the dark canvas.
  it('A181 — changelog link drops the failing neutral-400 light color', () => {
    const cls = classesFor(app, 'changelog-open'); // testid added by the fix
    expect(cls).not.toMatch(/(?<!dark:)text-neutral-400/);
    expect(cls).toContain('text-neutral-500');
    expect(cls).toContain('dark:text-neutral-400');
  });
});

describe('#182 — header bell + avatar touch targets', () => {
  // Measured: bell 36x36, avatar 34x34 at iPad — both below the 44x44 minimum.
  it('A182 — alert bell has a >=44px hit box', () => {
    const rule = css.match(/\.alert-bell\s*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/width:\s*44px/);
    expect(rule![1]).toMatch(/height:\s*44px/);
  });

  it('A182 — account avatar trigger has a >=44px hit box while keeping the 34px disc', () => {
    const cls = classesFor(userMenu, 'user-menu-trigger');
    expect(cls).toMatch(/min-h-\[44px\]/);
    expect(cls).toMatch(/min-w-\[44px\]/);
    // §6.2 disc preserved on an inner element so the visual token is unchanged.
    expect(userMenu).toContain('user-avatar-disc');
  });
});

describe('#183 — tile overflow "..." trigger touch target', () => {
  // Measured: 36x36 at sm+ / iPad portrait (h-11 base, shrunk by sm:h-9 sm:w-9).
  it('A183 — tile-menu trigger stays >=44px at sm+ (no shrink override)', () => {
    const cls = classesFor(catalog, 'tile-menu');
    expect(cls).toContain('h-11');
    expect(cls).toContain('w-11');
    expect(cls).not.toContain('sm:h-9');
    expect(cls).not.toContain('sm:w-9');
  });
});

describe('#184 — dashboard loading state', () => {
  // Measured: bare low-contrast gray "loading…". Replace with a real loading
  // affordance (spinner) + an AA-contrast label, announced to AT.
  it('A184 — loading state is a real, announced spinner with AA-contrast label', () => {
    expect(app).toContain('data-testid="app-loading-spinner"');
    expect(app).toMatch(/role="status"/);
    // bare muted "loading…" line is gone …
    expect(app).not.toMatch(/text-neutral-500[^"]*">\s*loading…/);
    // … replaced by a label in an AA-passing color (neutral-600 / dark 300).
    expect(app).toMatch(/text-neutral-600/);
    expect(app).toMatch(/dark:text-neutral-300/);
    // and the spinner itself is styled.
    expect(css).toMatch(/\.app-spinner\s*\{/);
  });
});

describe('#185 — interactive menu rows >=44px', () => {
  // Measured: chips 24, Favorite 32, Log out 38 — all under 44.
  it('A185 — .menu-item rows (UserMenu + v18 gear menu) are >=44px tall', () => {
    const rule = css.match(/\.menu-item\s*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/min-height:\s*44px/);
  });

  it('A185 — theme segment chips are >=44px tall', () => {
    // testid is a template literal (`theme-${value}`), so guard the single
    // segment button className directly.
    expect(themeControl).toMatch(/min-h-\[44px\]/);
  });

  it('A185 — tile menu Favorite + Remove rows are >=44px tall', () => {
    expect(classesFor(catalog, 'favorite-toggle')).toMatch(/min-h-\[44px\]/);
    expect(classesFor(catalog, 'remove-from-dashboard')).toMatch(/min-h-\[44px\]/);
  });
});
