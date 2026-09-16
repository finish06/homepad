import { useCallback, useEffect, useRef, useState } from 'react';
import { setUptimeDisplayPref } from '../api';

// cap6 v2 — per-user visibility of the per-tile uptime sparkline.
//
// v1 shipped this as a GLOBAL admin System setting. v2 reverses that: the toggle
// is a frontend render gate (D2), not data suppression, so the shared Gatus
// instance and the poller are untouched either way and the choice is the
// viewer's. See specs/cap6-uptime-display-toggle.md §2.
//
// Persistence: PER USER, SERVER-SIDE. The account's `showUptimeDisplay`
// (GET /api/me) is the source of truth and wins on every resolve; localStorage
// is ONLY a first-paint cache so the sparklines do not flash in before the
// preference arrives (AC-023).
//
// `system_settings.show_uptime_display` still exists, but it is now the DEFAULT
// FOR NEW ACCOUNTS, applied once by the server at account creation — not a live
// override. Nothing here reads it.
//
// As with healthBarPref (and unlike tileDensity, which is fire-and-forget), a
// failed write ROLLS BACK: AC-022 follows the setFavorite/setLayout shape.

export const DEFAULT_SHOW_UPTIME_DISPLAY = true;

const STORAGE_KEY = 'homepad:show-uptime-display';

// loadUptimeDisplayPref reads the cached preference, falling back to the default for
// an empty or malformed value, or when storage is unavailable (private-mode throw).
export function loadUptimeDisplayPref(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return DEFAULT_SHOW_UPTIME_DISPLAY;
  } catch {
    return DEFAULT_SHOW_UPTIME_DISPLAY;
  }
}

// saveUptimeDisplayPref caches the choice; a storage throw is swallowed (the
// in-memory state still updates, so the toggle works for the session).
export function saveUptimeDisplayPref(show: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, show ? 'true' : 'false');
  } catch {
    /* storage unavailable — session-only is an acceptable degradation */
  }
}

// useUptimeDisplayPref resolves visibility as: server preference (when known) →
// device cache → default. `serverPref` is the account's showHealthBar from
// /api/me; it usually arrives after mount, so the hook adopts it whenever it
// changes and mirrors it into the cache.
export function useUptimeDisplayPref(serverPref?: boolean): [boolean, (show: boolean) => void] {
  const [show, setShow] = useState<boolean>(() =>
    typeof serverPref === 'boolean' ? serverPref : loadUptimeDisplayPref(),
  );

  // The live value, readable synchronously from the setter without making the
  // state updater impure. React may invoke an updater twice (StrictMode); doing
  // the cache write and the PATCH inside one would double-fire the request.
  const showRef = useRef(show);

  useEffect(() => {
    if (typeof serverPref !== 'boolean') return;
    showRef.current = serverPref;
    setShow(serverPref);
    saveUptimeDisplayPref(serverPref);
  }, [serverPref]);

  const set = useCallback((next: boolean) => {
    const prev = showRef.current;
    if (prev === next) return;

    // Optimistic: state and cache move first so the panel responds instantly.
    showRef.current = next;
    setShow(next);
    saveUptimeDisplayPref(next);

    void (async () => {
      let ok: boolean;
      try {
        ok = await setUptimeDisplayPref(next);
      } catch {
        ok = false;
      }
      // AC-010 — a false (400 invalid, 401 no session) or a thrown network
      // error reverts both state and cache to what the server still holds, so
      // the toggle never lies about what was persisted.
      if (!ok) {
        showRef.current = prev;
        setShow(prev);
        saveUptimeDisplayPref(prev);
      }
    })();
  }, []);

  return [show, set];
}
