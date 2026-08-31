// SPEC-v15-design-system §2/§3.6 — the personal ACCENT preference (the "chrome"
// hue, one of the two v15 colour axes). The accent drives *personality only* —
// the wordmark/avatar gradient, focus rings, the ambient field tint and the
// glass edges — and NEVER body text, tile identity or status, so a user can pick
// any of the eight accents in either mode without moving a single WCAG-measured
// contrast (§2, the accent-proof rule).
//
// v15 applies the accent by setting `data-theme` on <html>; the stylesheet's
// `[data-theme="…"]` blocks own every colour value (including the `--accent-1/2`
// RGB-triplet vars the .app-surface ambient blobs read). Deliberately CLIENT-ONLY
// (localStorage), mirroring the Edit-mode precedent — no API/schema change, and a
// stale device simply shows the default accent.
//
// Migration from v14 (SPEC §3.6): v14 offered seven ROYGBIV accents
// (red/orange/yellow/green/blue/indigo/violet). v15 offers eight — it ADDS teal +
// pink and CONSOLIDATES indigo+violet into purple. A stored indigo/violet maps to
// purple; anything unrecognised degrades to the new default, blue.

export type AccentId =
  | 'blue'
  | 'teal'
  | 'green'
  | 'yellow'
  | 'orange'
  | 'red'
  | 'pink'
  | 'purple';

export const ACCENT_CACHE_KEY = 'homepad.accent';

// Blue is the v15 default (§3.6).
export const DEFAULT_ACCENT: AccentId = 'blue';

// The eight accents in spec order (§3.6 table / the mockup swatch row). `swatch`
// is the picker button fill — the `--c` value from the spec. The full token set
// (accent/-2/-3, ambient, field bg) lives in index.css keyed on `[data-theme]`,
// so this list stays a thin id/label/swatch registry.
export const ACCENTS: { id: AccentId; label: string; swatch: string }[] = [
  { id: 'blue', label: 'Blue', swatch: '#4a90ff' },
  { id: 'teal', label: 'Teal', swatch: '#22c4bc' },
  { id: 'green', label: 'Green', swatch: '#22c67d' },
  { id: 'yellow', label: 'Yellow', swatch: '#ffc72e' },
  { id: 'orange', label: 'Orange', swatch: '#ff8a3d' },
  { id: 'red', label: 'Red', swatch: '#ff5a5c' },
  { id: 'pink', label: 'Pink', swatch: '#ff5ca0' },
  { id: 'purple', label: 'Purple', swatch: '#9b7cff' },
];

// Retired v14 accents and where they land in v15 (§3.6). indigo + violet both
// consolidate into purple; everything else that isn't a current id degrades to
// the default in resolveAccent.
const LEGACY_MAP: Record<string, AccentId> = {
  indigo: 'purple',
  violet: 'purple',
};

export function isAccentId(v: unknown): v is AccentId {
  return typeof v === 'string' && ACCENTS.some((a) => a.id === v);
}

// resolveAccent picks the boot accent from the cache: a current id is kept, a
// retired v14 id is migrated (§3.6), and anything else degrades to blue.
export function resolveAccent(cache: string | null): AccentId {
  if (isAccentId(cache)) return cache;
  if (typeof cache === 'string' && cache in LEGACY_MAP) return LEGACY_MAP[cache];
  return DEFAULT_ACCENT;
}

// applyAccent mirrors the chosen accent onto <html> as `data-theme`, which the
// stylesheet's `[data-theme]` blocks resolve into the full token set.
export function applyAccent(id: AccentId): void {
  document.documentElement.setAttribute('data-theme', id);
}

// initAccent applies the cached preference at boot (called once from main.tsx,
// before first paint of the React tree). localStorage can throw in hardened
// contexts — degrade to the default silently. A retired v14 value is migrated.
export function initAccent(): AccentId {
  let cached: string | null = null;
  try {
    cached = window.localStorage.getItem(ACCENT_CACHE_KEY);
  } catch {
    /* private mode / blocked storage — default */
  }
  const id = resolveAccent(cached);
  applyAccent(id);
  return id;
}

// setAccent = apply + persist. Persistence failure is non-fatal (the accent
// still applies for this session).
export function setAccent(id: AccentId): void {
  applyAccent(id);
  try {
    window.localStorage.setItem(ACCENT_CACHE_KEY, id);
  } catch {
    /* non-fatal */
  }
}
