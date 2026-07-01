// v14 §6.1 — the localStorage core for "Recently opened" AND usage-priority
// ordering. The cap#3 string[] `homepad.recentlyOpened` list is replaced by a
// timestamped `homepad.openLog` ({id,t}[]): the same recency signal the chip
// rail needs PLUS the per-service open counts the category ranker aggregates.
// All reads/writes are wrapped so a disabled or quota-full localStorage degrades
// to "no recents / no usage data" rather than throwing (B-010).

import type { Category } from './api';

export const OPEN_LOG_KEY = 'homepad.openLog';
// Deprecated cap#3 key — migrated to OPEN_LOG_KEY on first read, then removed.
export const LEGACY_RECENT_KEY = 'homepad.recentlyOpened';
export const SORT_MODE_KEY = 'homepad.sortMode';
export const SORT_RANK_AT_KEY = 'homepad.sortRankAt';
export const CATEGORY_ORDER_KEY = 'homepad.categoryOrder';

// The chip rail shows the 8 most-recent unique services.
export const MAX_RECENT = 8;
// Hard cap on the stored log so a heavy user's localStorage stays bounded.
export const MAX_LOG = 500;
// The rolling usage window: entries older than this are pruned on write and
// ignored by the ranker.
export const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const RE_RANK_INTERVAL_MS = 24 * 60 * 60 * 1000;

// A custom DOM event the row subscribes to, so a click anywhere updates it
// without a React prop drill or context change.
export const OPENED_EVENT = 'homepad:opened';

export type OpenEntry = { id: string; t: number }; // t = ms since epoch
export type SortMode = 'auto' | 'custom';

// A structurally-valid entry: a string id and a finite numeric timestamp.
function isEntry(v: unknown): v is OpenEntry {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as OpenEntry).id === 'string' &&
    typeof (v as OpenEntry).t === 'number' &&
    Number.isFinite((v as OpenEntry).t)
  );
}

// One-time migration: an existing cap#3 string[] under LEGACY_RECENT_KEY (and no
// openLog yet) becomes OpenEntry[] with t=now for every id (they read as "opened
// just now" — acceptable per §6.1). The old key is then removed. Failures are
// swallowed — a broken migration must not break the dashboard.
function migrateLegacy(): OpenEntry[] | null {
  try {
    if (localStorage.getItem(OPEN_LOG_KEY) != null) return null;
    const raw = localStorage.getItem(LEGACY_RECENT_KEY);
    if (raw == null) return null;
    const ids: unknown = JSON.parse(raw);
    const now = Date.now();
    const log = Array.isArray(ids)
      ? ids.filter((x): x is string => typeof x === 'string').map((id) => ({ id, t: now }))
      : [];
    localStorage.setItem(OPEN_LOG_KEY, JSON.stringify(log));
    localStorage.removeItem(LEGACY_RECENT_KEY);
    return log;
  } catch {
    return null;
  }
}

// Read the full open log, newest-first. Runs the legacy migration on first read.
// Returns [] for missing, malformed, or non-array values, and [] if storage is
// unavailable. Malformed individual entries are dropped.
export function loadOpenLog(): OpenEntry[] {
  try {
    const migrated = migrateLegacy();
    if (migrated) return migrated;
    const raw = localStorage.getItem(OPEN_LOG_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

// Record an open: drop any prior occurrence of `id`, prepend a fresh timestamped
// entry, prune entries older than the 30-day window, then cap at MAX_LOG. Persist
// and announce so a mounted row refreshes. Writes fail silently if storage is
// unavailable (private mode / quota) — the dashboard is unaffected.
export function recordOpen(id: string): void {
  try {
    const now = Date.now();
    const cutoff = now - WINDOW_MS;
    const next = [{ id, t: now }, ...loadOpenLog().filter((e) => e.id !== id)]
      .filter((e) => e.t >= cutoff)
      .slice(0, MAX_LOG);
    localStorage.setItem(OPEN_LOG_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(OPENED_EVENT, { detail: { id } }));
  } catch {
    // storage unavailable (private mode / quota) — silent, the dashboard is fine
  }
}

// The chip rail's view: the 8 most-recent unique service ids, newest-first. The
// log is deduped on write, but we dedup again defensively so a hand-tampered log
// never renders duplicate chips.
export function loadRecent(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of loadOpenLog()) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e.id);
    if (out.length >= MAX_RECENT) break;
  }
  return out;
}

// Clear the open log and announce so the row hides immediately (B-007).
export function clearRecent(): void {
  try {
    localStorage.removeItem(OPEN_LOG_KEY);
  } catch {
    // ignore — nothing to do if storage is unavailable
  }
  window.dispatchEvent(new CustomEvent(OPENED_EVENT));
}

// ── Sort-mode preference (Arrange-mode Auto/Custom toggle, C-006) ────────────

// Absent = 'auto' (usage-priority is the smart default).
export function loadSortMode(): SortMode {
  try {
    return localStorage.getItem(SORT_MODE_KEY) === 'custom' ? 'custom' : 'auto';
  } catch {
    return 'auto';
  }
}

export function setSortMode(mode: SortMode): void {
  try {
    if (mode === 'custom') localStorage.setItem(SORT_MODE_KEY, 'custom');
    else localStorage.removeItem(SORT_MODE_KEY);
  } catch {
    // ignore
  }
}

// "Reset to auto order" (C-007) — same as setSortMode('auto').
export function clearSortMode(): void {
  setSortMode('auto');
}

// ── Re-rank gate (24h cap, C-004) ────────────────────────────────────────────

// ms-epoch of the last re-rank. 0 (absent / unreadable) means "never ranked" →
// the gate lets the first mount re-rank.
export function loadSortRankAt(): number {
  try {
    const raw = localStorage.getItem(SORT_RANK_AT_KEY);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function setSortRankAt(t: number): void {
  try {
    localStorage.setItem(SORT_RANK_AT_KEY, String(t));
  } catch {
    // ignore
  }
}

// ── Cached ranked category order ─────────────────────────────────────────────

export function loadCategoryOrder(): string[] {
  try {
    const raw = localStorage.getItem(CATEGORY_ORDER_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function saveCategoryOrder(ids: string[]): void {
  try {
    localStorage.setItem(CATEGORY_ORDER_KEY, JSON.stringify(ids));
  } catch {
    // ignore
  }
}

// Re-export Category-shaped helper so callers importing the storage layer have
// the type they need without a second import path. (No runtime cost.)
export type { Category };
