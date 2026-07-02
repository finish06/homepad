# SPEC — Friend Bot TTY View in Homepad

**Spec ID:** SPEC-friend-tty  
**Version:** 0.1.0 (draft — open questions flagged; Caleb review required before build)  
**Date:** 2026-07-02  
**Author:** Walt (product lead)  
**Repo:** `Code/homepad` (frontend), `Code/homepad-api` (backend)  
**Status:** Draft — **HOLD. Do not build until §5 open questions are resolved.**  
**Intake source:** Caleb via Joe, 2026-07-02 — "homepad needs to be added to view friend tty too"

---

## 1. Problem

The fleet's friend bots (Stitch, Gracie, Walt — and Joe) each expose a web-based terminal view (ttyd) showing their live Claude Code session. Caleb can navigate to these terminals directly today (e.g., `https://walt.kube.calebdunn.tech`) but there is no unified entry point — he needs to remember each bot's URL. Homepad is the natural home for this: a single place where every bot's terminal is one click away.

---

## 2. Architecture background

### 2A. What ttyd provides

Each friend bot pod runs a `ttyd` sidecar that exposes a web-based terminal for the bot's Claude Code session. The interface is a full-screen web terminal (`xterm.js`) served over HTTP/WebSocket. Key properties:

- **Read-only mode:** ttyd can be started with `--writable false`, making the terminal view-only (observers see output but cannot type). CLAUDE.md references "read-only ttyd" for the live-watch surface.
- **No auth by default:** access control is at the ingress layer (Pangolin SSO) rather than inside ttyd.
- **URL pattern (assumed):** `https://<bot>.kube.calebdunn.tech` for cluster bots. Exact URLs are an open question (§5 OQ-1).

### 2B. What homepad is today

Homepad is a **service launcher** — a catalog of tiles, each a `<a href target="_blank">` link to an external URL. Status badges (UP/DOWN) come from Gatus. The browser never proxies or embeds service content; it links out. This is the existing model for every external service (Gitea, fleet-feed, etc.).

**Key constraint:** homepad currently has no iframe embed or proxy capability. Adding embedded content is significantly more scope than link-out tiles.

---

## 3. Recommended architecture: friend bots as catalog tiles (MVP, zero code change)

**Recommendation:** Add a "Fleet Bots" category to the homepad service catalog with one tile per friend bot (Stitch, Walt, Gracie; and Joe if he has a ttyd). Each tile links to the bot's ttyd URL. Opening the tile launches the terminal in a new browser tab.

This is consistent with how homepad works for every other external service. Zero code change. Deployable the day after Caleb answers the open questions.

### Tile data per bot (example)

| Field | Stitch | Walt | Gracie |
|---|---|---|---|
| `name` | Stitch | Walt | Gracie |
| `description` | Live code session | Live product session | Live QA session |
| `url` | `https://stitch.kube.calebdunn.tech` | `https://walt.kube.calebdunn.tech` | `https://gracie.kube.calebdunn.tech` |
| `icon` | selfh.st or emoji | selfh.st or emoji | selfh.st or emoji |
| `gatus_key` | (probe on ttyd URL, if Gatus configured) | (same) | (same) |

Status badge: UP (ttyd process is serving) / DOWN (bot pod down) — requires Gatus probe on the ttyd URL. Whether Gatus already probes these is an open question (§5 OQ-4).

**Where this lives:** an admin creates a "Fleet Bots" category and adds the tiles. No schema changes, no code. The shared catalog model (2026-07-02 directive, SPEC-245-224-shared-catalog-model) applies — tiles are visible to all users, admin-managed.

---

## 4. Later cut: embedded terminal panel

If Caleb later wants the terminal **embedded inside homepad** (no new tab), that is a meaningful expansion:

**What it requires:**
- New panel type in homepad (iframe rendering path, not a tile `<a>` link).
- Data model: `service.panel_type = "iframe"` or a new `category.panel_type` field.
- Frontend: `<iframe src={service.url} ...>` component inside a category panel.
- Backend: potentially a proxy endpoint if ttyd blocks framing (`X-Frame-Options`). If ttyd's Pangolin ingress sets `X-Frame-Options: DENY` or `CSP: frame-ancestors 'none'`, embedding breaks; a proxy is required.
- CORS/security review: embedded terminals are a security surface (cross-origin, keyboard events, clipboard).

**Walt's call:** this is not MVP scope. The link-out tile model gives Caleb one-click access to any bot's terminal in a dedicated tab — which is actually better UX for a full-screen terminal than a small embedded panel. The embedded path is a future capability, dispatched separately if Caleb decides he wants it.

---

## 5. Open questions — HOLD until Caleb answers

**OQ-1: What are the exact ttyd URLs for each friend bot?**  
Walt assumes `https://<bot>.kube.calebdunn.tech` based on CLAUDE.md's reference to `https://walt.kube.calebdunn.tech`. But Stitch, Gracie, and Joe's URLs may differ. Confirm the exact URL for each bot before building.

**OQ-2: Is read-only enforced, and how?**  
CLAUDE.md references "read-only ttyd" for the live-watch surface. Is ttyd started with `--writable false` or is read-only just convention? This doesn't affect the homepad spec (homepad links out regardless) but it affects what the UX copy should say: "view the bot's live session" vs. "watch the bot's live terminal (read-only)." Confirm for UX accuracy.

**OQ-3: Are compose-stack bots included?**  
Fleet-compose on kube-anchor1 runs the same bots. Do the compose bots also have ttyd, and should they appear in homepad alongside the cluster bots? Options:
- Cluster bots only (simpler; compose bots accessible directly at kube-anchor1)
- All bots, with a "Cluster / Compose" category distinction
Walt recommendation: cluster bots only for v1; compose bots are a separate tile set once compose's fleet-feed is established (see SPEC-fleet-compose-integration.md).

**OQ-4: Gatus monitoring for ttyd endpoints?**  
Should each bot tile show a live UP/DOWN status badge? This requires a Gatus probe on the ttyd URL. Questions:
- Are the ttyd URLs already in Gatus?
- If not, who adds them (Joe, as SRE)?
- If Gatus doesn't probe them, the status badge will always show UNKNOWN (gray) — is that acceptable?
Walt recommendation: add Gatus probes if possible (better than permanent UNKNOWN). But it's not a blocker for the tile; UNKNOWN is honest and non-alarming.

**OQ-5: Joe's TTY**  
Joe runs as Claude Code on Caleb's Mac (not a pod with ttyd). Does Joe have a ttyd surface? If not, the "Fleet Bots" category starts with three tiles (Stitch, Walt, Gracie). Confirm.

---

## 6. Product acceptance criteria (pending OQ resolution)

Conditional on OQ-1 (URLs confirmed), OQ-5 (Joe excluded):

| # | Criterion |
|---|---|
| AC-FTT-001 | A logged-in homepad user sees a "Fleet Bots" category with one tile per cluster friend bot (minimum: Stitch, Walt, Gracie). |
| AC-FTT-002 | Clicking a bot tile opens the bot's ttyd terminal in a new browser tab at the correct URL. |
| AC-FTT-003 | The tile shows an UP status badge when the ttyd endpoint is reachable, DOWN when it is not (requires Gatus probe, OQ-4). If Gatus is not probing: UNKNOWN badge is shown. |
| AC-FTT-004 | The tile is visible to all authenticated users (not admin-only) — consistent with shared catalog policy. |
| AC-FTT-005 | Admins can add/edit/remove bot tiles via the existing admin catalog CRUD — no new admin UI needed. |

---

## 7. UI/UX design

**This spec has a UI surface (new tiles in the homepad catalog).**

However, the "Fleet Bots" tiles are purely composed of existing homepad UI primitives — a new category with standard service tiles, no new component types, no new interaction patterns. Walt is calling this **design-minimal** (does not require a Kare co-sign) on the grounds that:
- No new components are introduced.
- The visual treatment is identical to every other homepad tile.
- The only design choice is icon selection (emoji or selfh.st icon for each bot) — which Caleb can decide.

If Kare disagrees or if Caleb wants the bot tiles styled distinctively (e.g., a "Fleet" visual treatment with running/idle indicators), this flag should be raised and a Kare dispatch added. Walt is not guessing at a special design.

---

## 8. Scope

### In scope (MVP)
- Admin adds "Fleet Bots" category and bot tiles via existing homepad admin UI (no code change).
- Tile data: name, description, URL (bot's ttyd), icon, optional gatus_key.
- Status badge from Gatus (UP/DOWN/UNKNOWN) — requires Gatus probe configured by Joe.
- Cluster bots only (Stitch, Walt, Gracie).

### Out of scope (deferred)
- Embedded terminal (iframe) — requires new panel type, CORS/frame review.
- Running/idle status (NATS-backed or fleet-feed-backed) — future capability; Gatus UP/DOWN is MVP.
- Compose-stack bots — covered by SPEC-fleet-compose-integration.md scope.
- Joe's TTY — Joe runs on Mac, no pod ttyd today (OQ-5).
- Auto-discovery of new bots from fleet-feed — future v3+ capability.

---

## 9. No-code path (if Caleb wants this today)

**This can be done right now by an admin without any code change:**

1. Log into homepad as admin.
2. Create a new category: "Fleet Bots".
3. Create a service tile for each bot:
   - **Stitch** → URL: `https://stitch.kube.calebdunn.tech` (confirm OQ-1)
   - **Walt** → URL: `https://walt.kube.calebdunn.tech`
   - **Gracie** → URL: `https://gracie.kube.calebdunn.tech`
4. Set icon for each (emoji: 🪡 / 🏰 / 🔍, or selfh.st icons if suitable ones exist).
5. Done.

The spec formalizes this as a product decision and adds Gatus monitoring. The "build" in this case is Joe configuring Gatus probes + adding the tiles — not Stitch writing code.

**Walt recommendation:** do this manually now (OQ-1 answered) and close this spec as a no-code delivery. Only open a build task to Stitch if a Gatus probe requires backend changes or if the embedded panel becomes desired.

---

*Walt — product lead — 2026-07-02. Draft; flagged HOLD pending Caleb's answers to §5. No-code path in §9 can be done immediately once OQ-1 is confirmed.*
