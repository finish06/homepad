// SPEC-tile-density — the per-device density preference (Large / Compact / List).
// These are the RED tests for the density STATE + PERSISTENCE contract (AC-DEN-002
// default, AC-DEN-003 honour-stored, AC-DEN-004 persist). Behaviour-level: they
// drive loadDensity/saveDensity/useTileDensity, so a failure reads as "the density
// store is missing/wrong", not a wiring typo. localStorage is the store (OQ-9,
// per-device) — no API, no migration.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  DEFAULT_DENSITY,
  TILE_DENSITIES,
  isTileDensity,
  loadDensity,
  saveDensity,
  useTileDensity,
} from './tileDensity';

const KEY = 'homepad:tile-density';

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('SPEC-tile-density — density state + persistence', () => {
  it('AC-DEN-001 — exposes exactly the three densities Large, Compact, List', () => {
    expect(TILE_DENSITIES).toEqual(['large', 'compact', 'list']);
  });

  it('AC-DEN-002 — defaults to Compact when nothing is stored', () => {
    expect(DEFAULT_DENSITY).toBe('compact');
    expect(loadDensity()).toBe('compact');
  });

  it('AC-DEN-003 — honours a stored preference on load', () => {
    localStorage.setItem(KEY, 'list');
    expect(loadDensity()).toBe('list');
    localStorage.setItem(KEY, 'large');
    expect(loadDensity()).toBe('large');
  });

  it('AC-DEN-003 — falls back to the default when the stored value is junk', () => {
    localStorage.setItem(KEY, 'enormous');
    expect(loadDensity()).toBe('compact');
  });

  it('AC-DEN-004 — saveDensity persists the choice per device', () => {
    saveDensity('list');
    expect(localStorage.getItem(KEY)).toBe('list');
    expect(loadDensity()).toBe('list');
  });

  it('isTileDensity type-guards the three valid values and rejects the rest', () => {
    expect(isTileDensity('compact')).toBe(true);
    expect(isTileDensity('large')).toBe(true);
    expect(isTileDensity('list')).toBe(true);
    expect(isTileDensity('grid')).toBe(false);
    expect(isTileDensity(null)).toBe(false);
    expect(isTileDensity(undefined)).toBe(false);
  });

  it('AC-DEN-002/004 — useTileDensity starts at the stored value and writes through on change', () => {
    localStorage.setItem(KEY, 'large');
    const { result } = renderHook(() => useTileDensity());
    expect(result.current[0]).toBe('large');

    act(() => result.current[1]('compact'));
    expect(result.current[0]).toBe('compact');
    // The change is durable — a fresh read sees it (per-device persistence).
    expect(loadDensity()).toBe('compact');
  });

  it('AC-DEN-002 — useTileDensity with an empty store starts at Compact (the new default)', () => {
    const { result } = renderHook(() => useTileDensity());
    expect(result.current[0]).toBe('compact');
  });
});
