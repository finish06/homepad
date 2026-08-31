// #351 (v15 gate on PR #350, @kare) — the DOWN-tile uptime meta line
// (.app-grid-tool-uptime, 11px, e.g. "24h 40.0%") measured 4.07:1 in LIGHT mode
// against the tile's pink DOWN-tint fill rgb(249,234,236) — below the WCAG-AA
// 4.5:1 floor for secondary text. UP-tile meta was a thin 4.70. Dark passed
// (4.95) and stays unchanged.
//
// jsdom has no paint/compositor, so it can't sample the pixel behind the glyphs
// (the DOWN fill is a translucent tile over a backdrop-filtered accent field —
// Kare pixel-sampled rgb(249,234,236) off the live DOM). Per the
// design-align-188-191 / glass-v2 precedent we guard the CSS source: extract the
// light-mode uptime color and assert its contrast on that measured worst-case
// bg clears AA. The real pixels ride the browser gate + Kare's re-measure.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

// The light-mode rule is the bare `.app-grid-tool-uptime {…}` (the dark override
// is `.dark .app-grid-tool-uptime`). Match the one NOT prefixed by `.dark `.
function lightUptimeColor(): string {
  const rule = css.match(/(?<!\.dark\s)\.app-grid-tool-uptime\s*\{([^}]*)\}/);
  expect(rule, '.app-grid-tool-uptime (light) rule not found').not.toBeNull();
  const m = rule![1].match(/color:\s*(#[0-9a-fA-F]{6})/);
  expect(m, 'color not found in light .app-grid-tool-uptime').not.toBeNull();
  return m![1];
}

function relLuminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function contrast(fg: [number, number, number], bg: [number, number, number]): number {
  const [l1, l2] = [relLuminance(fg), relLuminance(bg)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

// Kare's pixel-sampled composited fills (light mode). DOWN is the worst case; if
// the meta clears AA there it clears the lighter UP fill too.
const DOWN_PINK: [number, number, number] = [249, 234, 236];
const UP_FILL: [number, number, number] = [253, 253, 253];

describe('#351 — app-grid uptime meta clears WCAG-AA in light mode', () => {
  it('A351 — DOWN-tile uptime meta reads >=4.5:1 over the pink light fill (was 4.07)', () => {
    const fg = hexToRgb(lightUptimeColor());
    expect(contrast(fg, DOWN_PINK)).toBeGreaterThanOrEqual(4.5);
  });

  it('A351 — UP-tile uptime meta stays >=4.5:1 in light mode (was a thin 4.70)', () => {
    const fg = hexToRgb(lightUptimeColor());
    expect(contrast(fg, UP_FILL)).toBeGreaterThanOrEqual(4.5);
  });
});
