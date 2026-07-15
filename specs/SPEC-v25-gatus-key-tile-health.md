# homepad v25 — Gatus Endpoint Key on Tiles

**Spec ID:** SPEC-v25-gatus-key-tile-health
**Supersedes:** SPEC-v25-gatus-monitoring-url (URL-paste approach; abandoned per Caleb decision 2026-07-14)
**Closes:** #364
**Created:** 2026-07-15
**Author:** Walt (product lead)
**Status:** Approved — both sign-offs recorded (Kare design GO + Walt product GO 2026-07-15); cleared for Stitch
**Repos:** `Code/homepad` (UI) · `Code/homepad-api` (API)
**Target version:** 15.2.0
**Estimate:** ~4–6 hours Stitch (frontend-heavy; no migration, minimal API)

**Prerequisites:** v21 (TileEditModal), v22 (icon light/dark tabs), v23 (click action pattern in modal) — all shipped.

---

## 1. Problem

A homepad tile becomes health-monitored by setting its **Gatus endpoint key**
(`gatus_key` column, nullable TEXT) — a slug like `kube_plex` that matches a
Gatus endpoint key exactly. The backend poller fetches all endpoint statuses from
`$GATUS_BASE_URL` every 30 s and resolves each tile's key to GREEN (UP) / GRAY
(NOT_MONITORED) / RED (DOWN) for the v15 tile health meter.

Today the **only** admin surface to set `gatus_key` is the **ServiceForm** dialog
inside the Settings panel — a buried "Add / Edit app" form. The **TileEditModal**
(the pencil icon an admin opens in edit mode directly on the dashboard) has no
monitoring field at all. This means wiring a tile to its Gatus endpoint requires
leaving the dashboard, hunting for the service in Settings, and knowing the opaque
key format without any guidance.

Caleb's decision (2026-07-14, #364): store the **endpoint slug** (`gatus_key`),
not a pasted URL. Homepad composes the Gatus API call itself from `$GATUS_BASE_URL`
+ the slug. Add the slug field to the **TileEditModal** as an admin-only setting.

---

## 2. Current state (code-confirmed, 2026-07-15)

### 2.1 Data model

`services.gatus_key TEXT` — nullable, present since migration `0001_init.up.sql`.
An empty string is coerced to NULL at the storage layer (`CreateService`,
`UpdateService` in `homepad-api/internal/storage/storage.go`).

**No migration is required.** The column already exists.

### 2.2 Backend poller

`homepad-api/internal/gatus/poller.go` — one `Client` whose `BaseURL` is
`os.Getenv("GATUS_BASE_URL")` (wired in `cmd/homepad-api/main.go`). The poller
calls `GET {GATUS_BASE_URL}/api/v1/endpoints/statuses` every 30 s, builds an
in-memory `Snapshot` keyed by endpoint key, and feeds status resolution.

Key format in the homelab seed: `{group}_{name}` — e.g., `kube_plex`,
`external_pangolin-api`, `media_jellyfin`. Admins find their key in the Gatus
config YAML under `endpoints[].group` + `endpoints[].name`.

### 2.3 Status derivation

```
gatus_key = "" / NULL          → NOT_MONITORED  (tile meter = GRAY)
gatus_key set, not in snapshot → UNKNOWN         (Gatus down or key mismatch)
gatus_key set, in snapshot     → UP (GREEN) or DOWN (RED)
```

`DEGRADED` is in the enum but the poller never produces it. Out of scope here.

### 2.4 PATCH API — already handles gatus_key

`handleUpdateService` in `homepad-api/internal/api/services.go` already accepts
`"gatus_key": *string` in the PATCH body (nil = leave unchanged, `""` = clear,
`"key"` = set). No API change is needed to accept the slug.

### 2.5 Frontend

- **`ServiceForm.tsx`** — has a "Gatus key" text field (write-only; edit mode starts
  it blank with placeholder "leave blank to keep current"). Sets `gatus_key` via
  POST or PATCH. This surface remains; no change.
- **`TileEditModal.tsx`** — no monitoring field. Handles title, URL, click action,
  category, icon (light/dark tabs), description.
- **`api.ts` read model** — `gatus_key` is in `ServiceInput` (write) but NOT in the
  `Service` read type. The server never returns it today; `Service.status` carries the
  resolved badge.

---

## 3. Scope

### In scope

- Add `gatus_key` to the **`Service` read model** (API response + frontend type)
  so TileEditModal can prefill the current slug.
- Add a **"Gatus endpoint key"** text field to **`TileEditModal`** — admin-only,
  prefills from `service.gatus_key`, participates in dirty tracking, sends
  `gatus_key` on PATCH save.
- Wire the meter: a tile with a slug in the key field drives the existing v15
  GREEN/GRAY/RED health meter with no further changes.
- `GATUS_BASE_URL` stays as an **env-var-only** config (no admin UI for it).

### Out of scope (call these out explicitly)

- Arbitrary or non-Gatus monitor URLs.
- Pasting full URLs (no URL parsing, no URL extraction).
- Per-tile Gatus base URL (all tiles use the same `$GATUS_BASE_URL`).
- Removing or modifying the ServiceForm's existing "Gatus key" field.
- `DEGRADED` status derivation.
- Auth headers for Gatus.
- Exposing `GATUS_BASE_URL` in any admin UI.

---

## 4. User story

As a homepad **admin** in edit mode, I want to open a tile's edit modal and enter
the Gatus endpoint key so the tile's status badge immediately reflects whether that
service is up or down — without leaving the dashboard or navigating to the Settings
panel.

**Success metric:** An admin can go from a GRAY (NOT_MONITORED) tile to a live
UP/DOWN badge in under 30 seconds by opening the tile's pencil modal, typing the
Gatus key, saving, and seeing the tile refresh — with no Settings panel visit.

---

## 5. Product acceptance criteria

### 5.1 Read model — `gatus_key` exposed

**AC-001 (MUST):** `GET /api/services` response includes `"gatus_key"` on every
service object: the slug string when monitoring is configured, `""` when not. The
field is always present (never omitted).

**AC-002 (MUST):** The `Service` type in `api.ts` gains a `gatus_key: string` field.
All consumers that don't use it are unaffected (additive, backward-compatible).

### 5.2 TileEditModal field

**AC-003 (MUST):** TileEditModal gains a **"Gatus endpoint key"** text field below
the Description textarea (last field before the action row), matching the position
of all other per-tile settings added in v21–v23.

**AC-004 (MUST):** The field prefills from `service.gatus_key` — showing the current
slug if one is set, blank if not.

**AC-005 (MUST):** Help text reads:
`The endpoint key from your Gatus config — its group_name (e.g. kube_plex). Leave blank to disable health monitoring.`

**AC-006 (MUST):** Saving with a non-blank value sends `PATCH /api/services/{id}`
with `{ "gatus_key": "<trimmed value>" }`. The tile's status badge updates to
GREEN/RED (or UNKNOWN if Gatus is unreachable) without a full page reload.

**AC-007 (MUST):** Saving with a blank or whitespace-only value sends
`{ "gatus_key": "" }`, which clears monitoring (the storage layer coerces `""` to
NULL). The tile's status badge reverts to GRAY (NOT_MONITORED).

**AC-008 (MUST):** The field participates in dirty tracking: typing any change
marks the modal dirty and triggers the discard-confirm strip on dismiss, consistent
with the v21/v22/v23 pattern.

**AC-009 (MUST):** No additional auth gate — TileEditModal is already rendered only
in admin edit mode (v21). Regular users never see the field.

**AC-010 (SHOULD):** Field width matches the other full-width text inputs in the
modal body.

**AC-011 (SHOULD):** No client-side format validation beyond trimming whitespace.
Stitch should NOT enforce the `{group}_{name}` pattern — an admin might have a key
with a different separator or no group prefix. A mismatched key resolves to UNKNOWN
(Gatus unreachable / key not found), not an error.

### 5.3 API

**AC-012 (MUST):** `handleUpdateService` (`PATCH /api/services/{id}`) is unchanged
in behavior — it already accepts `gatus_key *string`. The only API-layer change is
adding `GatusKey string` to `serviceView` and populating it from `sv.GatusKey`.

**AC-013 (MUST):** `handleCreateService` (POST from ServiceForm) is unchanged.

**AC-014 (MUST):** `handleListServices` (GET) populates `GatusKey: sv.GatusKey` in
`serviceView` for every entry in the shared catalog.

### 5.4 Meter wiring (no change required)

**AC-015 (MUST):** The v15 health meter already resolves UP/DOWN/NOT_MONITORED/UNKNOWN
from `service.status`. Setting `gatus_key` correctly causes the poller to start
resolving the tile's status on the next 30-second tick. No additional wiring needed.

---

## 6. Data model

### 6.1 `services.gatus_key` — no migration needed

The column already exists since migration `0001_init.up.sql`. The `ServiceUpdate`
struct and `UpdateService` storage method already handle the three-state nil/""/ key
semantics. **Stitch does not write any new migration.**

### 6.2 Multi-tenant confirmation

Under the v9 shared-catalog model (SPEC-245-224), every `services` row is owned by
a `user_id`. `ListServices` and `UpdateService` always filter on the catalog owner's
`user_id`. `gatus_key` is a column on those per-tenant rows. No cross-tenant data
leakage is possible.

### 6.3 `serviceView` change (homepad-api/internal/api/services.go)

Add one field to the read struct:

```go
type serviceView struct {
    // ... existing fields unchanged ...
    // GatusKey (v25) — the Gatus endpoint slug, "" when unmonitored. Additive.
    GatusKey string `json:"gatus_key"`
}
```

Populate it in `handleListServices` and `handleUpdateService` (it's already in
`sv.GatusKey` from the storage query; just wire it through).

### 6.4 `Service` type change (homepad/src/api.ts)

Add one field:

```ts
export type Service = {
  // ... existing fields unchanged ...
  gatus_key: string; // v25 — Gatus endpoint slug, "" when not monitored
};
```

The comment in api.ts ("The server never returns `gatus_key`") should be removed or
updated to reflect that the PATCH write model and the read model now both carry it.

### 6.5 `GATUS_BASE_URL` (env config — no change)

The Gatus base URL remains an operator env var (`GATUS_BASE_URL`) on the homepad-api
deployment. It is **not** exposed in any admin UI. Document it in the homepad-api
README (or deployment notes) if not already there. All tiles share the same Gatus
instance.

---

## 7. Frontend implementation notes for Stitch

The pattern to follow is the `clickAction` field added in v23
(`SPEC-tile-click-action-20260710.md`), which also lives in TileEditModal. Key
parallels:

- State: `const [gatusKey, setGatusKey] = useState(service.gatus_key ?? '')` on
  modal open — prefills from the read model (new in v25).
- Dirty: include `gatusKey !== (service.gatus_key ?? '')` in the dirty check.
- Patch payload: include `gatus_key: gatusKey.trim()` unconditionally in the PATCH
  (the storage layer ignores unchanged-but-present fields through the nil-pointer
  semantics of `ServiceUpdate.GatusKey`, but since the frontend always sends the
  current trimmed value on save, a round-trip on an unchanged field is harmless).
- ServiceForm.tsx: no change. The comment "API never returns gatus_key, so edit
  mode starts it blank" will no longer be accurate; update it or remove it.

---

## 8. Design section (§8 — Kare, design)

**Author:** Kare (design/UX) · **Status:** design GO (see §11)
**Verified:** rendered and measured at 390 px in the CDP browser against the live
v21/v22 modal tokens in `src/index.css` — values below are read off the DOM, not
eyeballed. Artifact: `v25-gatus-390.png`.

**Bottom line:** this field introduces **no new tokens and no new CSS**. It reuses
the existing `.tile-edit-field` / `.tile-edit-label` / `.tile-edit-input` /
`.tile-edit-help` classes verbatim, so it inherits the v19/v20 a11y pass (44 px
target, AA contrast) for free. The only design decisions are copy and the
placeholder. Everything below is consistent with v21–v23.

### 8.1 Placement & structure

The field renders **immediately below the Description field, above the action
row** — the last field in `.tile-edit-body` (`TileEditModal.tsx`, insert between
the Description `.tile-edit-field` block and the `{error && …}` block, ~line 636).
It is a single `.tile-edit-field` with the standard three-part stack the rest of
the modal uses:

```
<label class="tile-edit-label">      Gatus endpoint key
<input class="tile-edit-input" type="text" placeholder="e.g. kube_plex">
<p class="tile-edit-help">            (help text — see §8.3)
```

The `.tile-edit-body` `gap: 16px` and per-field `gap: 6px` place it on the same
rhythm as every field above it. No new spacing values — the 8 pt/16 px system is
already carried by the parent.

### 8.2 Label wording

**Approved: "Gatus endpoint key"** (the draft) — unchanged.

- Sentence case, one capital, matching the sibling labels (`Title`, `URL`,
  `Click action`, `Category`, `Description`, `URL fallback`). "Gatus" stays
  capitalized as a product proper noun.
- It names the *thing you paste* (a key), not the outcome ("Monitoring"), so the
  admin's mental model matches the Gatus config field they copy from. Rule 4
  (obvious hierarchy) is satisfied by the shared 14 px/600 label token — this field
  is a peer of the others, not a promoted one, which is correct: it is optional.

### 8.3 Help text — wording, placement, mobile

Placed as a `.tile-edit-help` `<p>` **directly under the input** (same relationship
as the click-action hint and the URL-fallback help), `margin-top: 2px`,
`font-size: 13px`, `line-height: 1.35`.

**Measured wrap of the AC-005 draft at 390 px:** in the 318 px content column the
draft (141 chars) wraps to **4 lines / 70 px**. That is *acceptable* — it's a help
paragraph, not a label, and it never overflows or clips. But 4 lines is a touch
tall directly under a control, so I recommend a tighter string that keeps **every
fact** (it's a key, it comes from your Gatus config, it's the `group_name`, an
example, and the blank-to-disable behavior) and measures **3 lines / 116 chars**:

> **Approved help text (recommended):**
> `The endpoint key from your Gatus config — its group_name (e.g. kube_plex). Leave blank to disable health monitoring.`

The AC-005 wording is an acceptable fallback (no blocker); the tightened version
above is the design preference and what I've signed off on. **Update AC-005 to this
string.** Either way the two literals (`group_name`, `kube_plex`) should read as
literals — do not italicize or markdown-bold them inside the rendered `<p>`; plain
text in the help color is correct and is what was measured.

Underscores in `group_name` / `kube_plex` do not force awkward mid-word breaks at
390 px (verified) — the line breaks fall on spaces.

### 8.4 Empty state — placeholder, not a label

**Decision: blank input + placeholder is sufficient. Do NOT add a separate
"No health monitoring" label.**

- The field is optional and *most* tiles will be blank; a persistent "No health
  monitoring" caption would add a fourth line of chrome to a field that's off by
  default, and it would duplicate the help text's "Leave blank to disable…" clause.
  That's noise, not signal (Rule 4 — if everything shouts, nothing is heard).
- The **placeholder `e.g. kube_plex`** carries the empty-state affordance: it gives
  an inline example the instant the field is seen, before the help text is read, and
  disappears on input. This mirrors the existing `URL fallback` field, which already
  ships a placeholder (`https://cdn.example.com/icon.png`).
- The *tile itself* already communicates "not monitored" — a blank key yields the
  GRAY NOT_MONITORED meter (§2.3). The modal doesn't need to restate it.

**Placeholder contrast caveat (minor, DS-wide):** a bare `::placeholder` inherits
the UA default (~`input color @ 0.54 opacity` ≈ 3.4:1 on white) which is **below**
AA 4.5:1. The existing URL-fallback placeholder already has this latent gap. Fold in
a shared rule on the modal's input token so both are fixed at once:

```css
.tile-edit-input::placeholder { color: #525252; }        /* 7.81:1 on #fff */
.dark .tile-edit-input::placeholder { color: #a3a3a3; }  /* ≥4.5:1 on #141416 */
```

This is a documented evolution of the modal input token (not a one-off), and it
also lifts the pre-existing icon-URL placeholder to AA. If Stitch would rather ship
the field with **no placeholder** than add this rule, that's an acceptable
fallback — the label + help text fully cover comprehension — but the placeholder is
the design preference.

### 8.5 No validation error state — confirmed

**Confirmed: there is NO client-side validation and NO red modal error for this
field.** This is correct, per AC-011:

- No format check (no `{group}_{name}` enforcement) — an admin's key may use a
  different separator or no group prefix. The only transform is `.trim()`.
- A blank/whitespace value is a valid state (clears monitoring), not an error.
- A *wrong* key is not knowable at edit time — it resolves to **UNKNOWN on the
  tile** on the next poll tick (§2.3), never to a modal error. Surfacing "unknown"
  as a modal error would be a lie (we don't know it's wrong until Gatus answers) and
  would block a legitimate save.
- The modal's existing `.tile-edit-error` (`role="alert"`) stays reserved for the
  save-level failure it already handles ("Title and URL are required" / PATCH
  failure). The Gatus field never writes to it.

The result of a mismatch is designed **on the tile** (the UNKNOWN meter state,
owned by v15/v24), not in this modal. That's the right home for it.

### 8.6 Touch target & contrast (v19/v20) — measured, PASS

All values read off the live tokens the field reuses:

| Element | Token | Measured | Rule | Verdict |
|---|---|---|---|---|
| Input hit area | `.tile-edit-input min-height:44px` | **44 px** tall (318 px wide @ 390 px) | ≥44×44 | ✅ |
| Label text | `.tile-edit-label #404040 / dark #e5e5e5` | 14 px/600 · **10.37:1** light, **13.51:1** dark | ≥4.5:1 | ✅ |
| Input text | `.tile-edit-input #171717 on #fff / #f5f5f5 on #141416` | 15 px · **~16:1** both themes | ≥4.5:1 | ✅ |
| Help text | `.tile-edit-help #525252 / dark #d4d4d4` | 13 px · **7.81:1** light, **11.48:1** dark | ≥4.5:1 (small) | ✅ |
| Input border | `#8c8c8c light / #808080 dark` | **3.36:1** / **4.31:1** | ≥3:1 UI | ✅ |
| Focus ring | `#4f46e5 / dark #818cf8`, 2 px, offset 1 px | inherited from token | visible ≥3:1 | ✅ |

**iOS note (advisory, not a v25 finding):** the input is 15 px, below the 16 px
threshold that suppresses iOS focus-zoom. This is the modal-wide value shipped since
v21 across *every* field (Title, URL, …); bumping only this one input to 16 px would
be inconsistent. Leave it at 15 px for consistency and track the 16 px question as a
separate modal-wide DS item — do **not** special-case the Gatus field.

### 8.7 Mobile layout at 390 px — measured, acceptable

At 390 px viewport (iPhone-class): overlay padding 16 px → modal **358 px** →
body padding 20 px → content column **318 px**.

- Label: single line, no wrap.
- Input: 318×44 px, full width, no horizontal scroll.
- Help: 3 lines (approved copy) / 4 lines (AC-005 draft) — both fit the column with
  no clipping; the field sits well clear of the action row.

The whole field, with the Description above it, is shown in `v25-gatus-390.png`.
Responsive is *real* here, not hoped (Rule 7) — it was rendered and measured.

### 8.8 Dirty tracking, order & consistency (Rule 8)

- The field joins the existing `dirty` expression (`gatusKey !== (service.gatus_key
  ?? '')`), so a change arms the existing inline discard-confirm strip on dismiss —
  same as Title/URL/Category/Description. No new confirm surface.
- It is a plain controlled text `<input type="text">`, not a `type="url"` — the key
  is a slug, not a URL, and `type="url"` would wrongly invite a full URL (the exact
  anti-pattern this spec supersedes). This keeps mobile keyboards on the standard
  text keyboard, not the URL keyboard.
- Prefill from `service.gatus_key ?? ''` on open; on save send the trimmed value.
  This matches the v23 `clickAction` prefill/dirty/patch shape exactly.

### 8.9 Handoff to Stitch — design checklist

1. Insert one `.tile-edit-field` below Description, above the `{error}` block.
2. Label: `Gatus endpoint key`. Input: `type="text"`, `placeholder="e.g. kube_plex"`.
3. Help `<p class="tile-edit-help">` with the §8.3 approved string; **update AC-005**.
4. No new error UI; no format validation (trim only) — §8.5.
5. No new CSS except the optional `::placeholder` AA rule in §8.4 (recommended).
6. Reuse the shared input token — do not override height, font, or colors.

---

## 9. Test notes

### Unit / integration (Stitch writes these)

- `serviceView` serializes `gatus_key` field for both monitored and unmonitored tiles.
- PATCH with `gatus_key: "kube_plex"` sets the slug; subsequent GET returns `"gatus_key": "kube_plex"`.
- PATCH with `gatus_key: ""` clears the slug; subsequent GET returns `"gatus_key": ""`.
- `Service.gatus_key` in api.ts correctly types the new read field.
- TileEditModal prefills the field from `service.gatus_key` on open.
- Typing a new key marks the modal dirty.
- Saving with a key sends PATCH with the trimmed `gatus_key`.
- Saving with a blank key sends PATCH with `gatus_key: ""`.

### E2E / PAT checklist

- [ ] Admin enters edit mode, opens tile pencil modal — "Gatus endpoint key" field
  is visible with help text.
- [ ] Field prefills with current slug for a tile that already has `gatus_key` set
  (set via ServiceForm prior to this spec).
- [ ] Admin types a valid key → saves → tile status updates (requires Gatus running
  at `$GATUS_BASE_URL`; GRAY → GREEN or RED on next poll tick ≤ 30 s).
- [ ] Admin clears the key (blanks the field) → saves → tile returns to GRAY
  (NOT_MONITORED).
- [ ] An unrecognized key (key not in Gatus) → tile shows UNKNOWN after next poll.
- [ ] Changing the key marks the modal dirty; dismiss without save shows discard
  confirm.
- [ ] Non-admin user in normal mode: TileEditModal is not accessible (no pencil in
  non-edit mode). No regression from this spec.
- [ ] Existing tiles with `gatus_key` set via ServiceForm continue to resolve
  UP/DOWN/UNKNOWN with no intervention.

---

## 10. Rollout

**Target version: 15.2.0 (minor)**

Rationale: this is a new backward-compatible feature — a new field in the read
model and a new UI control in the admin tile editor. No breaking changes to existing
consumers. No migration. Existing tiles with `gatus_key` set via ServiceForm
immediately benefit (their key now shows in TileEditModal on open). Follows
homepad's semver pattern: new minor for new additive user-visible capability.

No feature flag needed. No rollback hazard (removing the field from the read model
in a revert would leave TileEditModal prefilling blank, which is the same as the
pre-v25 state).

---

## 11. Sign-offs (required before dispatch to Stitch)

This is a UI-bearing spec. Both sign-offs must appear in this file before it is
`approve`d and dispatched.

- [x] **Walt (product):** **product GO — 2026-07-15.** Adopted Kare's tightened AC-005 copy (3 lines at 390 px vs draft's 4; all facts preserved). §8 is consistent with product intent: admin-only gate, slug field (`type="text"`), no client-side validation, mismatch → UNKNOWN on tile. Ready for Stitch.
- [x] **Kare (design):** **design GO — 2026-07-15.** §8 authored and verified: field
  reuses the v21/v22 modal tokens (no new CSS), rendered and measured at 390 px in
  the CDP browser — input 318×44 px (44 px target ✅), label 10.37:1/13.51:1, help
  7.81:1/11.48:1, all ≥ AA. No client-side validation / no modal error state
  (mismatch → UNKNOWN on the tile, not here). Empty state = placeholder, not a
  caption. Recommended tightened AC-005 help copy (3 lines at 390 px vs the draft's
  4). Artifact: `v25-gatus-390.png`. No blockers.

---

*This spec does not proceed to Stitch until both sign-offs above are recorded.*
