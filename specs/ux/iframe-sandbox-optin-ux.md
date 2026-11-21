# UX: Stricter overlay sandbox, with a per-app opt-in

**Spec:** [`SPEC-iframe-sandbox-optin.md`](../SPEC-iframe-sandbox-optin.md) §9 (v0.1.1, Approved 2026-11-20)
**Author:** Claude for Kare (design), drafted 2026-11-20
**Status:** Draft — awaiting Caleb.

Spec §9 names one surface: the tile editor's Inline overlay switch, its help line, and its greyed-out state. Everything else reuses what exists:
- the tile editor (`TileEditModal.tsx`) and its Click action control (v23, Kare §8.1);
- the My settings switch markup (`role="switch"`, `.settings-switch`);
- the overlay (`IframeOverlay.tsx`) and its blocked-embed fallback, which doesn't change (AC-014).

Checked against `homepad` `gitea/main` `ad3d0fe`.

---

## 1. Where it lives

```
Arrange → ✎ on a tile → Edit tile
  Title
  URL
  Click action   [New tab] [Same tab] [Inline overlay]
                 hint line (existing)
                 Let this app keep its sign-in   [switch]   ← NEW, Inline overlay only
                 help line or reason line                   ← NEW
  Category
  … icon · description · Gatus key · Widget …
```

- The switch sits directly under the Click action hint, inside the same field group (spec §2.2). It's about how the overlay behaves, so it lives with the overlay choice.
- The tile editor is admin-only (Q2, AC-010). Members and kids never see the switch.
- The overlay itself doesn't change. A viewer can't see the setting.

**Bundle.** `TileEditModal` and `IframeOverlay` are already lazy chunks (`AppGrid.tsx`: `lazy(() => import(...))`). The new `src/lib/sandbox.ts` (`sandboxFor`, `isSameOrigin`) is imported only by those two, so Rollup keeps it out of the entry chunk. Nothing in the entry may import it: `AppGrid.tsx` must not import it to precompute anything. The entry chunk gains 0 bytes. The switch reuses `.settings-switch` from `index.css`, and the one new layout rule goes with the tile editor's styles.

## 2. The switch

### 2.1 Desktop (1280; the tile editor is 480px wide)

```
 Off (a new overlay app)
┌ Edit tile ──────────────────────────────────── ✕ ┐
│ Grafana · shared catalog                         │
│                                                  │
│ Title  [ Grafana                             ]   │
│ URL    [ https://grafana.home.example        ]   │
│                                                  │
│ Click action                                     │
│ [ New tab ][ Same tab ][▐Inline overlay▌]        │
│ Embeds the service in an overlay panel. Some     │
│ sites block embedding — a fallback link appears  │
│ if that happens.                                 │
│                                                  │
│ Let this app keep its sign-in           [●━━ ]   │
│ Turn this on if the app asks you to sign in      │
│ every time, or stays blank. Only for apps you    │
│ trust.                                           │
│                                                  │
│ Category [ Monitoring                      ▾ ]   │
│ …                                                │
│                                 [Cancel]  [Save] │
└──────────────────────────────────────────────────┘

 On (only the switch rows change)
│ Let this app keep its sign-in           [ ━━●]   │
│ Turn this on if the app asks you to sign in      │
│ every time, or stays blank. Only for apps you    │
│ trust.                                           │
```

Greyed out: the address is on Homepad's own origin.

```
│ URL    [ https://home.example/grafana/        ]  │
│                                                  │
│ Click action                                     │
│ [ New tab ][ Same tab ][▐Inline overlay▌]        │
│ Embeds the service in an overlay panel. …        │
│                                                  │
│ Let this app keep its sign-in       [●┄┄ ]       │   ← off, dimmed switch
│ Not available for pages on this Homepad's own    │   ← reason, full muted colour
│ address.                                         │
```

### 2.2 Phone (390; the editor is full width less 16px each side)

```
 Off                                 Greyed out
┌ Edit tile ────────────────── ✕ ┐  ┌ Edit tile ────────────────── ✕ ┐
│ Grafana · shared catalog       │  │ Grafana · shared catalog       │
│ Title                          │  │ Title                          │
│ [ Grafana                    ] │  │ [ Grafana                    ] │
│ URL                            │  │ URL                            │
│ [ https://grafana.home.exa…  ] │  │ [ https://home.example/gra…  ] │
│ Click action                   │  │ Click action                   │
│ [New tab][Same tab][▐Inline ▌] │  │ [New tab][Same tab][▐Inline ▌] │
│ Embeds the service in an       │  │ Embeds the service in an       │
│ overlay panel. Some sites      │  │ overlay panel. Some sites      │
│ block embedding — a fallback   │  │ block embedding — a fallback   │
│ link appears if that happens.  │  │ link appears if that happens.  │
│                                │  │                                │
│ Let this app keep    [●━━ ]    │  │ Let this app keep    [●┄┄ ]    │
│ its sign-in                    │  │ its sign-in                    │
│ Turn this on if the app asks   │  │ Not available for pages on     │
│ you to sign in every time, or  │  │ this Homepad's own address.    │
│ stays blank. Only for apps you │  │                                │
│ trust.                         │  │                                │
└────────────────────────────────┘  └────────────────────────────────┘
```

- At 390 the label wraps to two lines and the switch stays on the right, top-aligned with the label. The row is at least 44px tall.
- (The segment reads "Inline overlay" in full on a real 390 screen. The wireframe shortens it to fit.)

### 2.3 Copy (exact)

| Element | Text |
|---|---|
| Label | Let this app keep its sign-in |
| Help line (switch usable) | Turn this on if the app asks you to sign in every time, or stays blank. Only for apps you trust. |
| Reason line (same origin) | Not available for pages on this Homepad's own address. |
| Reason line (address can't be read) | Enter the app's full address first, like https://app.example. |

The first three are the spec's §2.2 copy, unchanged. The fourth is new (I-1).

### 2.4 States

| Click action | Address | Switch shows | Under it | Overlay gets `allow-same-origin` |
|---|---|---|---|---|
| New tab or Same tab | any | hidden | nothing | n/a |
| Inline overlay | another origin | the saved value, usable | help line | when on (AC-002) |
| Inline overlay | Homepad's own origin | off, greyed out | same-origin reason | never (AC-004) |
| Inline overlay | can't be parsed | off, greyed out | the "full address" reason | never (AC-004) |

- **Live check.** The origin check runs on every change to the URL field, using the same `safeHref` and `new URL(...)` as the overlay (spec §2.3, one shared function). Typing a same-origin address greys the switch at once. Fixing it brings it back.
- **The saved value is kept.**
  - Switching to New tab and back restores the switch as it was (spec §2.2).
  - The greyed-out state shows *off* because that's what the overlay will do. It doesn't change the saved value, and Save doesn't send it (I-2).
  - Changing the address back to another origin shows the saved value again.
- **New overlay apps start off** (AC-008). An app that was on Inline overlay before the upgrade shows **on** (Q1, TC-001).
- **Saving.** Toggling the switch makes the form dirty. Save sends `iframeSameOrigin` only when it changed, like `clickAction`. Closing with a change asks the existing "Discard changes?".
- **Errors.** A failed save uses the editor's existing error line. There's no new copy.

## 3. The overlay

No visible change (AC-014). With the switch off, an app that needs its own cookies shows its sign-in page in the overlay every time, or loads blank. That's what the help line describes, in the words an admin would use.

- The 5-second "This site can't be embedded" fallback stays as it is. A sign-in page still loads, so the fallback doesn't fire for it.
- A tile on Homepad's own address now shows the fallback (TC-004), because Homepad refuses to be framed (AC-006). This needs no new copy.
- The overlay has no hint pointing the admin at the switch (I-3).

## 4. Accessibility

- **The switch** is `<button type="button" role="switch" aria-checked aria-labelledby={label} aria-describedby={help or reason}>`. It's the My settings markup.
- **Greyed out** uses `aria-disabled="true"`, not the `disabled` attribute. The switch stays in the tab order, and a screen reader hears "Let this app keep its sign-in, switch, off, dimmed, Not available for pages on this Homepad's own address." Clicks and Space do nothing. A real `disabled` would skip it, and keyboard users would never learn why.
- **Contrast.** Only the switch track and thumb dim (opacity 0.5; a non-text control in a disabled state). The reason line keeps the full `.tile-edit-help` colour, so it stays AA in light and dark.
- **Announcements.** The help and reason line sits in the field's existing `aria-live="polite"` area, next to the Click action hint. When the URL change greys the switch, the reason is announced once.
- **Tab order:** Title → URL → New tab → Same tab → Inline overlay → **the switch** → Category → … It's the natural order. The switch appears right after the control that reveals it.
- Space toggles the switch. Enter does nothing, because Enter in this form is Save.
- **Copy:** never say "sandbox", "origin", "cookies" or "allow-same-origin" in the UI. The label says what the admin gets: the app keeps its sign-in.

## 5. Acceptance criteria covered

| Screen | ACs |
|---|---|
| §2 switch, help line, greyed state | AC-005, AC-009 (sent on Save), AC-010 (admin-only editor) |
| §2.4 states table | AC-001, AC-002, AC-004 (what each state renders) |
| §2.4 upgraded apps show on | AC-008 |
| §3 overlay unchanged | AC-014 |

AC-003, AC-006, AC-007 and AC-011…AC-013 have no UI.

## 6. Screenshot checkpoints (for TC-001…TC-004)

1. The tile editor on Inline overlay, switch off and on, at 1440 (the spec's width), 1280 and 390, light and dark.
2. The greyed-out state for a same-origin address, at 390 and 1440, light and dark.
3. The "full address" reason, at 390.
4. An upgraded overlay app (TC-001) with the switch on, at 1280.
5. New tab chosen: no switch, at 390.

## 7. Decisions for Caleb

- **I-1: A second reason line for an address that can't be read.** The spec greys the switch for unparseable addresses (AC-004) but gives only the same-origin reason. That reason would be wrong for a half-typed address. **Recommended: "Enter the app's full address first, like https://app.example."**
- **I-2: The greyed-out state doesn't overwrite the saved value.** An upgraded app on Homepad's own address has the opt-in saved as on (migration 0023), and the editor shows it off and greyed. **Recommended: show off, send nothing.** The overlay ignores the value there anyway (AC-004), and "Save sends only what changed" stays true. The alternative is to send `false` on the next Save, which tidies the data but changes a field the admin didn't touch.
- **I-3: No hint in the overlay.** Homepad can't tell a sign-in loop from a normal page, so any hint would show on every overlay. **Recommended: none.** The release note and the help line carry it.
- **I-4: The switch sits under the Click action hint.** The spec says so. The alternative is a separate "Overlay" group lower in the form, which puts it far from the choice that reveals it. **Recommended: as the spec says.**

## Sign-off

| Role | Name | Status |
|---|---|---|
| Design | Kare | Drafted 2026-11-20 (Claude for Kare) |
| Product | Caleb | Pending (I-1…I-4) |
