import { useCallback, useEffect, useState } from 'react';
import { fetchWidgetsInfo, type WidgetsInfo } from './widgetsInfo';
import type { Household } from './visibleWidgets';

// SPEC-status-widgets §10 — read /api/widgets/info on load and every 5 minutes
// while the tab is visible. A failed re-read keeps the last good info, so the
// widgets never flicker off over one dropped request. `reload` lets the Admin
// Panel show a saved change at once.
const INFO_POLL_MS = 5 * 60_000;

// SPEC-health-widget §4.4 — the household's three switches, cached per device
// so the first paint draws the same widget slots the last load did (#745). It
// is read in a state initializer, never in index.html's inline script, so the
// CSP script hash does not change (AC-031).
export const HOUSEHOLD_KEY = 'homepad:widgets-household';

// With no cache: clock and weather off, health on. That is 18.7's first paint
// (the strip waited for the read; health drew at once).
export const DEFAULT_HOUSEHOLD: Household = { clock: false, weather: false, health: true };

export function loadHousehold(): Household {
  try {
    const raw = localStorage.getItem(HOUSEHOLD_KEY);
    if (!raw) return DEFAULT_HOUSEHOLD;
    const v = JSON.parse(raw) as Partial<Household> & { v?: number };
    if (v?.v !== 1) return DEFAULT_HOUSEHOLD;
    return {
      clock: v.clock === true,
      weather: v.weather === true,
      // Only a cached false hides health; anything else keeps it (AC-018).
      health: v.health !== false,
      hour12: typeof v.hour12 === 'boolean' ? v.hour12 : null,
    };
  } catch {
    return DEFAULT_HOUSEHOLD;
  }
}

function saveHousehold(h: Household) {
  try {
    localStorage.setItem(HOUSEHOLD_KEY, JSON.stringify({ v: 1, ...h }));
  } catch {
    /* storage unavailable — the next load starts from the defaults */
  }
}

// householdOf reads the three switches from a good info read. An info with no
// health key comes from an older API, which has no way to turn health off.
export function householdOf(info: WidgetsInfo): Household {
  return {
    clock: info.clock.enabled,
    weather: info.weather.enabled,
    health: info.health?.enabled !== false,
    hour12: info.clock.hour12 ?? null,
  };
}

// The fourth value is whether a read has answered yet (good or not): until it
// has, the widget area holds the weather card's space; after a failed first
// read it drops the empty card rather than keep it for the session.
export function useWidgetsInfo(): [WidgetsInfo | null, () => void, Household, boolean] {
  const [info, setInfo] = useState<WidgetsInfo | null>(null);
  const [household, setHousehold] = useState<Household>(loadHousehold);
  const [answered, setAnswered] = useState(false);
  const reload = useCallback(() => {
    void fetchWidgetsInfo().then((i) => {
      setAnswered(true);
      // A failed or malformed read (null) keeps the last good value, from this
      // session or the cache, so a dropped request never hides health.
      if (!i) return;
      setInfo(i);
      const h = householdOf(i);
      setHousehold((cur) =>
        cur.clock === h.clock && cur.weather === h.weather && cur.health === h.health && cur.hour12 === h.hour12
          ? cur
          : h,
      );
      saveHousehold(h);
    });
  }, []);
  useEffect(() => {
    reload();
    const id = setInterval(() => {
      if (document.visibilityState !== 'hidden') reload();
    }, INFO_POLL_MS);
    return () => clearInterval(id);
  }, [reload]);
  return [info, reload, household, answered];
}
