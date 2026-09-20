import { useCallback, useEffect, useState } from 'react';
import type { Service } from '../api';

// cap3 — the "Recently opened" row. Per-BROWSER convenience state, not synced:
// a localStorage list of service ids, newest first, capped. No backend.
//
// The store notifies via a custom DOM event rather than context or a prop drill,
// so a tile click anywhere in the grid updates the row without AppGrid having to
// thread a callback through BoxCard → ToolLink (spec §2). Same-document only,
// which is all this needs — the list is per-browser by design.

export const RECENT_KEY = 'homepad.recentlyOpened';
export const RECENT_EVENT = 'homepad:opened';
export const RECENT_MAX = 8;

function read(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    // Anything that is not an array of strings is treated as absent rather than
    // thrown over: a corrupt key must never break the dashboard.
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string');
  } catch {
    return [];
  }
}

function write(ids: string[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(ids));
  } catch {
    /* private mode / storage disabled — the row degrades to empty, never throws */
  }
}

function announce(): void {
  try {
    window.dispatchEvent(new CustomEvent(RECENT_EVENT));
  } catch {
    /* no window (SSR-ish test env) — nothing to notify */
  }
}

// recordOpened moves `id` to the front, de-duplicating, and caps the list.
export function recordOpened(id: string): void {
  if (!id) return;
  const next = [id, ...read().filter((x) => x !== id)].slice(0, RECENT_MAX);
  write(next);
  announce();
}

export function clearRecentlyOpened(): void {
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {
    /* as above */
  }
  announce();
}

// resolveRecent maps stored ids onto live services, dropping any that no longer
// exist in the catalog (AC-006) and preserving recency order.
export function resolveRecent(ids: string[], items: Service[]): Service[] {
  const byId = new Map(items.map((s) => [s.id, s]));
  return ids.map((id) => byId.get(id)).filter((s): s is Service => s !== undefined);
}

// useRecentlyOpened resolves the stored list against the current catalog and
// re-reads whenever a tile records an open.
export function useRecentlyOpened(items: Service[]): Service[] {
  const [ids, setIds] = useState<string[]>(read);
  const refresh = useCallback(() => setIds(read()), []);
  useEffect(() => {
    window.addEventListener(RECENT_EVENT, refresh);
    return () => window.removeEventListener(RECENT_EVENT, refresh);
  }, [refresh]);
  return resolveRecent(ids, items);
}
