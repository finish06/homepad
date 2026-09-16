import { useCallback, useEffect, useRef, useState } from 'react';
import { setHealthBarPref } from '../api';

// SPEC-health-bar-visibility-toggle — per-user visibility of the health panel's
// distribution bar (the proportional up / not-monitored / down element). The
// verdict line, LED and freshness stamp are never affected by this preference.
//
// Persistence (spec §3 OQ-2, resolved 2026-09-15): PER USER, SERVER-SIDE. The
// account's `showHealthBar` (GET /api/me) is the source of truth and wins on
// every resolve; localStorage is ONLY a first-paint cache so a user who hid the
// bar does not watch it render and vanish on every cold load. AC-011 is a Must,
// so the cache is a requirement here, not an optimisation.
//
// Divergence from tileDensity.ts, deliberate: that module is fire-and-forget on
// write ("the device cache already holds the choice"). AC-010 requires the
// opposite — a failed write must ROLL BACK to the persisted value, matching
// setFavorite/setLayout. Optimistic update, revert on a false or a throw.

export const DEFAULT_SHOW_HEALTH_BAR = true;

const STORAGE_KEY = 'homepad:show-health-bar';

// loadHealthBarPref reads the cached preference, falling back to the default for
// an empty or malformed value, or when storage is unavailable (private-mode throw).
export function loadHealthBarPref(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return DEFAULT_SHOW_HEALTH_BAR;
  } catch {
    return DEFAULT_SHOW_HEALTH_BAR;
  }
}

// saveHealthBarPref caches the choice; a storage throw is swallowed (the
// in-memory state still updates, so the toggle works for the session).
export function saveHealthBarPref(show: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, show ? 'true' : 'false');
  } catch {
    /* storage unavailable — session-only is an acceptable degradation */
  }
}

// useHealthBarPref resolves visibility as: server preference (when known) →
// device cache → default. `serverPref` is the account's showHealthBar from
// /api/me; it usually arrives after mount, so the hook adopts it whenever it
// changes and mirrors it into the cache.
export function useHealthBarPref(serverPref?: boolean): [boolean, (show: boolean) => void] {
  const [show, setShow] = useState<boolean>(() =>
    typeof serverPref === 'boolean' ? serverPref : loadHealthBarPref(),
  );

  // The live value, readable synchronously from the setter without making the
  // state updater impure. React may invoke an updater twice (StrictMode); doing
  // the cache write and the PATCH inside one would double-fire the request.
  const showRef = useRef(show);

  useEffect(() => {
    if (typeof serverPref !== 'boolean') return;
    showRef.current = serverPref;
    setShow(serverPref);
    saveHealthBarPref(serverPref);
  }, [serverPref]);

  const set = useCallback((next: boolean) => {
    const prev = showRef.current;
    if (prev === next) return;

    // Optimistic: state and cache move first so the panel responds instantly.
    showRef.current = next;
    setShow(next);
    saveHealthBarPref(next);

    void (async () => {
      let ok: boolean;
      try {
        ok = await setHealthBarPref(next);
      } catch {
        ok = false;
      }
      // AC-010 — a false (400 invalid, 401 no session) or a thrown network
      // error reverts both state and cache to what the server still holds, so
      // the toggle never lies about what was persisted.
      if (!ok) {
        showRef.current = prev;
        setShow(prev);
        saveHealthBarPref(prev);
      }
    })();
  }, []);

  return [show, set];
}
