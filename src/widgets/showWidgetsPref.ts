import { useCallback, useEffect, useRef, useState } from 'react';
import { saveShowWidgets } from './widgetsInfo';

// SPEC-status-widgets AC-031 — "Show widgets", per user, on by default. The
// same shape as useHealthBarPref: the account value (GET /api/me) wins on every
// resolve, localStorage is only a first-paint cache, and a failed write rolls
// back so the switch never claims a value the server doesn't hold.

const KEY = 'homepad:show-widgets';

export function loadShowWidgetsPref(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'false';
  } catch {
    return true;
  }
}

function cache(show: boolean) {
  try {
    localStorage.setItem(KEY, String(show));
  } catch {
    /* storage unavailable — session-only is fine */
  }
}

export function useShowWidgetsPref(serverPref?: boolean): [boolean, (show: boolean) => void] {
  const [show, setShow] = useState(() => (typeof serverPref === 'boolean' ? serverPref : loadShowWidgetsPref()));
  const ref = useRef(show);

  useEffect(() => {
    if (typeof serverPref !== 'boolean') return;
    ref.current = serverPref;
    setShow(serverPref);
    cache(serverPref);
  }, [serverPref]);

  const set = useCallback((next: boolean) => {
    const prev = ref.current;
    if (prev === next) return;
    const apply = (v: boolean) => {
      ref.current = v;
      setShow(v);
      cache(v);
    };
    apply(next);
    void saveShowWidgets(next).then((ok) => {
      if (!ok) apply(prev);
    });
  }, []);

  return [show, set];
}
