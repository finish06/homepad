import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// v21 — pencil edit affordance a11y MEASUREMENT gate (spec §8.1, Kare). Mirrors
// the v20 ★ gate: keep a 34×34 painted glyph and extend ONLY a transparent
// centered ::before to 44×44 (zero layout shift, no ★ collision). Accent (indigo)
// glyph, theme-aware; resting opacity ~0.85 (more present than the ★'s 0.5, since
// in edit mode the pencil is the primary per-tile action). The tile gains a 2px
// inset accent ring in edit mode. jsdom resolves single extracted rules (no
// layout); the real hit geometry + no-collision is re-measured in the CDP gate.
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
  style.textContent = `.edit-a11y-probe { ${body} }`;
  document.head.appendChild(style);
  const el = document.createElement('div');
  el.className = 'edit-a11y-probe';
  document.body.appendChild(el);
  const value = getComputedStyle(el).getPropertyValue(prop);
  style.remove();
  el.remove();
  return value;
}

describe('v21 — pencil edit affordance touch target (§8.1)', () => {
  it('extends the hit area to 44×44 via a centered transparent ::before', () => {
    const before = ruleBody('.app-grid-tool-edit::before');
    expect(computed(before, 'width')).toBe('44px');
    expect(computed(before, 'height')).toBe('44px');
    expect(before).toMatch(/position:\s*absolute/);
    expect(before).toMatch(/translate\(-50%,\s*-50%\)/);
  });

  it('keeps the painted glyph box at 34×34 with a ≤20px glyph (zero layout shift)', () => {
    const body = ruleBody('.app-grid-tool-edit {');
    expect(computed(body, 'width')).toBe('34px');
    expect(computed(body, 'height')).toBe('34px');
    expect(parseFloat(computed(body, 'font-size'))).toBeLessThanOrEqual(20);
  });

  it('declares touch-action: manipulation (kills the 300ms tap delay)', () => {
    expect(ruleBody('.app-grid-tool-edit {')).toMatch(/touch-action:\s*manipulation/);
  });

  it('sits at the BOTTOM-right (paired with the ★ top-right; status pip top-left)', () => {
    const body = ruleBody('.app-grid-tool-edit {');
    expect(body).toMatch(/bottom:\s*4px/);
    expect(body).toMatch(/right:\s*4px/);
  });

  it('paints the accent (indigo) glyph, theme-aware, resting opacity ~0.85', () => {
    expect(computed(ruleBody('.app-grid-tool-edit {'), 'color')).toBe('rgb(79, 70, 229)'); // #4f46e5 light
    expect(computed(ruleBody('.dark .app-grid-tool-edit {'), 'color')).toBe('rgb(129, 140, 248)'); // #818cf8 dark
    expect(parseFloat(computed(ruleBody('.app-grid-tool-edit {'), 'opacity'))).toBeCloseTo(0.85, 2);
  });

  it('marks the editable tile with a 2px inset accent ring in edit mode', () => {
    const body = ruleBody('.app-grid-tool-wrap.is-editing .app-grid-tool');
    expect(body).toMatch(/outline:\s*2px solid/);
    expect(body).toMatch(/outline-offset:\s*-2px/);
  });
});
