# homepad v26 — Admin Env-Config Viewer

**Spec ID:** SPEC-v26-admin-env-config
**Closes:** #369
**Created:** 2026-07-15
**Author:** Walt (product lead)
**Status:** Ready for Stitch — both sign-offs recorded (§12)
**Repos:** `Code/homepad` (UI) · `Code/homepad-api` (API)
**Target version:** 15.3.0
**Estimate:** ~3–5 hours Stitch (backend-light; frontend-moderate)

**Prerequisites:** v6/cap6 (System settings panel, uptime toggle) — shipped.

---

## 1. Problem

Homepad's runtime behaviour is governed by environment variables set at deploy
time. Today there is no admin-visible surface for these: an admin who wants to
know what `GATUS_BASE_URL` the poller is using, whether OIDC is configured, or
what registration mode is active must log into the cluster and inspect the pod's
environment directly.

The motivating case is `GATUS_BASE_URL`: v25 added a per-tile Gatus endpoint key
field but explicitly deferred surfacing the base URL itself (v25 §3, "Out of
scope"). Admins now have a key field to fill in but no in-UI way to confirm the
base URL the server is composing it against.

Caleb's direction (2026-07-15): move env settings to the admin panel under
**System**. Phase 1 is **read-only** — display non-sensitive variables so admins
can see the live configuration. Editing via UI (persistence, reload semantics) is
a deliberate follow-up phase and is out of scope here.

---

## 2. Current state (code-confirmed, 2026-07-15)

### 2.1 Existing System section in SettingsPanel

`homepad/src/SettingsPanel.tsx` — `SystemSettings` component. Already renders a
`<section>` labelled "System" inside the Admin Panel modal. Currently shows:

- **Show uptime display** — writable toggle (`showUptimeDisplay`), persisted via
  `PATCH /api/admin/settings`.
- **OIDC sign-in** — hardcoded row, value sourced from the `oidcEnabled` prop
  (itself from `GET /api/auth/config`). Carries an `[env]` badge.
- **Self-registration** — hardcoded row, hardcoded text "Controlled by server
  environment". Carries an `[env]` badge.

The code comment reads: *"CLIENT-SIDE only over /api/library\*; system values are
surfaced from what the client can see (authConfig), since there is no GET
/api/admin/settings yet — the env values are noted as such."* This is the exact
gap we are filling.

### 2.2 All env vars used by homepad-api (full inventory, 2026-07-15)

| Variable | Source | Category |
|---|---|---|
| `DATABASE_URL` | `storage.Open` | **SENSITIVE** — credentials embedded in URL |
| `GATUS_BASE_URL` | `gatus.NewClient` in main | Safe to display |
| `HOMEPAD_REGISTRATION` | `envOr("HOMEPAD_REGISTRATION","open")` in main | Safe ("open"/"invite_only") |
| `PORT` | `envOr("PORT","8080")` in main | Safe |
| `COOKIE_SECURE` | `ParseCookieSecure(os.Getenv(...))` in server.go | Safe ("true"/"false") |
| `OIDC_ENABLED` | `oidc.ConfigFromEnv()` | Safe (boolean) |
| `OIDC_ISSUER` | `oidc.ConfigFromEnv()` | Safe (public IdP URL) |
| `OIDC_DISCOVERY_URL` | `oidc.ConfigFromEnv()` | Safe (optional public URL) |
| `OIDC_REDIRECT_URL` | `oidc.ConfigFromEnv()` | Safe (callback URL, visible in browser redirects) |
| `OIDC_CLIENT_ID` | `oidc.ConfigFromEnv()` | Safe (public identifier, included in browser redirect URLs) |
| `OIDC_CLIENT_SECRET` | `oidc.ConfigFromEnv()` | **SENSITIVE** — OAuth shared secret |
| `OIDC_ADMIN_GROUP` | `oidc.ConfigFromEnv()` | Safe (group name) |

### 2.3 Existing API endpoints

- `GET /api/system/config` — **public**, returns `{showUptimeDisplay: bool}`.
- `PATCH /api/admin/settings` — **admin-only**, writes system settings.
- `GET /api/auth/config` — **public**, returns `{oidcEnabled: bool}`.

There is no `GET /api/admin/env-config` or equivalent today.

---

## 3. Scope

### In scope

- New backend endpoint `GET /api/admin/env-config` returning an explicit
  allowlist of `{key, value}` pairs. Admin-auth required.
- The **explicit allowlist** is a named constant in the Go source — the
  complete set of keys that can ever appear in the response. Everything else
  is absent.
- Frontend: `SystemSettings` in `SettingsPanel.tsx` fetches and renders the
  table. The two existing hardcoded rows ("OIDC sign-in" and
  "Self-registration") are **replaced** by the fetched table (which now
  includes those values as proper rows). The `oidcEnabled` prop to
  `SystemSettings` is removed (it was only used for those rows).
- Loading and empty states for the fetch.
- A new `adminEnvConfig()` API function in `api.ts`.
- Auth tests: 401/403 for non-admin callers.
- A test that `DATABASE_URL` and `OIDC_CLIENT_SECRET` are absent from the
  response.

### Out of scope (explicit non-goals for Phase 1)

- **Editing any config value from the UI** — no write path, no persistence,
  no restart/reload semantics. That is Phase 2.
- Exposing any key not on the explicit allowlist (even as redacted "••••").
  The design choice is: if in doubt, omit. A future contributor can add a key
  to the allowlist in a deliberate, reviewable commit.
- Showing that a sensitive key **exists** (e.g. a "OIDC_CLIENT_SECRET:
  [hidden]" row). Absent is safer than redacted.
- Per-tenant config. Config is deployment-global (one instance, one env).
  The endpoint returns the server's runtime state; no user/tenant data is
  involved and no cross-tenant leakage is possible.
- Adding or changing env vars in the deployment (Kubernetes manifest / Helm
  chart) — that stays infra.

---

## 4. Security rationale — explicit allowlist (the crux)

**Why an explicit allowlist rather than "show all env except a blocklist":**

A blocklist approach is fragile: adding a new env var (e.g. `WEBHOOK_SECRET`,
`SMTP_PASSWORD`, a future third-party API key) silently exposes it until
someone remembers to update the blocklist. The burden falls on every future
contributor to actively check the blocklist and add their secret — a human
process that will eventually fail.

An explicit allowlist inverts this: a new env var is **invisible by default**.
Surfacing it in the admin UI requires a deliberate code change to the allowlist,
which is reviewable in the PR diff. No secret is ever exposed by accident.

**Implementation rule for Stitch:**

Define the allowlist as a `var` (or `const` slice) of structs in a dedicated
file `homepad-api/internal/api/env_config.go`. The handler reads ONLY those
keys from the environment and returns ONLY those keys. The function signature
must not accept arbitrary key names from the HTTP request; the set of returned
keys is fixed at compile time.

**Criteria used to classify the initial allowlist:**

A key is allowlisted iff all of these hold:
1. Its value contains no credentials, secrets, tokens, or passwords.
2. Knowing its value does not grant access to any system.
3. It is useful for an admin to see (not just noise).

By these criteria, `DATABASE_URL` fails (1) and `OIDC_CLIENT_SECRET` fails (1)
and (2). All other current env vars pass. `OIDC_CLIENT_ID` is public — it
appears verbatim in browser-visible OIDC redirect URLs — and passes all three.

---

## 5. User story

As a homepad **admin**, I want to open the Admin Panel and see a list of the
server's current runtime config values so I can confirm the Gatus base URL,
verify OIDC is configured correctly, and check the registration mode — without
needing to SSH into the cluster.

**Success metric:** An admin can open the Admin Panel → System section and read
the value of `GATUS_BASE_URL` and `OIDC_ENABLED` without leaving the browser.

---

## 6. Product acceptance criteria

### 6.1 Backend — new endpoint

**AC-001 (MUST):** `GET /api/admin/env-config` is registered in the server mux
and returns HTTP 200 with a JSON array of `{key: string, value: string}` objects,
one entry per allowlisted variable.

**AC-002 (MUST):** The endpoint requires an admin session. Unauthenticated
callers receive 401; non-admin authenticated callers receive 403.
`requireAdmin` (the same guard used by `handlePatchSystemSettings`) is used
directly.

**AC-003 (MUST):** The response contains **exactly** the keys on the allowlist:
```
GATUS_BASE_URL
COOKIE_SECURE
HOMEPAD_REGISTRATION
PORT
OIDC_ENABLED
OIDC_ISSUER
OIDC_DISCOVERY_URL
OIDC_REDIRECT_URL
OIDC_CLIENT_ID
OIDC_ADMIN_GROUP
```
No other keys appear in the response under any circumstances.

**AC-004 (MUST):** `DATABASE_URL` is **not present** in the response — not even
as a redacted value. Any test that calls the endpoint and checks for
`DATABASE_URL` must confirm it is absent.

**AC-005 (MUST):** `OIDC_CLIENT_SECRET` is **not present** in the response — same
rule.

**AC-006 (MUST):** An unset env var (e.g. `GATUS_BASE_URL` is not configured)
appears with `"value": ""` — present in the array but with an empty string value.
It is **not** omitted from the array. This makes it clear the variable is
recognized but not set.

**AC-007 (MUST):** The allowlist is defined as a named Go constant or variable
(not inline string literals scattered in the handler). The handler iterates the
allowlist; it does not branch on specific key names or call `os.Getenv` with
arbitrary inputs from the request.

**AC-008 (MUST):** The endpoint is registered alongside the other admin-gated
routes in `server.go`:
```go
mux.HandleFunc("GET /api/admin/env-config", s.handleAdminEnvConfig)
```

**AC-009 (MUST):** Multi-tenant safety: the response contains no per-tenant,
per-user, or session data. Config is deployment-global.

### 6.2 Frontend — System section replaces hardcoded rows

**AC-010 (MUST):** `SettingsPanel.tsx`'s `SystemSettings` component fetches
`GET /api/admin/env-config` on mount and renders the result as a read-only table
in the System section, below the "Show uptime display" toggle.

**AC-011 (MUST):** The two existing hardcoded rows ("OIDC sign-in" and
"Self-registration") are **removed** and replaced by the fetched table. The
`oidcEnabled` prop is dropped from `SystemSettings` (it was only used for those
rows). `SettingsPanel`'s caller (`App.tsx`) no longer needs to pass
`oidcEnabled` to `SystemSettings`.

**AC-012 (MUST):** Each fetched row displays:
- The key name (e.g. `GATUS_BASE_URL`)
- The current value (e.g. `http://gatus.kube.local`) or a visual "—" when
  `value === ""`
- An `[env]` badge (same `settings-env-badge` class as the existing rows),
  making clear the value is read-only and server-set

**AC-013 (MUST):** While the fetch is in-flight, the table area shows a loading
state. A simple "Loading…" text node or a single skeleton row is acceptable;
Kare's §8 will decide the exact treatment.

**AC-014 (MUST):** If the fetch fails (network error or non-200), the table area
shows a brief error message ("Could not load server config.") and does not crash.
The rest of the System section (the uptime toggle) is unaffected.

**AC-015 (MUST):** A new `adminEnvConfig()` function is added to `api.ts`,
returning `Promise<Array<{key: string; value: string}>>`. It rejects on non-200
so the caller can catch and show the error state.

**AC-016 (MUST):** The section heading "System" is unchanged. The new table lives
within the existing `<section data-testid="settings-system">` element.

**AC-017 (MUST):** The fetch is only made when the System section mounts (i.e.,
when the admin opens the Settings panel). No background polling; no refetch on
re-open (the values rarely change mid-session; a page reload is the correct
refresh path).

**AC-018 (SHOULD):** The table rows maintain the existing `settings-kv` /
`settings-kv-row` CSS classes for visual consistency with the existing uptime
toggle row.

### 6.3 Auth tests

**AC-019 (MUST):** Integration test (Go): `GET /api/admin/env-config` with an
admin session returns 200 with a JSON array that includes
`{"key":"GATUS_BASE_URL","value":"..."}`.

**AC-020 (MUST):** Integration test: without a session returns 401.

**AC-021 (MUST):** Integration test: with a non-admin session returns 403.

**AC-022 (MUST):** Integration test: the response body does NOT contain the
string `"DATABASE_URL"` (neither as a key nor as a value substring).

**AC-023 (MUST):** Integration test: the response body does NOT contain the
string `"OIDC_CLIENT_SECRET"`.

---

## 7. Backend implementation notes for Stitch

### 7.1 New file: `homepad-api/internal/api/env_config.go`

```go
package api

import (
    "net/http"
    "os"
)

// envConfigEntry is one allowlisted runtime config variable.
type envConfigEntry struct {
    Key   string `json:"key"`
    Value string `json:"value"`
}

// allowlistedEnvVars is the COMPLETE set of env vars that may be returned by
// GET /api/admin/env-config. Everything not on this list is permanently absent
// from the response. Adding a new var requires a deliberate change here.
var allowlistedEnvVars = []string{
    "GATUS_BASE_URL",
    "COOKIE_SECURE",
    "HOMEPAD_REGISTRATION",
    "PORT",
    "OIDC_ENABLED",
    "OIDC_ISSUER",
    "OIDC_DISCOVERY_URL",
    "OIDC_REDIRECT_URL",
    "OIDC_CLIENT_ID",
    "OIDC_ADMIN_GROUP",
}

// handleAdminEnvConfig serves the allowlisted runtime config to admins.
// requireAdmin writes 401/403 itself.
func (s *server) handleAdminEnvConfig(w http.ResponseWriter, r *http.Request) {
    if _, ok := s.requireAdmin(w, r); !ok {
        return
    }
    entries := make([]envConfigEntry, 0, len(allowlistedEnvVars))
    for _, k := range allowlistedEnvVars {
        entries = append(entries, envConfigEntry{Key: k, Value: os.Getenv(k)})
    }
    writeJSON(w, http.StatusOK, entries)
}
```

### 7.2 Route registration (`server.go`)

Add alongside the other admin-gated routes:
```go
mux.HandleFunc("GET /api/admin/env-config", s.handleAdminEnvConfig)
```

Also add the path to the scaffold fallback list (the long `notImplemented`
slice) for consistency.

### 7.3 `HOMEPAD_REGISTRATION` display note

`envOr("HOMEPAD_REGISTRATION","open")` defaults to `"open"` when unset.
`os.Getenv("HOMEPAD_REGISTRATION")` returns `""` when unset. The table will
show `""` for this var if it's unset — that is correct (the admin can see "not
set, defaulting to open" from context). No special-casing needed.

Similarly `PORT` returns `""` when unset (server defaults to 8080). Correct to
show `""`.

---

## 8. Design section (§8 — owned by Kare)

**Author:** Kare (design) · **Date:** 2026-07-15 · **Verdict:** design GO

This section is the design spec for the read-only **Environment Configuration**
list that lands in the System section beneath the "Show uptime display" toggle.
Every recommendation below is grounded in the live `SettingsPanel.tsx` / `index.css`
(read 2026-07-15) and the homelab design system; contrast figures are computed
from the actual token colors against the actual panel surfaces
(`.launcher-panel` = `rgba(255,255,255,.86)` light / `rgba(16,19,26,.9)` dark).

**Target structure after this spec** — the existing single flat `<dl>` becomes a
grouped list (see §8.5). The uptime toggle is untouched:

```
<section data-testid="settings-system"> System
  <p class="settings-section-note"> …rows marked [env] are read-only…
  <dl class="settings-kv">
    [UptimeToggleRow]                         ← unchanged, writable, no badge

    <dt class="settings-kv-group-label"> Server                ← new caption
    [GATUS_BASE_URL] [COOKIE_SECURE] [HOMEPAD_REGISTRATION] [PORT]

    <dt class="settings-kv-group-label"> Identity (OIDC)        ← new caption
    [OIDC_ENABLED] [OIDC_ISSUER] [OIDC_DISCOVERY_URL]
    [OIDC_REDIRECT_URL] [OIDC_CLIENT_ID] [OIDC_ADMIN_GROUP]
  </dl>
</section>
```

Grouping is **presentation only**, derived on the frontend from a static map keyed
by the env-var name; the API contract (a flat ordered `{key,value}[]`) is unchanged.
The spec's row order (§8 preamble) already clusters Server-vars first, then the five
OIDC vars, so the frontend groups by walking the array and emitting a caption when
the group changes. Any future allowlisted key with no mapping falls back to an
**"Other"** group rendered with the raw key as its own label — no crash, no silent
drop.

---

### 8.1 Key display — **friendly label primary, raw var name as a mono sub-label (both)**

Show **both**, stacked in the `<dt>`: a human-friendly label as the primary line,
the exact env-var name beneath it in a smaller monospace, muted line.

- The friendly label is what a non-operator reads ("what is this?").
- The raw name is what an operator needs — the whole point of the feature (§1) is
  confirming the value against what they'd set in the deploy manifest. Hiding the
  exact key would defeat that.

The label→var map lives in the **frontend** (presentation), not the API:

| Env var | Friendly label (`<dt>` line 1) |
|---|---|
| `GATUS_BASE_URL` | Gatus base URL |
| `COOKIE_SECURE` | Secure cookies |
| `HOMEPAD_REGISTRATION` | Registration mode |
| `PORT` | Server port |
| `OIDC_ENABLED` | OIDC sign-in |
| `OIDC_ISSUER` | OIDC issuer |
| `OIDC_DISCOVERY_URL` | OIDC discovery URL |
| `OIDC_REDIRECT_URL` | OIDC redirect URL |
| `OIDC_CLIENT_ID` | OIDC client ID |
| `OIDC_ADMIN_GROUP` | OIDC admin group |

Markup per row (keeps `.settings-kv-row` per AC-018):

```html
<div class="settings-kv-row settings-kv-row--env">
  <dt>
    <span class="settings-kv-label">Gatus base URL</span>
    <code class="settings-kv-var">GATUS_BASE_URL</code>
  </dt>
  <dd>
    <span class="settings-kv-value">http://gatus.kube.local</span>
    <span class="settings-env-badge" aria-hidden="true">env</span>
  </dd>
</div>
```

`.settings-kv-var` is a new token: `font: 500 11px/1.4 ui-monospace, monospace;`
`letter-spacing:.01em`. Color must clear AA at 11px (body text → **≥4.5:1**):
**light `#64748b` (4.77:1 on the panel)**, **dark `#aab2c5` (8.5:1)** — reuse the
existing `.dark .settings-kv-row dt` muted token. Do **not** use the `#9aa3b8`
badge grey here; it fails in light (see §8.6).

*Note on the OIDC_ENABLED / OIDC_ADMIN_GROUP values:* these are booleans/strings
from `os.Getenv`, so `OIDC_ENABLED` shows literal `true`/`false` (or `—` if unset,
§8.2). That's honest and matches the operator's mental model of the env var; the old
"Enabled/Disabled" prose row is intentionally retired with the two hardcoded rows.

---

### 8.2 Empty value — **em-dash "—" with an accessible "not set" label**

When `value === ""`, render a muted em-dash, **not** the literal string `(not set)`.
Rationale: `(not set)` is itself text and reads as if it could be the configured
value ("is the value literally the words 'not set'?"); the em-dash is homepad's
established empty glyph and is unambiguously "nothing here." Because a bare "—" is
meaningless to a screen reader, pair it with a visually-hidden label:

```html
<span class="settings-kv-value settings-kv-value--empty" aria-hidden="true">—</span>
<span class="sr-only">not set</span>
```

Color: the muted dt token (light `#475069` / dark `#aab2c5`) — both clear AA, so the
dash is visible, not a ghost. Do not gray it down further.

Per spec §7.3, `HOMEPAD_REGISTRATION` and `PORT` show `—` when unset even though the
server defaults them to `open`/`8080` — that is correct and no special-casing is
added here. (If product later wants a "defaulting to open" hint, that's a follow-up,
not this phase.)

---

### 8.3 Loading state — **skeleton rows inside the `<dl>` (not a text spinner)**

Render **3 skeleton rows** in place of the fetched rows while the request is
in-flight. Skeletons (not "Loading…") because they reserve the layout height so
nothing jumps when data lands, and they preview the two-column shape. Three, not
ten — enough to read as "a list is loading" without pre-committing to a row count.

- Each skeleton row: a `dt` bar ~40% width + a `dd` bar ~55% width, each 12px tall,
  `border-radius:4px`, fill `rgba(15,23,42,.06)` light / `rgba(255,255,255,.08)` dark.
- Shimmer is a slow 1.4s ease sweep, and **must** be gated on
  `@media (prefers-reduced-motion: reduce)` → static bars (no animation).
- A11y: the `<dl>` gets `aria-busy="true"`; skeletons are `aria-hidden="true"`; add a
  visually-hidden `role="status"` node reading "Loading server configuration…" so AT
  users get the cue the skeletons can't give them.

A plain "Loading…" text node is the acceptable fallback (AC-013) if the skeleton is
descoped for time, but skeleton is the design-system-preferred treatment.

---

### 8.4 Error state — **in-place, in the section, reload-guided**

Placement: **inside the System section**, in the exact region where the env rows
would render (below the uptime toggle) — replacing the list, not a global banner and
not covering the toggle. The uptime toggle above stays live and functional (AC-014).

Wording (matching homepad's contraction voice — the uptime row already says "Couldn't
save — try again."):

> **Couldn't load server configuration.**
> Reload the page to try again.

No in-panel retry button: AC-017 fixes the refresh path as a page reload (no refetch
on re-open), so the copy points there rather than implying a control that doesn't
exist. Use the existing `.settings-error` class with `role="alert"`, plus a second
muted line for the reload hint.

**Dark-mode gap to fix:** `.settings-error` is `#be123c` with **no `.dark` override**
today. `#be123c` on the dark panel measures ~**3.0:1** — under the 4.5:1 body-text
bar. Add `.dark .settings-error { color: #fda4af; }` → **~7.8:1** on the dark panel.
This is a one-line addition Stitch should include with this feature.

---

### 8.5 Row grouping — **two captioned groups, not a flat 10**

A flat list of ten near-identical rows is a wall; group them under two lightweight
captions:

- **Server** — `GATUS_BASE_URL`, `COOKIE_SECURE`, `HOMEPAD_REGISTRATION`, `PORT`
- **Identity (OIDC)** — the five `OIDC_*` rows

This directly serves the motivating admin task ("verify OIDC is configured
correctly") — the five OIDC rows read as one coherent block. Caption treatment
(`.settings-kv-group-label`, a full-width `<dt>` spanning both columns):

```css
.settings-kv-group-label {
  grid-column: 1 / -1;           /* or: width:100%; in the flex row context */
  margin-top: 8px;               /* 8pt grid — first group has no top margin */
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #475069;                /* light: 7.9:1 ✓ */
}
.dark .settings-kv-group-label { color: #aab2c5; }  /* dark: 8.5:1 ✓ */
```

Keep it a **caption**, not a heavy `<h4>` — it orients without competing with the
section title ("System"). Spacing lands on the 8pt grid (8px above each caption; the
existing `.settings-kv` `gap:8px` handles the rows). The writable uptime toggle keeps
its hairline (`.settings-kv-row--control` `border-bottom`) separating it from the
read-only block below, so the first caption reads as the start of the env list.

Semantics: the group captions are visual; the `<dl>` stays one definition list. If
stricter grouping semantics are wanted later, the two groups can each become their own
`<dl>` under an `<h4>` — not required for this phase.

---

### 8.6 Contrast & touch targets — **measured, both themes**

No new interactive targets: every env row is read-only. The section's only touch
target is the pre-existing uptime switch (44×44, already compliant — `index.css`
`.settings-switch`). So this is a pure text-contrast check. All figures computed
against the panel surfaces, body-text bar **≥4.5:1**:

| Element | Token (light / dark) | Light ratio | Dark ratio | Verdict |
|---|---|---|---|---|
| Friendly label (`dt` l.1) | `#475069` / `#aab2c5` | 7.9:1 | 8.5:1 | ✅ |
| Raw var name (`.settings-kv-var`) | `#64748b` / `#aab2c5` | 4.77:1 | 8.5:1 | ✅ |
| Value (`dd`) | `#0f172a` / `#e6e9f2` | ~16:1 | ~14:1 | ✅ |
| Empty em-dash | `#475069` / `#aab2c5` | 7.9:1 | 8.5:1 | ✅ |
| Group caption | `#475069` / `#aab2c5` | 7.9:1 | 8.5:1 | ✅ |
| Error text | `#be123c` / **`#fda4af`** | 5.9:1 | **7.8:1** (after §8.4 fix) | ✅ |
| `[env]` badge (`#9aa3b8`) | on `rgba(15,23,42,.05)` / `rgba(255,255,255,.07)` | **2.5:1 ❌** | 5.9:1 ✅ | see below |

**The one contrast finding — the `[env]` badge in light mode.** `#9aa3b8` on the near-
white badge fill is **~2.5:1**, below even the 3:1 UI-component floor. This is the same
class of miss the design system already flags (`text-muted #A3A3A3 → 2.52:1 ❌`). It is
**pre-existing** (shipped since v12) and out of this spec's build scope, but this
feature stamps it **10×** down a column, so it's worth fixing in the same PR:

- **Recommended (advisory, non-blocking):** bump the badge token to **`#5b6472`** →
  **~5.0:1** on the light fill, still reads as a quiet chip; dark already passes, leave
  it. This is a system-wide evolution of `.settings-env-badge`; fold it into the doc if
  taken.
- If the badge restyle is descoped, the meaning is **not lost**: the section note
  ("rows marked [env] are read-only") carries it, and §8.8 makes the badge
  `aria-hidden` so AT users aren't affected. That's why this is advisory, not a blocker
  — it doesn't hold the design GO.

---

### 8.7 Mobile at 390 px — **stack the row and wrap the value; never truncate**

Long OIDC URLs (`OIDC_ISSUER`, `OIDC_DISCOVERY_URL`, `OIDC_REDIRECT_URL`) overflow the
side-by-side `space-between` row at 390px. **Wrap, do not truncate-with-tooltip.**

Truncation hides the exact string an admin opened this panel specifically to read
(defeats the feature's purpose), and tooltip-on-tap is an undiscoverable, unreliable
mobile pattern. So:

- Below **480px**, the env rows switch from side-by-side to **stacked**: label block on
  its own line, value block left-aligned on the next line, full width.
- The value cell wraps hard so a long URL can never push past the viewport:
  `overflow-wrap:anywhere; word-break:break-word; min-width:0;` (the `min-width:0` is
  required or the flex child refuses to shrink and overflows).
- The `[env]` badge stays inline at the **end of the value** so it reads
  "…/auth/callback [env]" even when the value wraps to three lines.

```css
@media (max-width: 480px) {
  .settings-kv-row--env { flex-direction: column; align-items: flex-start; gap: 2px; }
  .settings-kv-row--env dd { text-align: left; }
  .settings-kv-value { overflow-wrap: anywhere; word-break: break-word; min-width: 0; }
}
```

Verify at 390×844 (iPhone), 768×1024 (iPad portrait), 1440 (desktop) that no OIDC URL
causes horizontal scroll on `.launcher-panel` and the badge stays attached to its value.

---

### 8.8 `[env]` badge position — **inline-end of `dd`, consistent with the shipped rows; `aria-hidden`**

Keep the badge exactly where the existing "OIDC sign-in" / "Self-registration" rows put
it: **in the `<dd>`, after the value**, using the same `.settings-env-badge` class
(AC-012, AC-018). Consistency with the shipped pattern wins, and a per-row badge keeps
the read-only signal attached to each row when the user has scrolled the section note
out of view.

One a11y refinement, because the badge now repeats 10×: mark it **`aria-hidden="true"`**.
The read-only semantics are already carried once by the section note; without this, a
screen reader announces "env" after all ten values — pure noise. The badge stays a
purely visual reinforcement, which is what it is. (When it wraps/stacks on mobile per
§8.7, it stays glued to the end of the value inline — no floating.)

---

### 8.9 Build summary for Stitch (new/changed CSS tokens)

- `.settings-kv-var` — new: mono 11px, `#64748b` light / `#aab2c5` dark (AA at 11px).
- `.settings-kv-group-label` — new: full-width uppercase caption, `#475069` / `#aab2c5`.
- `.settings-kv-row--env` — new modifier: enables the ≤480px stacked/wrap behavior.
- `.settings-kv-value--empty` + `.sr-only` "not set" — em-dash empty treatment.
- `.dark .settings-error { color:#fda4af; }` — **add** (dark error contrast fix).
- Skeleton-row styles + `prefers-reduced-motion` guard.
- **Advisory:** bump `.settings-env-badge` light color `#9aa3b8 → #5b6472` (2.5:1 → 5.0:1).
- Badge gets `aria-hidden="true"`; `<dl aria-busy>` while loading; `role="status"`
  loading node; `role="alert"` error node.

Everything here reuses the existing `.settings-kv` / `.settings-kv-row` /
`.settings-env-badge` scaffolding — no new component, no divergence from the system.

---

## 9. Test notes

### Unit / integration (Stitch writes these)

- `GET /api/admin/env-config` with admin session → 200, array with 10 entries.
- Response contains `{"key":"GATUS_BASE_URL","value":"..."}` entry.
- Response does NOT contain a key named `DATABASE_URL`.
- Response does NOT contain a key named `OIDC_CLIENT_SECRET`.
- Unauthenticated caller → 401.
- Non-admin caller → 403.
- `adminEnvConfig()` in `api.ts` returns the typed array on 200.
- `adminEnvConfig()` rejects on non-200.
- `SystemSettings` renders fetched rows (mock the fetch in Vitest).
- Empty value `""` renders as the agreed empty-state visual (per Kare §8).
- Loading state is shown before the fetch resolves.
- Fetch error shows the error message without crashing the toggle.

### E2E / PAT checklist

- [ ] Admin opens Admin Panel → System section shows "Environment Configuration"
  rows loaded from the server.
- [ ] `GATUS_BASE_URL` row is visible with the correct deployed value (or "—"
  / "(not set)" if not configured).
- [ ] `OIDC_ENABLED` row reflects the current OIDC deployment state.
- [ ] `HOMEPAD_REGISTRATION` row shows the configured registration mode.
- [ ] No `DATABASE_URL` row anywhere in the panel.
- [ ] Non-admin user opens Admin Panel: the System section's env table is
  visible only to admins. (Non-admins see the non-admin view in SettingsPanel,
  not the admin view — confirm no env-config rows leak through.)
- [ ] Existing "Show uptime display" toggle is unchanged and still functional.
- [ ] Page reload: env values refresh on next panel open.

---

## 10. Future (Phase 2 — explicitly out of scope here)

- **Writable env config**: allow admins to set `GATUS_BASE_URL` and
  `HOMEPAD_REGISTRATION` from the UI. Requires persistence (a `deployment_config`
  table or a sidecar that writes a `.env` file), restart/reload semantics,
  and a decision on which vars can be overridden at runtime vs. require a
  redeploy.
- **Expand the allowlist**: as new non-sensitive env vars are introduced, they
  can be added to `allowlistedEnvVars` with a reviewable code change.
- **Sensitive-key presence indicator**: showing "OIDC_CLIENT_SECRET: [set /
  not set]" without revealing the value. Deferred — adds complexity and the
  current OIDC_ENABLED row conveys the relevant admin signal.

---

## 11. Rollout

**Target version: 15.3.0 (minor)**

Rationale: new admin-visible feature, no breaking changes. The removal of the
two hardcoded rows ("OIDC sign-in" / "Self-registration") is a UI-only change
— they are replaced by richer data from the new endpoint, not removed entirely.
No migration. No feature flag needed.

---

## 12. Sign-offs (required before dispatch to Stitch)

This is a UI-bearing spec. Both sign-offs must appear in this file before it
is `approve`d and dispatched.

- [x] **Walt (product):** approved, 2026-07-15 — product GO. §8 aligns with intent: dual-label (friendly + raw var name) serves operators and non-operators; two-group layout (Server / Identity OIDC) matches the user story; read-only and allowlist unchanged. Both same-PR contrast fixes (§8.4 dark error, §8.6 badge) confirmed in-scope and correct to ship with this feature.
- [x] **Kare (design):** approved, 2026-07-15 — §8 authored; design GO. One advisory
  ([env] badge light-mode contrast, §8.6) folded in as a same-PR fix, non-blocking.

---

*This spec does not proceed to Stitch until both sign-offs above are recorded.*
