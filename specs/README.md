# homepad — Spec Index

**Current as of:** 2026-11-26 (18.7.0; M10 specs shipped)  **Maintainer:** Walt (product lead)

This directory holds the **current, authoritative** product specs and decisions for
homepad. Historical specs for shipped versions v2–v10 are in
[`specs/archive/`](./archive/).

**Spec count.** "N specs" in `CLAUDE.md` and `docs/prd.md` means the feature specs indexed below: the top-level `specs/*.md` files other than `README.md`, `DECISIONS.md` and `test-plan-v1.md`. Count them with `ls specs/*.md | grep -v -e README -e DECISIONS -e test-plan-v1 | wc -l`. Subfolders (`specs/archive/`, `specs/ux/`) are not counted. On 2026-11-25 it is 61, and the section counts in the headings below add up to it (3 + 9 + 9 + 39 + 0 + 1).

**Not counted:** [`DECISIONS.md`](./DECISIONS.md) is the decision record. [`test-plan-v1.md`](./test-plan-v1.md) is the AC-to-test methodology reference, not a feature spec.

> **How this index is maintained.** Every `Status:` line below was reconciled
> against `src/` and `CHANGELOG.md` on 2026-09-22 — not copied from the spec's own
> header.
>
> That reconciliation happened because the headers had drifted far enough to cause
> real waste. Three specs still marked "Ready for Stitch" or "Ready for
> implementation" had already shipped — cap4 in June 2026, SPEC-v26 as v15.3.0,
> SPEC-245 in `homepad-api` PR #34 — and work was started on all three before
> anyone checked the code. A fourth, `uptime-sparkline.md`, read "Shipped — prod"
> while the feature had been absent from the product for eleven weeks.
>
> **A spec's `Status:` line is a claim, not evidence.** Verify against the code
> before building, and update the header in the same PR that ships the feature.
>
> On 2026-11-22 every spec from 17.0.0 to 18.0.0, and the rows for
> density-to-my-settings, cap3, cap4, SPEC-app-grid and SPEC-245, were checked again
> against `CHANGELOG.md` and the code on `main`.
>
> On 2026-11-25 every spec shipped in 18.1.0 to 18.6.0 was checked against
> `CHANGELOG.md`, the release PRs and the code at 18.6.0 (`5475545`).

---

## Shipped — 18.7.0, M10 UI review first batch (3)

Written 2026-11-25 from the 2026-11-24 UI review and shipped in 18.7.0 on 2026-11-26.

| File | Feature | Status |
|---|---|---|
| [`SPEC-ui-quick-wins.md`](./SPEC-ui-quick-wins.md) | #725: browser colour, tap "Updated" to refresh, toasts that pause and close, Gear menu arrow keys, status shapes at Large, Library grouping, sign-in polish | SHIPPED — 18.7.0 (#735, #740) |
| [`SPEC-dashboard-empty-loading.md`](./SPEC-dashboard-empty-loading.md) | #722: a skeleton at the real grid size while loading, empty states with an action per role; #724's dead CSS removed | SHIPPED — 18.7.0 (#736) |
| [`SPEC-group-header-collapse.md`](./SPEC-group-header-collapse.md) | #718: app count and status bar on each group header; fold a group, saved per user through the existing collapse API | SHIPPED — 18.7.0 (#746, #753); Kare's screen check carried |

## Shipped — 18.1.0 to 18.6.0, one repo, previews and cleanups (9)

| File | Feature | Status (verified 2026-11-25) |
|------|---------|------|
| [`SPEC-monorepo-api.md`](./SPEC-monorepo-api.md) | Move homepad-api into this repo under `api/`, keep both images | SHIPPED — 2026-11-23 (`85e1a67`, PR #642), first released in 18.1.0. homepad-api archived on Gitea and GitHub; releases are tagged only here. |
| [`SPEC-preview-environments.md`](./SPEC-preview-environments.md) | Per-PR Preview Environments — isolated QA envs, one per open PR | SHIPPED — workflows #626 and #634, seed #627 and #637. Live on PRs, up to 3 at once. |
| [`SPEC-admin-server-settings.md`](./SPEC-admin-server-settings.md) | Admins edit server settings in Admin Panel → System, stored in Postgres; a saved value wins over env. Replaces the read-only SPEC-v26 list. UX: [`ux/admin-server-settings-ux.md`](./ux/admin-server-settings-ux.md) | SHIPPED — 18.1.0 (2026-11-23): #685, #684, #694. Migrations `0024`, `0025`. `GET /api/admin/env-config` deprecated until 19.0.0. |
| [`SPEC-api-cleanup-18.2.0.md`](./SPEC-api-cleanup-18.2.0.md) | 18.2.0 API cleanup: the 28 issues moved from homepad-api (#651–#676, #688), each fixed with a test or closed with evidence | SHIPPED — 18.2.0 (2026-11-23): #698. |
| [`SPEC-test-infra-18.3.0.md`](./SPEC-test-infra-18.3.0.md) | 18.3.0 test setup cleanup: vitest runs on a clean checkout, envsubst without root, `npm run test:all`, CI named as the gate | SHIPPED — 18.3.0 (2026-11-24): #702. #691 (runner side, Joe) still open. |
| [`SPEC-ui-cleanup-18.3.0.md`](./SPEC-ui-cleanup-18.3.0.md) | 18.3.0 UI and accessibility cleanup: 19 UI, design and a11y issues; ErrorBoundary for lazy chunks (#341) | SHIPPED — 18.3.0 (2026-11-24): #703. The five left for a decision were decided in 18.4.0 and 18.6.0. |
| [`SPEC-decisions-18.4.0.md`](./SPEC-decisions-18.4.0.md) | 18.4.0 decisions: the API says `member` (`user` a deprecated alias until 19.0.0, #599), per-service tile hue (#352), the uptime hint (#488), docs match the code | SHIPPED — 18.4.0 (2026-11-24): #707. |
| [`SPEC-qa-cleanup-18.5.0.md`](./SPEC-qa-cleanup-18.5.0.md) | 18.5.0 QA and test reliability: removing an adult (#591), a clear error when the homelab read token is missing (#578), the kid-accounts phone test (#567), browser tests for what staging can't show (#606, #607, #610), sources in the M7 table (#540) | SHIPPED — 18.5.0 (2026-11-24): #709. No app change. |
| [`SPEC-cleanup-18.6.0.md`](./SPEC-cleanup-18.6.0.md) | 18.6.0: a full Content-Security-Policy (#529), scratch test databases must be `_test` (#256), decisions on sparkline focus (#477), drag placeholder (#403) and bento grid (#346) | SHIPPED — 18.6.0 (2026-11-24): #711. The CSP is live on staging and production (checked 2026-11-25); the per-PR preview still sends only `frame-ancestors` (#715). |

## Shipped — 17.0.0 to 18.0.0, household accounts (9)

Plans: [`kid-accounts-plan.md`](../docs/plans/kid-accounts-plan.md),
[`household-basics-plan.md`](../docs/plans/household-basics-plan.md),
[`backup-import-plan.md`](../docs/plans/backup-import-plan.md),
[`status-widgets-plan.md`](../docs/plans/status-widgets-plan.md),
[`v18-household-management-plan.md`](../docs/plans/v18-household-management-plan.md).
UX artifacts are in [`ux/`](./ux/).

| File | Feature | Status (verified 2026-11-22) |
|------|---------|------|
| [`SPEC-kid-accounts.md`](./SPEC-kid-accounts.md) | Kid accounts — a managed dashboard for kids on the family iPad; sessions move to Postgres | SHIPPED — 17.0.0 (2026-10-30). Kid passwords (§2.2) were not built; the API refuses them. |
| [`SPEC-household-basics.md`](./SPEC-household-basics.md) | Invite-only by default, add an adult by invite link, every admin edits the catalog, account cap | SHIPPED — 17.1.0 (2026-11-20). 18.0.0 changed Q5 (SSO under invite-only) and Q7 (hidden rows archived). |
| [`SPEC-backup-import.md`](./SPEC-backup-import.md) | Backup, restore (Merge / Replace), and import from Homepage | SHIPPED — 17.1.0 (2026-11-20). Files are `schemaVersion` 2 since 18.0.0. |
| [`SPEC-status-widgets.md`](./SPEC-status-widgets.md) | A few server-fetched numbers on tiles; clock, weather and ⌘K web search | Phase 1 SHIPPED — 17.1.0 (2026-11-20). Phase 2 (Pi-hole, qBittorrent, Proxmox VE) not built. |
| [`SPEC-household-catalog-owner.md`](./SPEC-household-catalog-owner.md) | The catalog belongs to the household, not the first admin (one-way migration 0021) | SHIPPED — 18.0.0 (2026-11-22). No UI. |
| [`SPEC-household-manage-adults.md`](./SPEC-household-manage-adults.md) | Remove an adult, change an adult's role; never the last admin | SHIPPED — 18.0.0 (2026-11-22). |
| [`SPEC-password-reset-link.md`](./SPEC-password-reset-link.md) | Admin-made one-time reset link; change your own password | SHIPPED — 18.0.0 (2026-11-22). |
| [`SPEC-signin-hardening.md`](./SPEC-signin-hardening.md) | Sign-in rate limits, trusted proxies, invite-only for SSO, PocketID setup | SHIPPED — 18.0.0 (2026-11-22). The `email_verified` check and three small fixes shipped in 17.1.0. |
| [`SPEC-iframe-sandbox-optin.md`](./SPEC-iframe-sandbox-optin.md) | Overlay sandbox drops `allow-same-origin` by default, per-app opt-in; nothing can frame Homepad (#334) | SHIPPED — 18.0.0 (2026-11-22). |

## Shipped — through 16.7 (39)

| File | Feature | Status (verified 2026-09-22; five rows re-checked 2026-11-22, see the note above) |
|------|---------|------|
| [`SPEC-149-quick-exit-edit-mode.md`](./SPEC-149-quick-exit-edit-mode.md) | Quick Exit Edit Mode (Issue #149) | SHIPPED — v12.0.2 (`0ceeea6`, PR #150). The "Done" button in the edit-mode banner (`data-testid="exit-edit-mode"`, `src/app/App.tsx`). No CHANGELOG entry was written for it. |
| [`SPEC-242-per-tile-status-dot.md`](./SPEC-242-per-tile-status-dot.md) | SPEC — #242: Per-Tile Status Dot on App Grid Tool Tiles | Built — the dot shipped with v15.x (top-left, D-1) and moved to the right rail in the Compact/List densities with 16.1.0 (D-1a). The D-1 re-measurement at 236px is recorded in §5 (2026-09-13). *(Was: Draft — dispatching to Kare… |
| [`SPEC-245-224-shared-catalog-model.md`](./SPEC-245-224-shared-catalog-model.md) | SPEC — #245 + #224: Shared Catalog Model (Admin-Managed Reads, Admin-Gated Writes) | SHIPPED — `Code/homepad-api` PR #34 (`f120477`). Shared reads via `SharedCatalogOwnerID`; writes behind `requireAdmin`. Status line read "Ready for Stitch" until 2026-09-22. The owner model was replaced in 18.0.0 by SPEC-household-catalog-owner (no owner, `SharedCatalogOwnerID` removed). |
| [`SPEC-app-grid.md`](./SPEC-app-grid.md) | SPEC — App Grid | Built and shipped (v15.x) — the App Grid is the live dashboard; §10.4 (12-column grid) shipped in 16.2.0 (2026-09-13). |
| [`SPEC-glass-v2-accent.md`](./SPEC-glass-v2-accent.md) | Glass v2 + ROYGBIV Accent Preference | SHIPPED — v13.4.0. Glass v2 accent-lit backdrop + ROYGBIV accent preference. |
| [`SPEC-health-bar-visibility-toggle.md`](./SPEC-health-bar-visibility-toggle.md) | Health Bar Visibility Toggle — per-user | SHIPPED — v16.3.0 (`cbf6210`). OQ-1 resolved (a) by Caleb 2026-09-15. Kare §9 waived under the owner standing rule (2026-09-20); no outstanding gates. |
| [`SPEC-mobile-launcher-ux.md`](./SPEC-mobile-launcher-ux.md) | Mobile Command Launcher UX — Hide Keyboard Hints, Fix Tap Targets | Shipped — prod (PR #129, merged 2026-06-21 as b936511e) |
| [`SPEC-pane-fill-reflow.md`](./SPEC-pane-fill-reflow.md) | App-Grid Box Horizontal Fill & Tile Reflow (wide viewports) — Phase 1 | SHIPPED — Phase 1 in v13.2.0, Phase 1b in v13.3.0. `rowFillCounts`/`contentMaxPx` in `src/grid/appGridLayout.ts`. Walt (product) ✓ · Kare (design) ✓ |
| [`SPEC-settings-admin-vs-user.md`](./SPEC-settings-admin-vs-user.md) | SPEC — Settings: Admin-Global vs. Per-User Clarity | Done — intent fully absorbed by v11+v12; no implementation required |
| [`SPEC-tile-click-action-20260710.md`](./SPEC-tile-click-action-20260710.md) | homepad v23 — Per-Tile Click Action | SHIPPED — v14.0.0 (`d400156`, PR #333). `Service.clickAction` — new_tab \| same_tab \| iframe. §8.1 segmented control SHIPPED in v16.7.1 (PR #517, #428). |
| [`SPEC-tile-density.md`](./SPEC-tile-density.md) | SPEC — Tile Density (Large / Compact / List) | SHIPPED — v16.1.0 (`ebc2f3e`). OQ-9 revisited in v16.2.0 (`a495ce0`): density is per-user from `/api/me`, localStorage demoted to a cache. |
| [`SPEC-ultrawide-fluid-frame.md`](./SPEC-ultrawide-fluid-frame.md) | Ultra-wide Fluid Content Frame (Phase 1b of pane-fill) | SHIPPED — merged to `main` as #284 (`cb15eec`, 2026-07); `src/lib/layout.ts` carries `max-w-[max(1536px,92vw)]`, `frameContentPx` lives in `src/grid/appGridLayout.ts`, the R3 centring rule is in `index.css` (`@media (min-width:… |
| [`SPEC-v24-health-meter-banding.md`](./SPEC-v24-health-meter-banding.md) | Homepad v24 — Health-Panel Meter: Status-Banded Tick Strip | SHIPPED — v15.1.0 (impl PR #361, merged 2026-07-14). Walt + Kare co-signed 2026-07-14. |
| [`SPEC-v25-gatus-key-tile-health.md`](./SPEC-v25-gatus-key-tile-health.md) | homepad v25 — Gatus Endpoint Key on Tiles | SHIPPED — v15.2.0 (`5e82db3`). `Service.gatusKey` on the tile editor. Status line read "Approved … cleared for Stitch" until 2026-09-22. AC-002 amended 2026-10-12 (#367, code wins): `gatus_key` is optional on the client. |
| [`SPEC-v26-admin-env-config.md`](./SPEC-v26-admin-env-config.md) | homepad v26 — Admin Env-Config Viewer | SHIPPED — v15.3.0 (`28411d3`, PR #374). Live at `src/library/SettingsPanel.tsx` + `GET /api/admin/env-config`. Status line read "Ready for Stitch" until 2026-09-22. Superseded in 18.1.0 by SPEC-admin-server-settings; the web app no longer shows the list. |
| [`cap3-recently-opened.md`](./cap3-recently-opened.md) | "Recently Opened" Row — Capability #3 | SHIPPED — 16.5.0 (2026-09-22). See §8 for the two deviations from this spec's original guidance. |
| [`cap4-sparkline-dot-tooltip.md`](./cap4-sparkline-dot-tooltip.md) | Sparkline Dot Hover Tooltip — Capability #4 | SHIPPED — 16.5.0 (2026-09-22, restored) — see §8. Originally shipped 2026-06-23 (PR #145), lost 2026-07-02 with its host component. AC-006 (keyboard focus) withdrawn 2026-11-24 (#477); 18.6.0 adds a check summary to the tile link instead. |
| [`cap5-status-change-toasts.md`](./cap5-status-change-toasts.md) | Status-Change Toast Alerts — Capability #5 | SHIPPED — prod. The AC-015 ghost-toast defect (#147) was fixed in v12.0.3 (`a0b5fd5`); no outstanding work. |
| [`SPEC-status-degraded-threshold.md`](./SPEC-status-degraded-threshold.md) | "Slow" threshold — `statusDegradedMs` | SHIPPED — v16.2.0 (PR #444). Spec written retroactively 2026-10-11 (#449) from the code on both sides. OQ-1 (no way back to "unset") closed in 18.1.0: Reset goes back to the server default. |
| [`v29-favorite-star-arrange-only.md`](./v29-favorite-star-arrange-only.md) | The favorite ★ is a control only in Arrange mode | SHIPPED — #506 (`0bae21c`), released in 16.7.0, in production via 16.7.1. Opened Arrange apps to every user; supersedes SPEC-density-to-my-settings AC-008/TC-006. §3.3 (non-admin tile drag) open → M5. *(Added to this index 2026-10-11 — it was missing.)* |
| [`cap6-uptime-display-toggle.md`](./cap6-uptime-display-toggle.md) | Uptime Display Toggle — Capability #6 | v1 SHIPPED (prod v13.5.0, global admin setting). **v2 SHIPPED — prod v16.4.0, 2026-09-20** (the setting is per-user; the admin row now seeds new accounts). OQ-1 resolved. v2 product/design sign-off waived 2026-09-20 under the o… 18.4.0 adds the density hint (#488). |
| [`large-monitor-grid.md`](./large-monitor-grid.md) | Large-Monitor Grid & Layout Alignment | SHIPPED — v12.7.1 / v12.7.2 (#194, #195, #196). Walt (product) ✓ · Kare (design) ✓ |
| [`not-monitored-state.md`](./not-monitored-state.md) | Distinct "Not Monitored" Tile State | Shipped — prod (PR #48/#49/#50/#100, 2026-06-18) |
| [`uptime-sparkline.md`](./uptime-sparkline.md) | Uptime Sparkline on Homepad Tiles | Shipped — prod (PR #46/#47/#51, 2026-06-18). Absent 2026-07-02 → 2026-09-22, restored on the App Grid with cap4. Renders behind each person's "Show uptime display": bars at every density, the label only at Large; see the spec's "As built (18.6.0)". |
| [`uptime-windows.md`](./uptime-windows.md) | Long-Window Uptime Metrics on Homepad Tiles | SHIPPED — carried by the v13.2.0 release (`697d2ca`, PR #268). `UptimeWindowsLine` in `src/grid/AppGrid.tsx`. The 13.2.0 CHANGELOG entry covers only pane-fill and never mentions this feature. Status line read "Draft — building … |
| [`v1-launcher.md`](./v1-launcher.md) | homepad v1 — Spec | Shipped — canonical foundation; v1 through v12 all build on this spec |
| [`v11-admin-ux-clarity.md`](./v11-admin-ux-clarity.md) | homepad v11 — Admin / Personal Scope Clarity — Product Spec | SHIPPED — v8.0.0 (2026-06-18). |
| [`v12-settings-boundary-clarity.md`](./v12-settings-boundary-clarity.md) | homepad v12 — Settings Boundary Clarity | SHIPPED — the UserMenu split into "My Dashboard" / "Administration" with per-field env badges (`5bb4702`, PR #77). |
| [`v13-live-status-refresh.md`](./v13-live-status-refresh.md) | Live Status Auto-Refresh + "Last Updated" Indicator | SHIPPED — v10.0.0. Live status auto-refresh with a "last updated" indicator; the poller lives in `src/services.tsx`. |
| [`v15-version-changelog.md`](./v15-version-changelog.md) | Version Badge + Changelog Overlay | Shipped — v12.0.0 (2026-06-26, PR #152) |
| [`v16-status-bar-quick-peek.md`](./v16-status-bar-quick-peek.md) | Status Bar Quick-Peek | Shipped — v12.0.0 (2026-06-26, PR #153) |
| [`v17-alert-history.md`](./v17-alert-history.md) | Status Alert History (v17) | Shipped — v12.1.0 (2026-06-28, PR #168) |
| [`v18-gear-edit-menu.md`](./v18-gear-edit-menu.md) | homepad v18 — Gear: Unified Edit-Dashboard Menu | SHIPPED — v12.5.0 (2026-06-29, `0e26a5d`, PR #176). |
| [`v19-a11y-touch-pass.md`](./v19-a11y-touch-pass.md) | homepad v19 — A11y & Touch-Target Hardening Pass | Shipped — v13.8.0 (2026-07-05, PR #299) |
| [`v20-fav-star-a11y.md`](./v20-fav-star-a11y.md) | homepad v20 — Favorite Star: Touch Target & Contrast Fix | Shipped — v13.9.0 (PR #306, merged). Design co-sign confirmed on built UI (§10). |
| [`v21-tile-edit-modal.md`](./v21-tile-edit-modal.md) | homepad v21 — Tile Edit Modal | SHIPPED — v13.10.0. `src/grid/TileEditModal.tsx`. Status line read "Draft — awaiting Kare §8" until 2026-09-22. |
| [`v22-icon-light-dark-tabs.md`](./v22-icon-light-dark-tabs.md) | homepad v22 — Icon Light/Dark Tabs in TileEditModal | SHIPPED — v13.11.0 (`f0a2286`). Status line read "Draft" until 2026-09-22. |
| [`v28-tile-drag-reorder.md`](./v28-tile-drag-reorder.md) | homepad v28 — Tile Drag-and-Drop Reorder in Edit Mode | SHIPPED — v15.6.0 (`03fa922`, PR #402). dnd-kit sortable tiles in edit mode. Status line read "Ready for Build" until 2026-09-22. §8.4 placeholder: the in-place shift stays (#403, decided 2026-11-24). |
| [`SPEC-density-to-my-settings.md`](./SPEC-density-to-my-settings.md) | Tile density moves to My settings · gear "Edit dashboard" becomes "Arrange apps" | SHIPPED — 16.6.0 (2026-09-25). AC-008 and TC-006 partly superseded by v29. *(Listed here as "Ready for build" until 2026-11-22.)* |

## Open — not shipped (0)

No spec is open.

One part of a shipped spec is also open: Phase 2 of
[`SPEC-status-widgets.md`](./SPEC-status-widgets.md) (Pi-hole, qBittorrent,
Proxmox VE widgets) is not built.


## Superseded — do not build (1)

| File | Feature | Status |
|------|---------|------|
| [`SPEC-category-pane-width-layout.md`](./SPEC-category-pane-width-layout.md) | Category Pane Width Layout — Horizontal Screen Utilization | ⛔ **SUPERSEDED 2026-09-12 — DO NOT BUILD.** *(was: APPROVED for implementation, Walt product go 2026-07-01 — dispatched to Stitch; subsequently held as Phase 2 and never built)* |

---

## Archive

`specs/archive/` holds specs for shipped versions v2–v10. These are read-only historical records — do not edit them. The archive is the right place to look for the original acceptance criteria, open questions, and implementation notes for any feature that shipped before v11.

| File | Feature | Shipped as |
|------|---------|-----------|
| [`archive/v2-app-icons.md`](./archive/v2-app-icons.md) | Custom app icons — light/dark variants, PNG upload, edit-mode toggle | v2 |
| [`archive/v3-theme-mode.md`](./archive/v3-theme-mode.md) | System/Light/Dark theme — ThemeProvider, per-user Postgres persistence, anti-flash | v3 |
| [`archive/v4-app-categories.md`](./archive/v4-app-categories.md) | First-class category model — admin CRUD, per-app category assignment, grouped catalog render | v4 |
| [`archive/v5-collapsible-categories.md`](./archive/v5-collapsible-categories.md) | Per-user collapsible category sections — disclosure interaction, `user_collapsed_categories` table | v5 |
| [`archive/v6-admin-settings.md`](./archive/v6-admin-settings.md) | Admin Settings UI — consolidated Settings panel, `requireAdmin` cross-cutting gate, category management surface | v6 |
| [`archive/v7-ux-redesign.md`](./archive/v7-ux-redesign.md) | UX/visual redesign — v7 design tokens, tile refresh, UserMenu avatar dropdown, top-bar declutter | v7 |
| [`archive/v8-command-launcher.md`](./archive/v8-command-launcher.md) | Command-K launcher — fuzzy search overlay, keyboard navigation, ranker, a11y | v8 |
| [`archive/v9-per-user-dashboards.md`](./archive/v9-per-user-dashboards.md) | Per-user dashboards + App Library — biggest architecture change; COPY model, per-user services, admin library CRUD | v9 |
| [`archive/v10-drag-and-drop.md`](./archive/v10-drag-and-drop.md) | Always-on drag-and-drop reordering (dnd-kit) — tile + category drag, keyboard alternative, removes Arrange mode | v10 |
