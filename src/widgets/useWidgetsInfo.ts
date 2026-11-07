import { useCallback, useEffect, useState } from 'react';
import { fetchWidgetsInfo, type WidgetsInfo } from './widgetsInfo';

// SPEC-status-widgets §10 — read /api/widgets/info on load and every 5 minutes
// while the tab is visible. A failed re-read keeps the last good info, so the
// strip never flickers off over one dropped request. `reload` lets the Admin
// Panel show a saved change at once.
const INFO_POLL_MS = 5 * 60_000;

export function useWidgetsInfo(): [WidgetsInfo | null, () => void] {
  const [info, setInfo] = useState<WidgetsInfo | null>(null);
  const reload = useCallback(() => {
    void fetchWidgetsInfo().then((i) => {
      if (i) setInfo(i);
    });
  }, []);
  useEffect(() => {
    reload();
    const id = setInterval(() => {
      if (document.visibilityState !== 'hidden') reload();
    }, INFO_POLL_MS);
    return () => clearInterval(id);
  }, [reload]);
  return [info, reload];
}
