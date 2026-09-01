// #384 (v15 health summary) — Kare's live-measured design fix at 646px.
// Three CSS-only corrections in the `.health-chips` / `.health-chip` block.
// jsdom has no layout engine, so — like the sibling contrast guards
// (library-chip-contrast, design-align-188-191) — we assert against the
// stylesheet source directly, backed by real-browser CDP self-QA.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
const rule = (sel: string) => {
  const m = css.match(new RegExp(sel.replace(/[.[\]()'*]/g, '\\$&') + '\\s*\\{([^}]*)\\}'));
  return m ? m[1] : null;
};

describe('#384 — health-chips alignment (equal-width grid, edge-flush with meter)', () => {
  it('lays .health-chips out as an equal-column grid, not a flex row', () => {
    const r = rule('.health-chips');
    expect(r).not.toBeNull();
    expect(r!).toMatch(/display:\s*grid/);
    expect(r!).toMatch(/grid-auto-flow:\s*column/);
    // minmax(0, 1fr) is what makes both boxes equal-width and edge-flush.
    expect(r!).toMatch(/grid-auto-columns:\s*minmax\(0,\s*1fr\)/);
  });

  it('drops the old flex-end row and its mobile flex-start override', () => {
    const r = rule('.health-chips');
    expect(r!).not.toMatch(/flex-wrap/);
    expect(r!).not.toMatch(/justify-content/);
    // the @media(max-width:720px){ .health-chips{ justify-content:flex-start } }
    // override existed only to fight the flex layout; it must be gone.
    expect(css).not.toMatch(/max-width:\s*720px\)\s*\{\s*\.health-chips/);
  });
});

describe('#384 — health-chip contrast (real edge + text-grade green in light)', () => {
  it('gives the light chip a tinted (ink) hairline border, not the invisible white one', () => {
    const r = rule(":root:not(.dark) .health-chip");
    expect(r).not.toBeNull();
    // an ink-tinted border (rgba with low-value channels) — not white-on-white.
    expect(r!).toMatch(/border-color:\s*rgba\(20,\s*23,\s*30/);
    expect(r!).toMatch(/box-shadow:/);
  });

  it('lifts the dark chip fill so the box separates from the panel', () => {
    const r = rule('.dark .health-chip');
    expect(r).not.toBeNull();
    expect(r!).toMatch(/background:\s*rgba\(255,\s*255,\s*255,\s*0\.10\)/);
  });

  it('colors the light UP number with the text-grade token, not the fill-grade one', () => {
    const r = rule(":root:not(.dark) .health-chip[data-sev='up'] .health-chip-n");
    expect(r).not.toBeNull();
    expect(r!).toMatch(/color:\s*var\(--v-up-strong\)/);
  });
});
