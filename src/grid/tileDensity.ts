import { useCallback, useEffect, useState } from 'react';
import { setDensityPref } from '../api';

// SPEC-tile-density — the tile density preference. Three densities: Large (the
// legacy vertical name-only tile), Compact (the v16 horizontal tile with a status
// line — the NEW DEFAULT), and List (one full-width column).
//
// Persistence (decision record 2026-09-12, OQ-9): PER USER, SERVER-SIDE. The
// account's `densityPref` (GET /api/me) is the source of truth and wins on every
// resolve; localStorage is only a per-device CACHE so the first paint does not
// flash the default before /api/me answers. Choices write through to PATCH
// /api/me. When the backend has no field yet (older API → 400) the cache carries
// the choice on this device — the feature degrades, it never reverts.
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

// useTileDensity resolves the density as: server preference (when known and
// valid) → device cache → default. `serverPref` is the account's densityPref
// from /api/me; it usually arrives after mount, so the hook adopts it whenever
// it changes and mirrors it into the cache. Setting a density updates state and
// the cache immediately (optimistic) and writes through to the server.
export function useTileDensity(serverPref?: string): [TileDensity, (d: TileDensity) => void] {
  const [density, setDensity] = useState<TileDensity>(() =>
    isTileDensity(serverPref) ? serverPref : loadDensity(),
  );
  useEffect(() => {
    if (!isTileDensity(serverPref)) return;
    setDensity(serverPref);
    saveDensity(serverPref);
  }, [serverPref]);
  const set = useCallback((d: TileDensity) => {
    setDensity((cur) => {
      if (cur === d) return cur;
      saveDensity(d);
      // Fire-and-forget: a false (older backend, network blip) is not rolled
      // back — the device cache already holds the choice and keeps working.
      void setDensityPref(d);
      return d;
    });
  }, []);
  return [density, set];
}
