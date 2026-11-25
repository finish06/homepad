// SPEC-ui-quick-wins §3.1 / AC-001 — the browser chrome follows the theme.
//
// `theme-color` (the mobile address bar, the PWA title bar) takes the resolved
// page background, `--bg-1`, so the bar blends with the page (decided, §7 Q1).
// That token depends on BOTH theme axes: the `dark` class and the accent's
// `data-theme`, so ThemeProvider calls this after it toggles `dark`, and
// applyAccent calls it after it sets `data-theme`.
//
// The `<meta>` in index.html keeps a static pre-JS value. The inline theme
// script there is not touched: its sha256 is pinned in the CSP (SPEC-cleanup-
// 18.6.0 §7), so everything here lives in the bundle. `color-scheme` needs no
// JS at all; it is set in index.css on `:root` and `.dark`.
export function syncThemeColor(): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) return;
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-1').trim();
  // No stylesheet (an isolated test, a failed CSS load): keep what is there
  // rather than writing an empty colour.
  if (bg) meta.setAttribute('content', bg);
}
