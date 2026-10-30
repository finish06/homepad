// SPEC-kid-accounts UX §3 Devices — the small, pure formatting rules behind each
// device row: what the device is ("iPad · Safari", from its user agent), when it
// signed in ("Oct 22") and when it was last used ("2h ago").
//
// The user agent is a hint, not an identity. iPadOS Safari in its default
// "desktop" mode reports itself as a Mac, so such an iPad reads "Mac · Safari";
// that is the honest reading of what the server was told.

const DEVICES: [RegExp, string][] = [
  [/iPad/, 'iPad'],
  [/iPhone|iPod/, 'iPhone'],
  [/Android/, 'Android'],
  [/Macintosh|Mac OS X/, 'Mac'],
  [/Windows/, 'Windows'],
  [/CrOS/, 'Chromebook'],
  [/Linux|X11/, 'Linux'],
];

// Order matters: Edge and the iOS wrappers also say "Chrome"/"Safari".
const BROWSERS: [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, 'Edge'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/CriOS\/|Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

export function describeDevice(userAgent: string): string {
  const device = DEVICES.find(([re]) => re.test(userAgent))?.[1];
  if (!device) return 'Unknown device';
  const browser = BROWSERS.find(([re]) => re.test(userAgent))?.[1];
  return browser ? `${device} · ${browser}` : device;
}

// formatAgo — "just now" under a minute (and for a time slightly in the future,
// i.e. clock skew), then whole minutes, hours and days.
export function formatAgo(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'never';
  const s = Math.floor((now - t) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// formatDay — a short date such as "Oct 22", in the viewer's locale.
export function formatDay(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// possessive — "Maya" → "Maya's". The straight apostrophe matches the UX §4
// copy verbatim.
export function possessive(name: string): string {
  return `${name}'s`;
}
