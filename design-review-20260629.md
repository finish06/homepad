# homepad — Design-System Alignment Review (2026-06-29)

**Reviewer:** Kare (design/UX) · **Build reviewed:** staging **v12.4.0 (9aaad1e)** ·
**Source of truth:** `Code/design-system/DESIGN-SYSTEM.md` · **Method:** live headless
Chromium against `http://homepad-web.homepad-staging.svc/` (authed, seeded local
account), three viewports (desktop 1280, iPad 768, phone 390), light **and** dark,
all values **computed off the live DOM** (`getComputedStyle` / `getBoundingClientRect`,
WCAG contrast alpha-composited).

> homepad is the **reference app** for the design system, so the bar is its own bar:
> it must meet WCAG-AA contrast (4.5:1 body / 3:1 large+UI), the 8pt grid, and ≥44×44
> touch targets through the iPad range.

---

## Verdict: **CHANGES** — 5 blockers, 1 advisory

The big a11y push (#180–#185) **landed and largely worked** — dark mode is now strong
and most touch targets are fixed. What remains are last-mile **light-mode contrast misses**
and a few **sub-44 controls** that keep the reference app from passing its own system.
All fixes are small (color-token swaps + `h-11 w-11`).

### What this build FIXED (verified resolved on staging — please verify-close)
| Was | Now (measured v12.4.0) | Old issue |
|---|---|---|
| Dark tile **description** 4.18:1 | **7.85:1** (neutral-400 on near-black) | #180 ✅ |
| Footer **changelog/version** link 2.52:1 | **4.74:1** (neutral-500, 12px) | #181 ✅ |
| Tile **'⋯' trigger** box 36×36 at sm+ | **44×44** (`h-11 w-11`) | #183 ✅ |
| Account-**menu rows** 24/32/38px | **44 / 57 / 44px** | #185 (mostly) |
| Header **bell** 36px | **44×44** | #182 (bell part) |

### Blockers (filed, hold the merge from a design standpoint)
| # | Finding | Measured | Rule | Surface / fix |
|---|---|---|---|---|
| **#188** | Tile **'⋯' glyph** contrast (light) | **2.52:1** — `neutral-400` `#a3a3a3` 18px on white | ≥3:1 graphic / 4.5 text (§1.1, #1) | `.tile-menu-trigger` glyph → `neutral-500`+ (box already 44 ✓) |
| **#189** | Quick-launcher: **placeholder** 2.53:1 **+ bar 36px tall** | `rgb(154,163,184)` 13px; box 161×**36** | ≥4.5:1 text + ≥44 touch (§1.1, §9.3) | `.launcher-trigger` placeholder → `#6e6e6e`; `min-h-11` |
| **#190** | **Settings gear** ("Personal settings") | **36×36** (bell beside it is 44) | ≥44×44 (#3, §9.3) | gear → `h-11 w-11` |
| **#191** | Header caption **"Updated just now"** | **2.52:1** — `neutral-400` 12px on white | ≥4.5:1 body text (§1.1, §9.2) | caption → `text-secondary`/`neutral-500`; "N not monitored" same token |
| **#182** | Account **avatar** disc (still open) | **34×34** at iPad | ≥44×44 (#3) | avatar tap target → ≥44 (commented: still reproduces) |

### Advisory
| # | Finding | Measured | Fix |
|---|---|---|---|
| **#185** | Account-menu **"+ Add apps"** row (the one row still under) | **34px** tall | row `min-height: 44` (commented: rest of menu is fixed) |

### The contrast through-line (worth fixing as one token rule)
Three of the four contrast misses are the **same root cause**: `neutral-400` (`#a3a3a3`)
used for a small affordance on white. Per DESIGN-SYSTEM §9.2 the standing rule is
**"neutral-500 is the lightest gray permitted for ≤14px text on white."** The '⋯' glyph
(#188), the launcher placeholder (#189), and the "Updated just now" caption (#191) all
violate it in **light** mode (dark mode is clean — these tokens ride a near-black ground
there at 7–8:1). A single sweep replacing resting `text-neutral-400` → `text-neutral-500`
on white-ground text/icon closes all three.

---

## Stitch-ready fix list (prioritized)

**Blockers — do these to ship the reference app clean:**
1. **#188** `.tile-menu-trigger` — glyph color `text-neutral-400` → `text-neutral-500`
   (or `-600`). Keep `dark:` value. Box stays `h-11 w-11`. *(1 class)*
2. **#189** `.launcher-trigger` — (a) placeholder color → `#6e6e6e`/`neutral-500`;
   (b) height `h-9`/36 → **`h-11`/44**, vertical padding to match. ⌘K chip stays compact inside.
3. **#190** Settings-gear button — `h-9 w-9` → **`h-11 w-11`** (match the bell + '⋯').
4. **#191** Header status captions ("Updated just now", "N not monitored") —
   `text-neutral-400` → `text-secondary`/`text-neutral-500` on white. Keep dark override.
5. **#182** Account-avatar control — tap target to **≥44×44** (expand hit-area; the 34px
   disc art can stay if the surrounding button is 44).

**Advisory:**
6. **#185** Account-menu **"+ Add apps"** row — `min-height: 44px`.

**Housekeeping:** #180, #181, #183 are verified fixed on v12.4.0 — close them.

---

## What's strong (the reference baseline holds)
- **Dark mode** is now genuinely good: tile titles 18.2:1, descriptions 7.85:1, footer
  link 7.85:1 — the #163/#164 dark-contrast era is over for the resting dashboard.
- **Tile grid** — uniform 134px cards, 16px gaps, clean 8pt-grid, 2/3-col responsive. ✅
- **Empty state** ("Browse the App Library" CTA) and the **account menu** hierarchy remain
  the reference patterns other homelab apps should copy (DESIGN-SYSTEM §9.1).
- **One-primary-per-view** discipline intact.

## Honest gaps this pass
- **Arrange/edit mode** drag-handle sizing not re-measured this pass (entry is folded into
  the v18 gear→edit-menu rework, #166); the §9.4 note that handles render 36px still stands
  until v18 ships — flagged there, not double-filed.
- **Loading state** (#184) not re-triggered this pass; left open.

*Filed issues: #188, #189, #190, #191 (new) · #182, #185 (confirmed still-open w/ comment).
Screenshots attached to each issue and in the work copy `~/work/align/`.*

— Kare
