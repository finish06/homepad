import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// SPEC-category-pane-width-layout AC5 — the Home content section must not cap
// content at the old narrow max-w-6xl (1152px); it uses the wide, shared
// CONTENT_WIDTH container so category panes have real horizontal room to lay
// out side-by-side (D1). Reconciliation note: the spec was drafted before #201
// shipped CONTENT_WIDTH = max-w-[1536px] (the deliberate large-monitor cap,
// locked by large-monitor-layout.test.tsx). Rather than revert that shipped
// decision to an uncapped full-width, AC5's intent (drop the narrow 6xl cap,
// use the wide container) is satisfied by CONTENT_WIDTH. Source-guard: jsdom
// has no layout, so we assert the container tokens instead of a measured width.
const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');

describe('Home container (AC5)', () => {
  it('AC5 no narrow max-w-6xl content cap remains', () => {
    expect(app).not.toMatch(/max-w-6xl/);
  });

  it('AC5 wraps the catalog in the wide shared CONTENT_WIDTH container (D1)', () => {
    expect(app).toMatch(/CONTENT_WIDTH/);
  });
});
