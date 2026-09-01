import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// v21 — Tile Edit Modal a11y MEASUREMENT gate (spec §8.6, Kare — every value
// measured @ iPad 768). jsdom has no layout, but it resolves a single extracted
// rule's computed style (the v20 trick), so we pull the real .tile-edit-* rules
// out of src/index.css and assert the touch-target floors and the three forced
// dark-mode token decisions. The rendered-DOM contrast/geometry is re-measured
// in the CDP browser gate.
const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

function ruleBody(selector: string): string {
  const idx = css.indexOf(selector);
  expect(idx, `expected a CSS rule for \`${selector}\``).toBeGreaterThanOrEqual(0);
  const open = css.indexOf('{', idx);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

function computed(body: string, prop: string): string {
  const style = document.createElement('style');
  style.textContent = `.tile-a11y-probe { ${body} }`;
  document.head.appendChild(style);
  const el = document.createElement('div');
  el.className = 'tile-a11y-probe';
  document.body.appendChild(el);
  const value = getComputedStyle(el).getPropertyValue(prop);
  style.remove();
  el.remove();
  return value;
}

describe('v21 — Tile Edit Modal touch targets (§8.6, all ≥44)', () => {
  it('the scrim backdrop is rgba(0,0,0,.5)', () => {
    expect(computed(ruleBody('.tile-edit-overlay {'), 'background-color')).toBe('rgba(0, 0, 0, 0.5)');
  });

  it('inputs / select are ≥44px tall (fixes the DS §3.3 38px input miss)', () => {
    expect(computed(ruleBody('.tile-edit-input {'), 'min-height')).toBe('44px');
  });

  it('the description textarea is ≥76px tall', () => {
    expect(computed(ruleBody('.tile-edit-textarea {'), 'min-height')).toBe('76px');
  });

  it('every button is ≥44px tall (fixes the DS §3.2 36px miss)', () => {
    expect(computed(ruleBody('.tile-edit-btn {'), 'min-height')).toBe('44px');
    expect(computed(ruleBody('.tile-edit-btn-text {'), 'min-height')).toBe('44px');
  });

  it('the ✕ close button is a 44×44 box', () => {
    const body = ruleBody('.tile-edit-close {');
    expect(computed(body, 'width')).toBe('44px');
    expect(computed(body, 'height')).toBe('44px');
  });

  it('the icon preview is 64×64 (exceeds the ≥48 floor)', () => {
    const body = ruleBody('.tile-icon-preview {');
    expect(computed(body, 'width')).toBe('64px');
    expect(computed(body, 'height')).toBe('64px');
  });
});

describe('v21 — forced dark-mode token decisions (§8.6)', () => {
  it('decision 1 — primary CTA is indigo-600 #4f46e5 + white in BOTH themes', () => {
    expect(computed(ruleBody('.tile-edit-btn-primary {'), 'background-color')).toBe('rgb(79, 70, 229)');
    expect(computed(ruleBody('.tile-edit-btn-primary {'), 'color')).toBe('rgb(255, 255, 255)');
    // Dark must NOT lighten the fill to indigo-500 (that fails white-on-fill).
    expect(computed(ruleBody('.dark .tile-edit-btn-primary {'), 'background-color')).toBe('rgb(79, 70, 229)');
  });

  it('decision 2 — accent (ghost label) is theme-aware indigo-600 light / indigo-400 dark', () => {
    expect(computed(ruleBody('.tile-edit-btn-ghost {'), 'color')).toBe('rgb(79, 70, 229)');
    expect(computed(ruleBody('.dark .tile-edit-btn-ghost {'), 'color')).toBe('rgb(129, 140, 248)');
  });

  it('decision 3 — control border is theme-aware #8c8c8c light / #808080 dark (never #a3a3a3)', () => {
    expect(ruleBody('.tile-edit-input {')).toMatch(/#8c8c8c/);
    expect(ruleBody('.dark .tile-edit-input {')).toMatch(/#808080/);
    expect(css).not.toMatch(/\.tile-edit-input\s*\{[^}]*#a3a3a3/);
  });
});
