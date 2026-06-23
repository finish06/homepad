# Spec: Sparkline Dot Hover Tooltip — Capability #4

**Version:** 0.1.0
**Created:** 2026-06-23
**Author:** Walt (product lead)
**Status:** Ready for implementation
**Repo:** `Code/homepad` (frontend only — no backend changes)
**Estimate:** ~30 minutes
**Depends on:** Uptime sparkline (shipped), v14 status summary bar (pending fix)

---

## 1. Overview

The uptime sparkline (shipped) draws a strip of ≤20 colored dots — one per historical
Gatus check result. The `UptimeCheck.timestamp` field was included in the data model
specifically "reserved for a future hover/tooltip detail" (`src/api.ts:20`). This
feature activates that data.

When a user hovers a sparkline dot they get a brief tooltip showing:
- The **check timestamp** (formatted, readable)
- Whether that check **passed or failed**

No API change required. No backend change required. The timestamps are already in
every `GET /api/services` response.

### User story

As a homelab user scanning my dashboard, when I see a red dot in a sparkline, I want
to hover it and see exactly when that failure happened, so I can correlate it with
something I was doing at that time (a deploy, a restart, a network change).

---

## 2. Acceptance Criteria

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-001 | Hovering any dot in the `UptimeSparkline` component reveals a tooltip showing the check timestamp and its pass/fail result. | Must |
| AC-002 | The timestamp is formatted in the user's local time zone as **"MMM D, HH:MM"** (e.g. "Jun 23, 04:10"). UTC offset is not displayed — local time is more useful at a glance. | Must |
| AC-003 | The tooltip body shows the result as **"✓ Passed"** (green dot) or **"✗ Failed"** (red dot), consistent with the dot color. | Must |
| AC-004 | The tooltip appears without a click — hover-on-desktop only. On a touch device (no hover capability), the tooltip is never shown; the dot remains as-is. Touch users are not harmed by a broken tooltip flicker. | Must |
| AC-005 | The tooltip does not obscure other tiles or overflow the viewport. It appears above the dot by default; if the tile is near the top of the viewport, the tooltip flips below. | Should |
| AC-006 | The tooltip is **keyboard-accessible**: when a dot receives `:focus-visible` (tab navigation), the tooltip appears. | Should |
| AC-007 | Removing the mouse from the dot (mouseout / blur) dismisses the tooltip. No delay is required — it can dismiss immediately. | Must |
| AC-008 | Each dot in a sparkline that has no timestamp (defensive: `timestamp` is absent or empty string) shows no tooltip rather than a malformed one. | Must |
| AC-009 | Dots continue to render and the sparkline label continues to display correctly when tooltips are present — they are purely additive. | Must |
| AC-010 | The tooltip is visible in both **light and dark mode** — it uses the existing neutral surface tokens (`bg-neutral-800 text-white` / dark-mode inversion via `dark:` prefix, or a light surface with border in light mode). | Must |
| AC-011 | Each dot gets an `aria-label` describing its result and timestamp (e.g. `"Passed – Jun 23, 04:10"`), since the dot container is currently `aria-hidden`. Removing `aria-hidden` from the container and adding per-dot labels is the cleanest approach. | Should |

---

## 3. User Test Cases

### TC-001: Hover a passing dot
**Precondition:** Dashboard loaded, tile has a sparkline with ≥1 green dot.
1. Hover a green dot.
**Expected:** Tooltip appears above the dot showing "✓ Passed" and a timestamp.

### TC-002: Hover a failing dot
**Precondition:** Dashboard loaded, tile has a sparkline with ≥1 red dot.
1. Hover a red dot.
**Expected:** Tooltip appears above the dot showing "✗ Failed" and a timestamp.

### TC-003: Mouse away dismisses immediately
1. Hover a dot (tooltip appears).
2. Move mouse off the dot.
**Expected:** Tooltip disappears.

### TC-004: Dark mode
**Precondition:** Dark mode enabled.
1. Hover any sparkline dot.
**Expected:** Tooltip is readable on the dark background — light-on-dark surface.

### TC-005: Touch device — no tooltip flicker
**Precondition:** Mobile viewport (390px, touch emulation).
1. Tap a dot.
**Expected:** No tooltip flickers into view. The tap/click passes through normally.

---

## 4. Implementation Guidance for Stitch

### Where to make changes

All changes are in `src/Catalog.tsx`, inside the `UptimeSparkline` function
(lines 864–886). No other file needs editing.

### Approach: React state-based tooltip

A CSS `title` attribute is the fallback, but it doesn't support styling (dark mode,
custom colors). Use a small React state pattern instead:

```tsx
const [tooltip, setTooltip] = useState<{ idx: number; x: number; y: number } | null>(null);
```

On `onMouseEnter` of each dot, set `tooltip` with the dot index + cursor position.
On `onMouseLeave`, set `null`. Render the tooltip as an absolutely-positioned `div`
inside a `relative` wrapper around the dot row, using the `x`/`y` to position it.

Keep it minimal — tooltip `div` floats above the dot row (`bottom: 100%`, adjusted
by x offset), with a brief content string like:
```
✓ Passed
Jun 23, 04:10
```

### Timestamp formatting

Use the browser's built-in `Intl.DateTimeFormat` or a simple `Date` parse:

```ts
function fmtTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  });
}
```

This uses the user's local time zone automatically.

### Touch guard

Wrap the hover handlers in a check:

```tsx
const canHover = window.matchMedia('(hover: hover)').matches;
// only attach onMouseEnter if canHover
```

Or simply rely on `@media (hover: hover)` in CSS to hide the tooltip on touch
screens. Both approaches work; the CSS-only approach is simpler.

### Dark mode tooltip surface

Light mode: `bg-neutral-800 text-white rounded px-2 py-1 text-xs shadow-md`  
Dark mode: same (dark tooltip reads well on the dark page background too, and avoids
a light flash). Use a single class string; no dark: prefix needed for this element.

### aria-label per dot

Remove the `aria-hidden="true"` from the dot row `<div>` and add `aria-label` to each
`<span>`:

```tsx
<span
  aria-label={`${c.success ? 'Passed' : 'Failed'} – ${fmtTimestamp(c.timestamp)}`}
  ...
/>
```

Screen readers will then enumerate the dots as "Passed – Jun 23, 04:10", etc.

---

## 5. Test plan

Stitch should add/extend tests in the existing `src/Catalog.test.tsx` (or a new
`src/UptimeSparkline.test.tsx` if the component is extracted):

| Test | Description |
|------|-------------|
| T-001 | Dot `aria-label` contains formatted timestamp and "Passed"/"Failed" |
| T-002 | Tooltip appears on `mouseenter`, disappears on `mouseleave` |
| T-003 | Dots with empty/missing `timestamp` render with no tooltip content (no crash) |
| T-004 | Sparkline label still renders correctly alongside tooltip state |

---

## 6. Out of Scope

- **Click-to-pin tooltip** — hover-only is enough for now
- **Latency / response time** — not in the API data; deferred if Gatus exposes it
- **Tooltip on the uptime label** ("85% / 20 checks") — not needed
- **Animated tooltip enter/exit** — static appearance is fine
- **DEGRADED state in tooltip** — sparkline dots are boolean pass/fail; no amber state

---

## 7. Revision History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-06-23 | 0.1.0 | Walt | Initial spec — grounded in api.ts UptimeCheck type and Catalog.tsx UptimeSparkline component (lines 864–886) |
