// Single source of truth for the dashboard content width (#196, AC-009).
//
// The header inner bar, the StatusBar content, and the dashboard grid section
// all consume this one token so their left edges stay aligned and the max-width
// can never diverge between layers.
//
// Width rationale, in two regimes (SPEC-ultrawide-fluid-frame, Phase 1b):
//
// - Up to ~1670px viewports the frame caps at 1536px — the #194/#196 value
//   (Tailwind's 2xl): at 1024px the grid is 4 columns => ~236px tiles, and for
//   a 6-column grid to never be NARROWER than that (AC-001) the container must
//   be >=~1528px. Nothing changes in this band.
// - Beyond that, `max(1536px, 92vw)` lets the frame grow FLUIDLY with the
//   monitor: 92vw keeps a proportional 4vw breathing margin per side, so a
//   2560px monitor gets a ~2355px frame and a 3840px (4K) monitor ~3533px
//   instead of a fixed 1536px island with ~1150px of dead margin each side.
//   The two regimes meet exactly at 92vw == 1536px (vw ~1670) — the width is
//   continuous, no breakpoint jump. The App Grid's pane-fill grow model
//   (SPEC-pane-fill-reflow R3/R4) fills the wider frame; tiles stay 190px.
//
// The JS mirror of this formula is `frameContentPx` in src/appGrid.ts — the
// lone-box (R4) bin-pack reads it. Change the two together.
export const CONTENT_WIDTH = 'mx-auto max-w-[max(1536px,92vw)] px-4';
