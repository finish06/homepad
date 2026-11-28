import { useCallback, useEffect, useRef, useState } from 'react';
import { saveHiddenWidgets } from './widgetsInfo';
import { legacyHidden, normalizeHidden, type WidgetKey } from './visibleWidgets';

// SPEC-health-widget §4.4 — the person's hidden widgets. It replaces
// healthBarPref.ts and showWidgetsPref.ts and keeps their shape:
//
// - the account's hiddenWidgets (GET /api/me) wins on every resolve;
// - localStorage `homepad:hidden-widgets` is only a first-paint cache, and is
//   read only when its user matches (the key is per device, not per person);
// - a failed PATCH rolls the state and the cache back to the stored list, so a
//   switch never claims a value the server doesn't hold (AC-017).
//
// With no new cache yet, the first paint seeds from the two old per-device
// keys, so the first paint after the upgrade matches the last one; they are
// removed once the new cache is written (AC-016).

export const CACHE_KEY = 'homepad:hidden-widgets';
const OLD_HEALTH_BAR_KEY = 'homepad:show-health-bar';
const OLD_SHOW_WIDGETS_KEY = 'homepad:show-widgets';

// The account as /api/me gives it. hiddenWidgets is missing from an 18.7 API
// (§4.3 rollout order); its old fields then say the same thing.
export type HiddenWidgetsAccount = {
  id: string;
  role: string;
  hiddenWidgets?: unknown;
  showHealthBar?: boolean;
  showWidgets?: boolean;
};

// fromAccount is the account's list, or null when the account says nothing.
function fromAccount(a: HiddenWidgetsAccount): WidgetKey[] | null {
  if (Array.isArray(a.hiddenWidgets)) return normalizeHidden(a.hiddenWidgets);
  if (typeof a.showHealthBar === 'boolean' || typeof a.showWidgets === 'boolean') {
    return legacyHidden(a.role, a.showHealthBar, a.showWidgets);
  }
  return null;
}

function readOldKey(key: string): boolean | undefined {
  const raw = localStorage.getItem(key);
  return raw === 'false' ? false : raw === 'true' ? true : undefined;
}

// loadCached is the first-paint list for this person: their cache, else the
// old keys, else the defaults (a kid hides health, an adult hides nothing).
// A storage throw falls back to the defaults.
export function loadCached(userId: string, role: string): WidgetKey[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const v = JSON.parse(raw) as { v?: number; user?: string; hidden?: unknown };
      if (v?.v === 1 && v.user === userId && Array.isArray(v.hidden)) return normalizeHidden(v.hidden);
    }
    // The old keys were per device, not per person. A kid never reads them:
    // on a shared device they may be an adult's choice.
    if (role === 'kid') return legacyHidden(role);
    return legacyHidden(role, readOldKey(OLD_HEALTH_BAR_KEY), readOldKey(OLD_SHOW_WIDGETS_KEY));
  } catch {
    return legacyHidden(role);
  }
}

function cache(userId: string, hidden: readonly WidgetKey[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ v: 1, user: userId, hidden }));
    localStorage.removeItem(OLD_HEALTH_BAR_KEY);
    localStorage.removeItem(OLD_SHOW_WIDGETS_KEY);
  } catch {
    /* storage unavailable — session-only is fine */
  }
}

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((k, i) => k === b[i]);

export function useHiddenWidgetsPref(account: HiddenWidgetsAccount): [WidgetKey[], (next: readonly string[]) => void] {
  const server = fromAccount(account);
  const serverKey = server ? server.join(',') : null;
  const [hidden, setHidden] = useState<WidgetKey[]>(() => server ?? loadCached(account.id, account.role));
  // The live value, readable synchronously from the setter, so the PATCH is
  // never sent from inside a state updater (StrictMode runs those twice).
  const ref = useRef(hidden);
  // What the server is known to hold, which a failed save goes back to, and
  // the number of the latest save: only the latest one may roll back, so an
  // older save failing after a newer one landed can't undo it.
  const stored = useRef(hidden);
  const latest = useRef(0);

  useEffect(() => {
    if (serverKey === null) return;
    const list = normalizeHidden(serverKey ? serverKey.split(',') : []);
    ref.current = list;
    stored.current = list;
    setHidden((cur) => (same(cur, list) ? cur : list));
    cache(account.id, list);
  }, [serverKey, account.id]);

  const set = useCallback(
    (nextRaw: readonly string[]) => {
      const next = normalizeHidden(nextRaw);
      if (same(ref.current, next)) return;
      const seq = ++latest.current;
      const apply = (v: WidgetKey[]) => {
        ref.current = v;
        setHidden(v);
        cache(account.id, v);
      };
      // Optimistic: the widget and the switch move at once.
      apply(next);
      void (async () => {
        let ok: boolean;
        try {
          ok = await saveHiddenWidgets(next);
        } catch {
          ok = false;
        }
        if (ok) {
          stored.current = next;
          return;
        }
        // AC-017 — a refusal or a network error puts back what the server
        // still holds, unless a newer save has been made since.
        if (seq === latest.current) apply(stored.current);
      })();
    },
    [account.id],
  );

  return [hidden, set];
}
