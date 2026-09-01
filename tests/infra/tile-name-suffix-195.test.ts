// #195 — App Grid tile names truncate the distinguishing token: at narrow tile
// widths (<=173px on a 2560px monitor via the 6-col layout, see #194) sibling
// tiles "ArchiveTeam Warrior1" and "ArchiveTeam Warrior2" both single-line
// end-ellipsize to "ArchiveTeam …" and become indistinguishable — violating
// design-system principle #4 (a label must remain identifying).
//
// jsdom has NO layout/paint engine (same constraint as design-align-188-191 and
// dashboard-a11y), so it cannot measure a real pixel truncation. We instead
// guard the CSS rule that ENFORCES a suffix-preserving fallback: the tool name
// wraps to a second line (line-clamp: 2) instead of clipping the whole label to
// one line, so a distinguishing trailing word ("Warrior1"/"Warrior2") survives.
// The real pixel behavior is re-checked in a CDP browser before merge.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
const css = read('src/index.css');
const appGrid = read('src/AppGrid.tsx');

// The body of the `.app-grid-tool-name` rule (not the `.dark` variant).
function toolNameRule(): string {
  const m = css.match(/\.app-grid-tool-name\s*\{([^}]*)\}/);
  expect(m, '.app-grid-tool-name rule not found').not.toBeNull();
  return m![1];
}

describe('#195 — tile name drops the distinguishing suffix under truncation', () => {
  it('A195-1 — tool name does NOT single-line clip (no white-space: nowrap)', () => {
    // nowrap is what forces "ArchiveTeam Warrior1" onto one line and lets the
    // end-ellipsis eat the identifying "Warrior1" suffix.
    expect(toolNameRule()).not.toMatch(/white-space:\s*nowrap/);
  });

  it('A195-2 — tool name wraps to a second line so the suffix survives', () => {
    const rule = toolNameRule();
    // -webkit-line-clamp keeps two lines: "ArchiveTeam" on line 1, the
    // distinguishing "Warrior1"/"Warrior2" on line 2 — never dropped.
    expect(rule).toMatch(/-webkit-line-clamp:\s*2/);
    expect(rule).toMatch(/-webkit-box-orient:\s*vertical/);
    // still hides any overflow past the two lines
    expect(rule).toMatch(/overflow:\s*hidden/);
  });

  it('A195-3 — full name stays reachable via the native title tooltip', () => {
    // Hover/long-press affordance for names too long even for two lines.
    const i = appGrid.indexOf('className="app-grid-tool"');
    expect(i).toBeGreaterThan(-1);
    const around = appGrid.slice(i, i + 400);
    expect(around).toMatch(/title=\{service\.name\}/);
  });
});
