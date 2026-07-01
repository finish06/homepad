For Homepad, This is what I want.

# App Grid — Spec

## Summary
A dashboard page that displays **boxes** arranged in a **6-column grid**. Each box contains one or more **app links** (tools). Every box has a **width** setting from 1 to 6 that controls two things at once: how much horizontal space the box takes on the page, and how many app links appear per row inside it.

## Layout model
- The page is a grid **6 columns wide**.
- Each box spans `width` columns (1–6).
- Boxes flow left-to-right and wrap to the next row when they don't fit.
  - Example: a width-3 box next to another width-3 box = one full row (3 + 3 = 6).
  - A width-6 box always takes its own full row.
  - A width-4 box next to a width-2 box = one full row; a following width-4 wraps down.

## Width = box span AND links-per-row
The box's `width` value is reused as the number of columns for the links **inside** the box.

| Box width | Box span (of 6) | Links per row inside |
|-----------|-----------------|----------------------|
| 1         | 1               | 1 (each link stacked) |
| 2         | 2               | 2 |
| 3         | 3               | 3 |
| ...       | ...             | ... |
| 6         | 6               | 6 |

- If a box has more links than its width, the extra links **wrap** to the next row inside the box.
  - Example: width 3 with 4 links → 3 on the first row, 1 on the second.
- Example (Analytics box): Tool1, Tool2, Tool3.
  - `width = 3` → all three links on one row.
  - `width = 1` → each link on its own row.

## Data model
```json
{
  "boxes": [
    {
      "title": "Analytics",
      "width": 3,
      "tools": [
        { "name": "Tool1", "icon": "📊", "url": "https://..." },
        { "name": "Tool2", "icon": "📈", "url": "https://..." },
        { "name": "Tool3", "icon": "🧮", "url": "https://..." }
      ]
    }
  ]
}
```

Field notes:
- `width`: integer 1–6.
- `tools`: array; each has `name`, `url`, and optional `icon`.

## Behavior
- Changing a box's `width` re-lays out both the box (page grid) and its links (internal grid) live.
- Links are clickable and open their `url`.
- Boxes with unequal widths pack into rows greedily and wrap.

## Responsive
- Below ~640px viewport, the page collapses to a 2-column grid and boxes/links cap at 2 across so nothing overflows on mobile.

## Implementation hint
Both grids are plain CSS Grid driven by one variable:
```css
/* page grid */
.grid { display: grid; grid-template-columns: repeat(6, 1fr); }
.box  { grid-column: span var(--w); }

/* links inside a box — same width value */
.tools { display: grid; grid-template-columns: repeat(var(--w), 1fr); }
```
Set `--w` per box from the `width` field. No custom layout math needed — CSS Grid handles the wrapping.

## Out of scope (confirm if needed)
- Persistence / saving layout.
- Add/remove/reorder links in the UI.
- Per-user configs, auth, access control.

---

## Caleb clarification (2026-07-01, post-intake)
- **Column ceiling: up to 6 is the model** — 6 > 4, and 4 is NOT enough. The grid + box-width range is **1-6**.
- **Going up to 8 is acceptable** if it helps — treat 8 as an OK upper bound (grid may go to 8-col, width selector to 8). Design/spec for 6 as the primary, 8 as the extensible ceiling.
- This **supersedes** the max-4 layout shipped as v12.7.0 (that was an interim answer to '6 is sparse'; per-box width is the real answer). App Grid replaces it — do not keep both.