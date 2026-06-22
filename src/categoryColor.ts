// #90 — per-category chip color. Category chips used to render an identical
// indigo, so a large catalog read as one undifferentiated wall. We map each
// category name to a stable hue: the same category always gets the same color,
// and different categories spread across a palette of perceptually distinct
// hues — the eye can then group/scan by color.
//
// We expose only the HSL *hue* (a CSS custom property `--chip-hue`); the
// stylesheet pairs it with theme-appropriate, fixed saturation/lightness. That
// keeps WCAG-AA contrast in both light and dark mode regardless of which hue a
// category lands on, because the contrast comes from the lightness gap, not the
// hue (this is why the old #29 dark-mode fix generalises cleanly).

// A curated set of well-spaced, distinct hues (degrees). Indigo (243°, the old
// single color) stays in the set so the catalog doesn't shift wildly at once.
const HUES = [243, 200, 168, 130, 90, 45, 22, 0, 330, 288];

// djb2 string hash. Trimmed + lower-cased so "Media" and "media " share a hue.
function hash(name: string): number {
  const key = name.trim().toLowerCase();
  let h = 5381;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) + h + key.charCodeAt(i)) >>> 0;
  }
  return h;
}

// categoryHue returns the deterministic palette hue (0–359) for a category name.
export function categoryHue(name: string): number {
  return HUES[hash(name) % HUES.length];
}
