# v16 UI design reference

Five artboards Caleb produced in a visual design canvas and handed over on
2026-09-10. They are REFERENCE MOCKUPS, not production code. The precise
values (colors, sizes, spacing, radii, shadows) live in the inline
`style="..."` attributes and the `<helmet><style>` block of each
`.dc.html`; an implementation should replicate them in homepad's own
components and tokens rather than copy the markup.

## Viewing

All five share one runtime, so serve this directory and open any artboard:

    cd docs/design/v16-ui && python3 -m http.server 8000

Then open `http://localhost:8000/Main.dc.html`. `file://` will not work,
browsers block the scripts. `support.js` and `vendor/` are the render
runtime and are not part of the design.

## The artboards

| File | What it proposes |
|---|---|
| `Main.dc.html` | Full dashboard, light. Header search, an attention banner, service counts, a status legend, and a Large/Compact/List density switch. |
| `Dark.dc.html` | The same screen in dark. |
| `Tile.dc.html` | Tile density and anatomy. Three densities over the same six apps, with Compact proposed as the new default. |
| `Groups.dc.html` | Group layout. Argues today's hug-and-wrap boxes leave dead space, proposes snapping to a 12 column grid. |
| `HealthPanel.dc.html` | Health panel states. Keeps Operational, and adds two new ones: Not monitored and Stale. |

## Why this is a product question, not only a visual one

Two of these carry data-model consequences rather than styling:

- **HealthPanel** introduces `not monitored` and `stale` as first class
  states. Today a service is up or down. Stale needs a last-checked
  timestamp and a staleness threshold; not monitored needs the absence of
  a status source to be a state rather than a failure. It also adds a
  "Connect a status source" call to action, which is onboarding surface
  that does not exist yet.
- **Tile** shows live response time on the compact tile ("Online · 41 ms"),
  which the tile does not carry today.

Existing specs that these touch: `SPEC-242-per-tile-status-dot.md`,
`SPEC-app-grid.md`, `SPEC-v24-health-meter-banding.md`,
`SPEC-category-pane-width-layout.md`, `SPEC-pane-fill-reflow.md`,
`SPEC-ultrawide-fluid-frame.md`.
