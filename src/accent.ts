// Glass v2 (SPEC-glass-v2-accent) — the personal ACCENT preference. The glass
// backdrop (`.app-surface`) paints its ambient color blobs from two CSS custom
// properties (`--accent-1` / `--accent-2`, space-separated RGB triplets), so a
// user can re-hue the whole dashboard atmosphere without touching any text or
// tile token (contrast-bearing colors deliberately do NOT ride the accent).
//
// Deliberately CLIENT-ONLY, mirroring the Edit-mode precedent (client-ephemeral
// state) rather than themePref's PATCH /api/me: an accent is a per-device
// cosmetic, this keeps the pass frontend-only (no API/schema change), and a
// stale device simply shows the default brand hue. localStorage key follows the
// THEME_CACHE_KEY naming (`homepad.theme` → `homepad.accent`).

export type AccentId = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'indigo' | 'violet';

export const ACCENT_CACHE_KEY = 'homepad.accent';

// Indigo is the DEFAULT: its pair (indigo-500 + purple-500) is byte-identical
// to the pre-v2 hardcoded .app-surface blob colors (the homepad brand gradient
// family, homepad-branding/README), so "never chose an accent" renders exactly
// the brand atmosphere.
export const DEFAULT_ACCENT: AccentId = 'indigo';

// ROYGBIV, in spectrum order (Caleb's ask). Each accent is a PAIR of hues — the
// two ambient blobs use neighboring hues (like the shipped indigo→purple pair)
// so the backdrop reads as an atmosphere, not a single flat stain. `rgb` values
// are space-separated triplets consumed as `rgb(var(--accent-1) / <alpha>)`.
// `swatch` is the picker button fill (the Tailwind-500 anchor of the pair).
export const ACCENTS: { id: AccentId; label: string; a: string; b: string; swatch: string }[] = [
  { id: 'red', label: 'Red', a: '239 68 68', b: '244 63 94', swatch: '#ef4444' },
  { id: 'orange', label: 'Orange', a: '249 115 22', b: '245 158 11', swatch: '#f97316' },
  { id: 'yellow', label: 'Yellow', a: '234 179 8', b: '245 158 11', swatch: '#eab308' },
  { id: 'green', label: 'Green', a: '34 197 94', b: '16 185 129', swatch: '#22c55e' },
  { id: 'blue', label: 'Blue', a: '59 130 246', b: '14 165 233', swatch: '#3b82f6' },
  { id: 'indigo', label: 'Indigo', a: '99 102 241', b: '168 85 247', swatch: '#6366f1' },
  { id: 'violet', label: 'Violet', a: '168 85 247', b: '217 70 239', swatch: '#a855f7' },
];

export function isAccentId(v: unknown): v is AccentId {
  return typeof v === 'string' && ACCENTS.some((a) => a.id === v);
}

// resolveAccent picks the boot accent from the cache; a bad/absent value
// degrades to the default (same contract shape as theme.ts resolveBootTheme).
export function resolveAccent(cache: string | null): AccentId {
  return isAccentId(cache) ? cache : DEFAULT_ACCENT;
}

// applyAccent mirrors the chosen pair onto <html> as inline custom properties,
// overriding the :root defaults in index.css. The DEFAULT clears the inline
// override instead of restating it, so the stylesheet stays the single source
// of truth for the brand values.
export function applyAccent(id: AccentId): void {
  const root = document.documentElement;
  if (id === DEFAULT_ACCENT) {
    root.style.removeProperty('--accent-1');
    root.style.removeProperty('--accent-2');
    return;
  }
  const acc = ACCENTS.find((a) => a.id === id)!;
  root.style.setProperty('--accent-1', acc.a);
  root.style.setProperty('--accent-2', acc.b);
}

// initAccent applies the cached preference at boot (called once from main.tsx,
// before first paint of the React tree). localStorage can throw in hardened
// contexts — degrade to default silently.
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
