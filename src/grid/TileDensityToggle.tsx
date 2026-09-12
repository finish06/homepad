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
  function onKeyDown(e: React.KeyboardEvent, index: number) {
    const n = TILE_DENSITIES.length;
    let next: number;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % n;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index - 1 + n) % n;
    else return;
    e.preventDefault();
    onChange(TILE_DENSITIES[next]);
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
