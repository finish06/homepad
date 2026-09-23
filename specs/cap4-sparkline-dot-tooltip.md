# Spec: Sparkline Dot Hover Tooltip — Capability #4

**Version:** 1.0.0
**Created:** 2026-06-23
**Author:** Walt (product lead)
**Status:** BUILT 2026-09-22 (restored) — see §8. Originally shipped 2026-06-23 (PR #145),
lost 2026-07-02 with its host component, rebuilt on AppGrid.
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

---

## 8. As built

### 8.1 Why this spec was built twice

cap4 shipped on the day it was written: `ed867fd`, PR #145, against `UptimeSparkline`
in `src/Catalog.tsx`. Nobody updated this file's `Status:` line, which is why it was
still reading "Ready for implementation" three months later.

On **2026-07-02**, `4c7dce2` ("Revert #271 — restore App Grid on main (data-loss
merge)") brought the App Grid back as the live dashboard. `Catalog.tsx` stopped being
rendered, and the sparkline — plus this tooltip — left the product with it. That was
**collateral from reverting a bad merge, not a product decision**: there is no entry
in `DECISIONS.md`, and `specs/uptime-sparkline.md` still read "Shipped — prod".

`specs/uptime-windows.md` was written the *same day*, and opens by describing the
sparkline as present and the 24h/7d/30d percentages as what it *lacks*. The windows
line was **additive**. It never replaced the strip; the strip simply vanished.

`AppGrid` had never rendered `uptimeChecks` — zero commits. So tiles carried no
per-check history from 2026-07-02 until this rebuild, eleven weeks later. On
2026-08-30, `db3304c` deleted `Catalog.tsx` as "dead since 4c7dce2", removing the
orphaned code and the only tests that covered it.

**The gap that allowed it:** every test asserting a dot existed lived in
`Catalog.test.tsx` and was deleted with its subject. `src/grid/uptime-sparkline.test.tsx`
now renders `AppGrid`, never a component in isolation, so this cannot recur silently.

### 8.2 Deviations from §4

§4's implementation guidance targets a file that no longer exists. Each departure is
recorded rather than silently reinterpreted.

| ID | Kind | Deviation |
|----|------|-----------|
| D-1 | Mechanical | §4 says "All changes are in `src/Catalog.tsx`, inside `UptimeSparkline` (lines 864–886)". Built in `src/grid/AppGrid.tsx` — the live grid. |
| D-2 | Mechanical | §4 prescribes Tailwind utility strings. AppGrid styles through `src/index.css` classes; the tooltip is `.uptime-tooltip`. Follows the host file's convention, not the spec's. |
| D-3 | Substantive | **AC-006 (keyboard focus) is NOT met.** See §8.3. |
| D-4 | Strengthening | AC-011 asks for `aria-label` per dot. Added `role="img"` alongside it — a label on a role-less `<span>` is one assistive tech may discard, so the June build's AC-011 was weaker than it looked. Mirrors the tile status pip. |
| D-5 | Substantive | Density, which postdates this spec: the **label** hides at compact/list (redundant with the status line, matching `.app-grid-tool-uptime`'s existing rule), the **dots** do not. `DEFAULT_DENSITY` is `compact`, so hiding the dots there would ship a strip no default user sees. |
| D-6 | Mechanical | The sparkline sits under cap6's `showUptimeDisplay` gate. cap6 calls its subject "the per-tile uptime sparkline" in its own prose — written while the strip was still on the tile — so one preference governing both uptime elements is what cap6 always described. |

### 8.3 AC-006 is not met, and the June build did not meet it either

AC-006 (Should) asks for the tooltip on `:focus-visible`. The June implementation
attached `onFocus`/`onBlur` to each dot but gave them **no `tabIndex`** — a plain
`<span>` is not focusable, so those handlers never fired for a keyboard user. AC-006
has never actually worked. This rebuild does not carry the dead handlers forward.

Doing it properly is not a small change, which is why it is flagged rather than
assumed:

- The strip renders **inside the tile's `<a>`**. An element with `tabindex` is
  interactive content, and interactive content may not descend from a link. Making
  dots focusable requires moving the strip out of the anchor, as the ★, the status
  pip and the pencil already are — a layout change to `.app-grid-tool-wrap`.
- 20 dots × every tile is 20 tab stops per tile. The correct pattern is a roving
  tabindex: one stop for the row, arrow keys between dots.

Recommend tracking as its own issue. AC-011's per-dot labels are what serve assistive
tech today, and those are now genuinely exposed (D-4).

### 8.4 Adjacent finding — cap6's toggle is a no-op at the default density

Not caused by this work, found while placing the strip, and it affects a feature that
shipped to production as **v16.4.0** on 2026-09-20.

`showUptimeDisplay`'s only render consumer is `AppGrid`, where it gates
`UptimeWindowsLine` (`.app-grid-tool-uptime`). That element is `display: none` at
compact and list density. `DEFAULT_DENSITY` is `compact`. So a user who has not
switched to Large density and toggles "Show uptime display" in My settings **sees
nothing change** — the preference persists correctly and controls an invisible element.

After this change the toggle does have a visible effect at every density, because it
also gates the sparkline (D-6). That is a side effect of this work, not a fix designed
for the problem, and the underlying question — should the long-window line appear at
compact density? — is still open for Walt and Kare.

### 8.5 Test coverage

`src/grid/uptime-sparkline.test.tsx`, 15 tests, all rendering the real `AppGrid`:
dot count/order/colour, the rolling label and its singular form, height parity for
unmonitored tiles, the cap6 gate, AC-001/002/003 (tooltip content and the "MMM D,
HH:MM" 24-hour shape, asserted as a pattern so it does not encode the runner's time
zone), AC-003 failure path, AC-007 dismissal, AC-004 touch suppression, AC-008
absent/unparseable timestamps, AC-011 role and label, AC-010/AC-005 tooltip surface
and anchoring, and D-5's density split.

---

## 9. Revision History (continued)

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-09-22 | 1.0.0 | Claude (Opus 5) | Rebuilt on AppGrid after the strip was found missing from the product. Added §8 recording the loss, six deviations, the AC-006 gap that predates this build, and the cap6 density finding. |
