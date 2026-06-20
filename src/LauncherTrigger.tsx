import { useLauncher } from './launcher';

// v8 §4.2 — the on-screen launcher affordance, placed between the v7 wordmark
// and the avatar (D6). Touch/mouse users (no keyboard) open the launcher here;
// keyboard users still get ⌘K/Ctrl+K/`/` (LauncherProvider). Desktop renders a
// pill (search glyph + "Search…" + a ⌘K/Ctrl K hint); on <640px the label/hint
// collapse to an icon-only button (§9). It reflects open-state via aria-expanded
// and advertises the chord via aria-keyshortcuts.

// Detect macOS for the hint glyph; default to "Ctrl K" when unknown (§4.2).
// Prefer the modern `navigator.userAgentData.platform` ("macOS") — the deprecated
// `navigator.platform` is emptied/farbled by privacy-hardened browsers, which is
// why a real Mac could fall through to "Ctrl K" (#82). Keep the legacy regex as a
// fallback for browsers without User-Agent Client Hints.
function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  const uaPlatform = (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform;
  if (uaPlatform) return /mac/i.test(uaPlatform);
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');
}

export default function LauncherTrigger() {
  const { open, openLauncher } = useLauncher();
  return (
    <button
      type="button"
      data-testid="launcher-trigger"
      onClick={openLauncher}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-keyshortcuts="Meta+K Control+K"
      aria-label="Open quick launcher"
      className="launcher-trigger"
    >
      <svg
        data-testid="launcher-trigger-glyph"
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="launcher-trigger-glyph"
      >
        <path
          d="M9 3a6 6 0 104.47 10.03l3.25 3.24a1 1 0 001.41-1.41l-3.24-3.25A6 6 0 009 3zm0 2a4 4 0 110 8 4 4 0 010-8z"
          fill="currentColor"
        />
      </svg>
      {/* Label + chord hint: hidden on phones (icon-only), shown at ≥640px (§9). */}
      <span data-testid="launcher-trigger-hint" className="launcher-trigger-hint hidden sm:flex">
        <span className="launcher-trigger-placeholder">Search…</span>
        <kbd className="launcher-trigger-kbd">{isMac() ? '⌘K' : 'Ctrl K'}</kbd>
      </span>
    </button>
  );
}
