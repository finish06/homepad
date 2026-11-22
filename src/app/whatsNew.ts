// #590 — What's new (the changelog overlay) opens on its own once, on the
// first load after an upgrade. specs/v15-version-changelog.md defines only the
// footer click (AC-005, AC-008), so this follows the rule agreed for 18.0.1:
//
// - This browser remembers the last version it showed What's new for.
// - When the running version is newer than that, it opens once and the
//   record moves up, so a reload doesn't open it again.
// - A browser with no record (a new device, cleared storage) records the
//   running version without opening: nothing was upgraded from its view.
//
// localStorage only, per browser: it is a nudge, not account state. Storage
// that throws (private mode) never opens it.

export const WHATS_NEW_KEY = 'homepad:whats-new-seen';

// Major.minor.patch; anything after (a -beta suffix) is ignored.
function parse(v: string): number[] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function isNewerVersion(a: string, b: string): boolean {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return false;
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] > pb[i];
  return false;
}

export function shouldOpenWhatsNew(running: string): boolean {
  try {
    const seen = localStorage.getItem(WHATS_NEW_KEY);
    const known = seen !== null && parse(seen) !== null;
    if (known && !isNewerVersion(running, seen)) return false;
    localStorage.setItem(WHATS_NEW_KEY, running);
    return known;
  } catch {
    return false;
  }
}
