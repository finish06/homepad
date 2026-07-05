import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// v20 — Favorite ★ Touch Target & Contrast Fix (specs/v20-fav-star-a11y.md,
// closes Gitea #255). The per-tile ★ toggle (data-testid="tile-favorite",
// .app-grid-tool-fav) failed two design-system floors on the iPad (768px):
//   • hit area 34×34 < 44×44 (DESIGN-SYSTEM §9.3)         → AC-001
//   • default ☆ light-mode #94a3b8 = 2.56:1 < 3:1 on white → AC-003
//
// Kare's §8 fix (measured): keep the painted 34×34 button EXACTLY as-is and
// extend only the invisible hit area with a centered transparent
// `.app-grid-tool-fav::before` of 44×44 (0px glyph movement, hover pill + focus
// ring unchanged — AC-004), add `touch-action: manipulation`, and darken the
// resting light-mode color slate-400 → slate-500 (#64748b, 4.76:1 on white).
//
// jsdom has no layout, but it DOES resolve a single extracted rule's computed
// style (same trick as dark-tile-shadow.test.tsx / launcher-a11y.test.tsx), so
// we pull the real .app-grid-tool-fav rules out of src/index.css and assert.
const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

// Extract a single CSS rule body by exact selector (first match). We match the
// selector followed by `{ … }` with no nested braces (these rules are flat).
function ruleBody(selector: string): string {
  const idx = css.indexOf(selector);
  expect(idx, `expected a CSS rule for \`${selector}\``).toBeGreaterThanOrEqual(0);
  const open = css.indexOf('{', idx);
  const close = css.indexOf('}', open);
  expect(open).toBeGreaterThanOrEqual(0);
  expect(close).toBeGreaterThan(open);
  return css.slice(open + 1, close);
}

// Compute a property off an extracted rule body via a probe element + jsdom's
// getComputedStyle (jsdom normalizes hex → rgb()).
function computed(body: string, prop: string): string {
  const style = document.createElement('style');
  style.textContent = `.fav-a11y-probe { ${body} }`;
  document.head.appendChild(style);
  const el = document.createElement('div');
  el.className = 'fav-a11y-probe';
  document.body.appendChild(el);
  const value = getComputedStyle(el).getPropertyValue(prop);
  style.remove();
  el.remove();
  return value;
}

describe('v20 — favorite ★ touch target & contrast (#255)', () => {
  it('AC-001 — .app-grid-tool-fav::before extends the hit area to 44×44px', () => {
    // The transparent, centered ::before pseudo-element IS the button box, so a
    // pointer event anywhere in the 44×44 zone fires the button's onClick.
    const before = ruleBody('.app-grid-tool-fav::before');
    expect(computed(before, 'width')).toBe('44px');
    expect(computed(before, 'height')).toBe('44px');
    // Centered on the painted button so the glyph does not move (0px delta).
    expect(before).toMatch(/position:\s*absolute/);
    expect(before).toMatch(/translate\(-50%,\s*-50%\)/);
  });

  it('AC-001 — .app-grid-tool-fav declares touch-action: manipulation', () => {
    // Kills the 300ms double-tap-zoom delay so a corner tap fires instantly.
    // jsdom's getComputedStyle does not resolve `touch-action`, so assert the
    // declaration against the CSS source text.
    expect(ruleBody('.app-grid-tool-fav {')).toMatch(/touch-action:\s*manipulation/);
  });

  it('AC-002 — the visual glyph stays ≤20px (expanded area is transparent, not a bigger glyph)', () => {
    const body = ruleBody('.app-grid-tool-fav {');
    const fontSize = parseFloat(computed(body, 'font-size'));
    expect(fontSize).toBeLessThanOrEqual(20);
    // Painted box unchanged at 34×34 → hover pill / focus ring geometry unchanged.
    expect(computed(body, 'width')).toBe('34px');
    expect(computed(body, 'height')).toBe('34px');
  });

  it('AC-003 — default ☆ light-mode color is slate-500 #64748b (≥3:1 on white)', () => {
    const body = ruleBody('.app-grid-tool-fav {');
    expect(computed(body, 'color')).toBe('rgb(100, 116, 139)');
  });

  it('AC-004 — dark-mode ☆, favorited amber, hover, and focus ring are unchanged', () => {
    // Dark resting ☆ still slate-500.
    expect(computed(ruleBody('.dark .app-grid-tool-fav {'), 'color')).toBe('rgb(100, 116, 139)');
    // Favorited amber in light mode unchanged.
    expect(computed(ruleBody('.app-grid-tool-fav.is-favorite {'), 'color')).toBe('rgb(245, 158, 11)');
    // Hover color unchanged (slate-600).
    expect(computed(ruleBody('.app-grid-tool-fav:hover {'), 'color')).toBe('rgb(71, 85, 105)');
    // Focus-visible ring unchanged (#6366f1). Match the standalone rule whose
    // block carries the box-shadow (not the earlier combined opacity:1 rule).
    expect(css).toMatch(/\.app-grid-tool-fav:focus-visible\s*\{[^}]*box-shadow:\s*0 0 0 2px #6366f1/);
    // Resting opacity kept at 0.5 (§8.3).
    expect(computed(ruleBody('.app-grid-tool-fav {'), 'opacity')).toBe('0.5');
  });
});
