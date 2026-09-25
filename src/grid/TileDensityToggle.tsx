import { useRef } from 'react';
import { TILE_DENSITIES, type TileDensity } from './tileDensity';

// SPEC-tile-density §switch — the dashboard-header density control. A radiogroup of
// three options (Large · Compact · List), matching the v16 artboard's segmented
// pill. Controlled: App owns the persisted value (useTileDensity) and this reports
// changes up. Roving tabindex + arrow keys give it the standard radio-group
// keyboard model; the active option carries aria-checked (never colour alone).
const LABELS: Record<TileDensity, string> = {
  large: 'Large',
  compact: 'Compact',
  list: 'List',
};

// Small inline glyphs (decorative — the text label is the accessible name).
const GLYPH: Record<TileDensity, string> = {
  large: '▤',
  compact: '▥',
  list: '≡',
};

export default function TileDensityToggle({
  density,
  onChange,
}: {
  density: TileDensity;
  onChange: (d: TileDensity) => void;
}) {
  // #437 — one ref per radio so an arrow press can move PHYSICAL focus, not just
  // selection. Without it activeElement stayed on the originally-focused button,
  // and because that button's own index is captured in its keydown closure, every
  // later press recomputed `next` from the SAME index: the control advanced once
  // and then stuck. The aria state was correct throughout, which is exactly why
  // no test caught it — they all watched onChange.
  const btns = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    const n = TILE_DENSITIES.length;
    let next: number;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % n;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index - 1 + n) % n;
    else return;
    e.preventDefault();
    onChange(TILE_DENSITIES[next]);
    // Focus the destination directly rather than waiting for the re-render to
    // move tabIndex. Focusing an element still carrying tabIndex={-1} is fine —
    // that only bars TAB from reaching it, not programmatic focus — and the
    // re-render promotes it to 0 immediately after.
    btns.current[next]?.focus();
  }

  return (
    <div
      className="density-toggle"
      role="radiogroup"
      aria-label="Tile density"
      data-testid="density-toggle"
    >
      {TILE_DENSITIES.map((d, i) => {
        const selected = d === density;
        return (
          <button
            key={d}
            ref={(el) => {
              btns.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={LABELS[d]}
            tabIndex={selected ? 0 : -1}
            data-testid={`density-${d}`}
            className={`density-toggle-btn${selected ? ' is-selected' : ''}`}
            onClick={() => onChange(d)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            <span className="density-toggle-glyph" aria-hidden="true">
              {GLYPH[d]}
            </span>
            <span className="density-toggle-label">{LABELS[d]}</span>
          </button>
        );
      })}
    </div>
  );
}
