// Polling loop for release awareness (see releaseCheck.ts for the mechanism).
//
// Cadence: one check on mount, then every 5 minutes, plus an immediate check
// whenever the tab becomes visible again — a wall-mounted dashboard or a
// backgrounded PWA tab learns about a release the moment someone looks at it,
// not up to 5 minutes later. Once a newer build is seen the result latches;
// there is no un-seeing a release short of reloading into it.
import { useEffect, useState } from 'react';
import { fetchVersionInfo, isNewRelease, type VersionInfo } from './releaseCheck';

export const RELEASE_CHECK_INTERVAL_MS = 5 * 60_000;

export function useReleaseCheck(currentSha: string): VersionInfo | null {
  const [next, setNext] = useState<VersionInfo | null>(null);

  useEffect(() => {
    // Local dev never has a meaningful sha to compare — skip the loop entirely.
    if (currentSha === 'dev') return;
    let cancelled = false;

    async function check() {
      const info = await fetchVersionInfo();
      if (!cancelled && isNewRelease(currentSha, info)) setNext(info);
    }

    const id = setInterval(check, RELEASE_CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    void check();

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [currentSha]);

  return next;
}
