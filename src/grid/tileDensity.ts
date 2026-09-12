import { useCallback, useState } from 'react';

// SPEC-tile-density — the tile density preference. Three densities: Large (the
// legacy vertical name-only tile), Compact (the v16 horizontal tile with a status
// line — the NEW DEFAULT), and List (one full-width column). Persistence is
// PER DEVICE via localStorage (OQ-9): a dashboard's density is a property of the
// screen it's on, not the account, so it needs no API field and no migration.
export type TileDensity = 'large' | 'compact' | 'list';

// Display order = the switch order (Large · Compact · List), matching the artboard.
export const TILE_DENSITIES: TileDensity[] = ['large', 'compact', 'list'];

// OQ-9 — Compact is the default for a device with nothing stored.
export const DEFAULT_DENSITY: TileDensity = 'compact';

const STORAGE_KEY = 'homepad:tile-density';

export function isTileDensity(v: unknown): v is TileDensity {
  return v === 'large' || v === 'compact' || v === 'list';
}

// loadDensity reads the stored preference, falling back to the default for an
// empty/unknown value or when storage is unavailable (private-mode throw).
export function loadDensity(): TileDensity {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isTileDensity(raw) ? raw : DEFAULT_DENSITY;
  } catch {
    return DEFAULT_DENSITY;
  }
}

// saveDensity persists the choice; a storage throw is swallowed (the in-memory
// state still updates, so the switch works for the session).
export function saveDensity(d: TileDensity): void {
  try {
    localStorage.setItem(STORAGE_KEY, d);
  } catch {
    /* storage unavailable — session-only is an acceptable degradation */
  }
}

// useTileDensity seeds from storage on mount and writes through on every change,
// so the preference survives a reload on this device.
export function useTileDensity(): [TileDensity, (d: TileDensity) => void] {
  const [density, setDensity] = useState<TileDensity>(loadDensity);
  const set = useCallback((d: TileDensity) => {
    setDensity(d);
    saveDensity(d);
  }, []);
  return [density, set];
}
