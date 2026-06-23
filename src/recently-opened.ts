// Cap #3 — the "Recently opened" row's localStorage core. A per-browser,
// per-user convenience layer (no backend): the last few services the user
// actually opened, newest-first, deduped, capped. ServiceTile calls recordOpen
// on click; RecentlyOpenedRow reads loadRecent on mount and re-reads whenever
// the OPENED_EVENT fires. All reads/writes are wrapped so a disabled or
// quota-full localStorage degrades to "no recents" rather than throwing (AC-010).

export const RECENT_KEY = 'homepad.recentlyOpened';
export const MAX_RECENT = 8;
// A custom DOM event the row subscribes to, so a click anywhere updates it
// without a React prop drill or context change.
export const OPENED_EVENT = 'homepad:opened';

// Read the stored id list. Returns [] for missing, malformed, or non-array
// values, and [] if storage is unavailable.
export function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const ids: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? (ids as string[]) : [];
  } catch {
    return [];
  }
}

// Record an open: prepend `id`, drop any prior occurrence (dedup → moves an
// existing id to position 0), cap at MAX_RECENT, persist, then announce so a
// mounted row refreshes. Writes fail silently if storage is unavailable.
export function recordOpen(id: string): void {
  try {
    const next = [id, ...loadRecent().filter((x) => x !== id)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(OPENED_EVENT, { detail: { id } }));
  } catch {
    // storage unavailable (private mode / quota) — silent, the dashboard is fine
  }
}

// Clear all recents and announce so the row hides immediately (AC-005).
export function clearRecent(): void {
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {
    // ignore — nothing to do if storage is unavailable
  }
  window.dispatchEvent(new CustomEvent(OPENED_EVENT));
}
