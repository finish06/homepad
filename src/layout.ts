// Single source of truth for the dashboard content width (#196, AC-009).
//
// The header inner bar, the StatusBar content, and the dashboard grid section
// all consume this one token so their left edges stay aligned and the max-width
// can never diverge between layers.
//
// Width rationale (#194, AC-001): the grid uses auto-fill columns capped by this
// container. At 1024px the grid is 4 columns => ~236px tiles. For a 2560px
// monitor's 6-column grid (AC-004) to not be NARROWER than that (AC-001), the
// 6-column tile must be >=236px, which needs a content box >=1496px, i.e. a
// container of at least ~1528px. 1536px (Tailwind's 2xl) is the nearest clean
// value and yields ~237px tiles at 2560px — inversion eliminated.
export const CONTENT_WIDTH = 'mx-auto max-w-[1536px] px-4';
