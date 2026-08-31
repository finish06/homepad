# Homepad Market Assessment: Self-Hosted Home Dashboard Landscape

**Prepared by Walt, product lead — DATE: 2026-07-18**

---

## 1. Executive Summary

The self-hosted home-dashboard space is crowded with well-maintained open-source options, most of which converge on a single-user or single-tenant "launcher with icons and widgets" model. The leading projects (Homepage, Homarr, Dashy) compete on breadth of integrations and widget variety, not on multi-tenancy or product polish. Commercial options are either smart-home platforms (Home Assistant, Hubitat) targeting automation rather than service discovery, or legacy SaaS start-pages (Netvibes, Start.me) that predate the homelab era and feel it.

Homepad occupies a distinct position: a **multi-tenant, PWA-first, glassmorphic household launcher with server-side Gatus integration and OIDC/PocketID auth** — a combination no open-source competitor currently ships as a coherent package. Its gaps are primarily widget breadth and single-binary ease of deployment relative to the field leaders.

---

## 2. Open-Source Competitors

### 2.1 Homepage (`gethomepage.dev`)

**What it is:** A statically-configured YAML dashboard. You define services, bookmarks, and widgets in config files; Homepage fetches live data from dozens of self-hosted services (Sonarr, Plex, Proxmox, Portainer, etc.) directly from the browser or server-side proxy. No database, no user accounts.

**Strengths:**
- Enormous integration library: 100+ service widgets with live metrics (CPU %, active downloads, now playing, etc.)
- YAML-only config — zero UI, zero database, trivially git-managed
- Docker-label-based auto-discovery for stacks defined in Compose
- Very active maintenance (multiple commits per week as of mid-2026)
- Beautiful default theme; built-in dark/light, accent colors
- Fast: static SPA served from a Node process, minimal runtime

**Weaknesses:**
- No user accounts, no per-user personalization, no multi-tenancy
- Config is file-only — editing the dashboard requires touching YAML and restarting
- No admin UI; no tile CRUD in-browser
- Not a PWA; no install-to-homescreen polish
- Status checks are browser-to-service (leaks internal hostnames to the browser) *or* proxied per-widget — inconsistent

**License:** MIT  
**Maintenance health:** Excellent — top-5 most-starred homelab project on GitHub, highly active community (needs verification: star count ~20k as of knowledge cutoff)  
**vs Homepad:** Homepage wins on integration breadth and zero-setup simplicity; Homepad wins on multi-tenancy, OIDC auth, PWA, inline tile editing, and server-side status isolation.

---

### 2.2 Homarr

**What it is:** A React-based dashboard with a drag-and-drop tile UI and a wide widget library. Config lives in a SQLite database; includes a built-in user system (though primarily single-user in practice).

**Strengths:**
- Polished drag-and-drop grid UI; widgets resize and reposition freely
- Growing integration library (media servers, download clients, home automation)
- Built-in user system and basic role separation (admin vs. user)
- Docker integration: can show container status/start/stop from the UI
- Actively developed; v1.0 milestone shipped in 2025 (needs verification)

**Weaknesses:**
- Multi-tenancy is limited — shared config, per-user boards are basic or not supported (needs verification on current state)
- Docker-only deployment; no first-class Kubernetes support
- No OIDC/SSO; local accounts only
- Status checks go browser-to-service (no server-side abstraction)
- Not a PWA
- Widget quality is inconsistent; some widgets break when upstream APIs change

**License:** MIT  
**Maintenance health:** Good — active releases, growing contributor base  
**vs Homepad:** Homarr has a richer widget ecosystem and more drag-and-drop flexibility; Homepad has OIDC, server-side Gatus status isolation, multi-tenant per-user ordering/favorites, and a cleaner glassmorphic design system. Homarr's user model is closer to Homepad's than Homepage's but still behind on tenant isolation.

---

### 2.3 Dashy

**What it is:** A Vue.js dashboard with an extensive configuration system, dozens of built-in widgets, a rich theming engine, and optional local/Keycloak auth. One of the older and most feature-complete options.

**Strengths:**
- Most themeable project in the field: custom CSS, dozens of built-in themes, icon packs
- Large widget library covering status checks, weather, news, finance tickers
- Optional Keycloak/auth-provider integration for SSO
- Status checks via HTTP ping or custom providers
- Section-level icons and grouping; extensive layout customization

**Weaknesses:**
- Config is primarily YAML/JSON — in-browser editing is available but clunky
- No true multi-tenancy: one config, one view for all users
- Vue 2 codebase for much of the existing feature set (Vue 3 migration reportedly in progress — needs verification); technical debt visible in widget quality
- Maintenance has slowed since ~2024 (original author reduced involvement — needs verification)
- Not a PWA in the full sense
- Heavier than competitors; slower initial load

**License:** MIT  
**Maintenance health:** Moderate — historically very active, currently slower (needs verification)  
**vs Homepad:** Dashy wins on raw theme flexibility and widget count; Homepad wins on architectural cleanliness, multi-tenancy, OIDC, PWA, and active maintenance trajectory.

---

### 2.4 Heimdall

**What it is:** A PHP/Laravel application dashboard — one of the original homelab launchers. Pure launcher: tiles, icons, colors, links. No status polling, no widgets.

**Strengths:**
- Extremely simple: add a tile, pick an icon, open the URL — that's it
- Well-tested across many years of homelab use
- Enhanced apps (small subset of popular services) show live API-fetched data inline
- Docker-friendly; LinuxServer.io image is widely deployed

**Weaknesses:**
- PHP/Laravel stack is increasingly out of step with the ecosystem
- No real user/tenant model; single-admin shared view
- No live status polling (only enhanced-app tiles get live data)
- Not a PWA
- Visual design shows its age; no modern theming
- Maintenance is slow; new features are rare

**License:** MIT  
**Maintenance health:** Low — stable but not actively developed  
**vs Homepad:** Heimdall is the prototype Homepad improves on: Homepad adds multi-tenancy, OIDC, live status, per-user ordering, and modern glassmorphic UI. Heimdall is simpler to deploy but delivers far less.

---

### 2.5 Flame

**What it is:** A minimal Node.js launcher focused on bookmarks and apps. Postgres or SQLite backend; extremely lightweight. Docker-only.

**Strengths:**
- Very fast and lean — sub-10 MB Docker image
- Clean, modern-ish UI with customizable theming
- Docker label auto-discovery for apps
- Weather widget

**Weaknesses:**
- No status monitoring beyond basic ping
- Single-user; no multi-tenancy or role system
- No OIDC
- Small feature footprint; limited customization
- Maintenance has been slow since ~2023 (needs verification)

**License:** MIT  
**Maintenance health:** Low — minimal recent activity (needs verification)  
**vs Homepad:** Flame is a subset of Homepad's feature set. Its appeal is extreme simplicity, not capability.

---

### 2.6 Organizr

**What it is:** A PHP dashboard focused on **tab-based iframe embedding** of self-hosted services — functionally an SSO portal more than a launcher. Users navigate between services without leaving the Organizr window.

**Strengths:**
- Tab-based iframe embedding keeps the user in one window across all services
- User groups and homepage access control (different tabs per group)
- Built-in auth portal; integrates with Plex/Emby, LDAP, OAuth
- Notifications from services (Sonarr/Radarr calendar, etc.)

**Weaknesses:**
- PHP stack; performance and maintainability concerns
- Iframe embedding breaks on services with `X-Frame-Options: deny` (same problem Homepad's IframeOverlay has, but Organizr surfaces it more visibly)
- Not designed for a glassmorphic or modern visual language
- Not a PWA
- Maintenance is inconsistent; community-driven

**License:** Custom non-commercial license (*needs verification* — previously restricted personal/non-commercial only)  
**Maintenance health:** Moderate  
**vs Homepad:** Organizr and Homepad have different UX models — Organizr embeds everything in-window; Homepad opens tiles in new tabs (or now also as an iframe overlay). Organizr has stronger access-control/portal features; Homepad has cleaner design, OIDC, multi-tenancy, and a properly abstracted status layer.

---

### 2.7 Glance

**What it is:** A newer (2024+) Go-based dashboard emphasizing information-dense widgets — RSS feeds, Reddit, weather, GitHub, YouTube, stock prices. Static YAML config; no user accounts.

**Strengths:**
- Go binary: single binary, minimal resources, fast startup
- Information-rich default widgets out of the box — news, stocks, weather, repos
- Clean, readable default design
- Active and fast-moving development as of 2025/2026

**Weaknesses:**
- Static config — no in-browser editing, no database
- No user accounts, no multi-tenancy
- Not a launcher in the traditional sense — more of a personal news/information board
- No live service-status integration in the homelab sense (Gatus, Uptime Kuma)

**License:** AGPL-3.0  
**Maintenance health:** Excellent — among the most actively developed new entrants  
**vs Homepad:** Glance and Homepad serve partially different needs. Glance is a personal information hub; Homepad is a household service launcher with status. They could coexist. Glance's single-binary Go architecture is a deployment simplicity model Homepad's Go API approaches on the backend.

---

### 2.8 Homer

**What it is:** A pure static YAML dashboard. No server, no database — just a set of static files served by any web server. The simplest possible launcher.

**Strengths:**
- Zero runtime: serve the `dist/` folder from any static host (Nginx, Caddy, S3)
- No processes to manage; gitops-friendly config
- Status checks via HTTP ping (client-side)
- Extremely fast

**Weaknesses:**
- No dynamic features whatsoever — no in-browser editing, no user accounts, no favorites, no ordering
- Client-side status pings leak internal service hostnames to the browser
- Minimal widget support
- Not a PWA
- Development has slowed significantly since 2023

**License:** Apache-2.0  
**Maintenance health:** Low-moderate — stable but slow  
**vs Homepad:** Homer is the floor of the market — maximum simplicity, minimum capability. Homepad is the ceiling.

---

### 2.9 Others Worth Noting

**Mafl** — A newer Vue 3 / Nuxt dashboard (2024+) with a clean design and growing integration library. Similar positioning to Homarr but leaner. Maintenance health: early/active. No multi-tenancy. *(needs verification on current state)*

**Fenrus** — A Node.js dashboard with a visually distinctive card design and smart integrations (media servers, search). Includes basic user accounts. Less popular than the top-tier options; less maintained. *(needs verification)*

**Linkding / Linkwarden / Shiori** — Bookmark managers rather than dashboards; not direct competitors but serve adjacent use cases for users who primarily want organized links.

**Uptime Kuma** — Not a launcher, but often used alongside a dashboard for status monitoring. Homepad's Gatus integration replaces the need to embed an Uptime Kuma iframe.

---

## 3. Paid / Commercial Options

### 3.1 Home Assistant (with Lovelace/Mushroom dashboards)

**What it is:** The dominant open-source smart-home platform. Its UI (Lovelace/Mushroom) can be configured as a service dashboard with live data from hundreds of integrations.

**Pricing:** Free and open-source (core); Home Assistant Cloud (Nabu Casa) ~$7/month for remote access + voice features  
**Strengths:** Unmatched smart-home integration; deeply customizable dashboards; multi-user support with per-user dashboards; active development; massive community  
**Weaknesses:** Massive scope — it's an automation platform, not a launcher; setup complexity is high; not designed for "I just want a tile grid of my web apps"; heavy resource footprint  
**vs Homepad:** Home Assistant is overkill for a service launcher. Users who run Home Assistant usually want automation, not a homepage. They may run both.

### 3.2 Hubitat Elevation

**What it is:** A local smart-home hub (hardware + software). Dashboard included.  
**Pricing:** Hardware ~$150 one-time; cloud subscription optional  
**Strengths:** Local-only operation; fast automations; good Z-Wave/Zigbee support  
**Weaknesses:** Primarily a smart-home controller, not a service launcher; dashboard is basic  
**vs Homepad:** Not a direct competitor.

### 3.3 Start.me

**What it is:** A browser-based personal start page with widgets (RSS, weather, bookmarks, notes, search). SaaS.  
**Pricing:** Free tier (limited); Pro ~$3/month  
**Strengths:** Zero setup; runs in the browser; clean bookmark/widget organization  
**Weaknesses:** Cloud-only; no self-hosting; no service-status integration; no OIDC; general-purpose start page, not homelab-aware; stagnant development  
**vs Homepad:** Different user. Start.me is for browser homepage customization. Homepad is for homelab service access.

### 3.4 Netvibes

**What it is:** An enterprise SaaS dashboard platform (now primarily B2B). Legacy personal dashboard product now pivoted to business analytics.  
**Pricing:** Enterprise pricing (opaque)  
**vs Homepad:** Not a direct competitor; mentioned for completeness.

### 3.5 Notion / Linear / Outline as "start pages"

Some homelab users repurpose tools like Notion as a start page with embedded links. This is common but is a workaround, not a product competing with Homepad.

### 3.6 Portainer / Cockpit / Proxmox dashboards

Infrastructure management dashboards that expose service status. Often used alongside a launcher like Homepad, not instead of one. Not direct competitors.

---

## 4. Feature Comparison Matrix

| Product | Self-hosted | Multi-tenant | Live status/health | Auth / SSO | PWA / mobile | Theming | Per-user config | Active maint. |
|---|---|---|---|---|---|---|---|---|
| **Homepad** | ✅ | ✅ full | ✅ server-side Gatus | ✅ OIDC + local | ✅ | ✅ glassmorphic, 8 accents | ✅ favorites, order, click action | ✅ |
| Homepage | ✅ | ❌ | ✅ 100+ widgets | ❌ | ❌ | ✅ themes | ❌ | ✅ excellent |
| Homarr | ✅ | ⚠️ limited | ✅ browser-side | ⚠️ local only | ❌ | ✅ | ⚠️ basic | ✅ good |
| Dashy | ✅ | ❌ | ✅ many | ⚠️ Keycloak opt. | ⚠️ partial | ✅ extensive | ❌ | ⚠️ slowing |
| Heimdall | ✅ | ❌ | ⚠️ enhanced only | ❌ | ❌ | ⚠️ basic | ❌ | ❌ low |
| Flame | ✅ | ❌ | ⚠️ ping only | ❌ | ❌ | ⚠️ limited | ❌ | ❌ low |
| Organizr | ✅ | ⚠️ groups | ⚠️ tab-embed | ✅ LDAP/OAuth | ❌ | ⚠️ dated | ⚠️ group tabs | ⚠️ moderate |
| Glance | ✅ | ❌ | ⚠️ info widgets | ❌ | ❌ | ⚠️ limited | ❌ | ✅ excellent |
| Homer | ✅ | ❌ | ⚠️ client ping | ❌ | ❌ | ⚠️ basic | ❌ | ❌ low |
| Home Assistant | ✅ | ✅ | ✅ deep integration | ✅ | ✅ | ✅ extensive | ✅ | ✅ excellent |
| Start.me | ❌ cloud | ❌ | ❌ | ❌ | ⚠️ | ✅ | ⚠️ bookmarks | ⚠️ moderate |

**Key:** ✅ = full support · ⚠️ = partial/limited · ❌ = absent

---

## 5. Where Homepad Is Differentiated — and Where It's Behind

### 5.1 Homepad's Genuine Differentiators

**Multi-tenancy as a first-class citizen.** No open-source launcher in the field ships per-user tile ordering, per-user favorites, and a shared service catalog as a coherent, production-ready system. Homarr is working toward this; nobody else is close. For a household with 2–5 users who each want "their" view of the same set of services, Homepad is the only ready option.

**Server-side Gatus abstraction.** The Gatus URL never reaches the browser. This is architecturally clean and a genuine security/privacy property: internal monitoring topology is not exposed to browser sessions, and status freshness is controlled server-side. Competitors that poll from the browser (Homepage per-widget, Homer, Homarr for most widgets) leak internal hostnames and service URLs to the client.

**OIDC/PocketID integration baked in.** Most open-source dashboards are local-account-only or bolt on SSO via a reverse-proxy (Authelia, Authentik) that sits in front of the whole app. Homepad's OIDC flow is native — PKCE, JWKS verification, admin group claim, graceful degradation when OIDC is off. For a homelab running PocketID or any OIDC provider, this is plug-and-play.

**PWA + mobile quality.** The v15 glass design and touch-target hardening (44px minimum, v20) means Homepad is designed to be installed on a phone's home screen and used as a daily driver. Few competitors treat mobile as a first-class surface.

**Glassmorphic design system.** The v15 redesign gives Homepad the most visually cohesive and modern design in the field. This is not a vanity point — for a household dashboard that appears on every device every day, aesthetics matter.

**Admin tile CRUD in-browser.** The TileEditModal and Edit Dashboard mode mean the catalog can be managed by a household admin without touching config files. Homepage, Homer, and Dashy require YAML edits and container restarts.

### 5.2 Homepad's Honest Gaps

**Widget breadth.** This is the largest gap. Homepage ships 100+ service widgets (Sonarr, Radarr, Plex, Proxmox, Portainer, Pi-hole, etc.) showing live metrics. Homepad tiles show status (UP/DOWN/DEGRADED/UNKNOWN) via Gatus — but not, for example, "3 movies downloading," "Plex has 4 active streams," or "Proxmox node is at 67% CPU." Users who want an information-rich dashboard will reach for Homepage alongside or instead of Homepad.

**Deployment simplicity.** Homepage ships as a single Docker Compose stanza. Homepad requires two containers (frontend + Go API) plus Postgres. The operational footprint is meaningfully larger, which is a friction point for new deployments. No Helm chart or single-file Compose is surfaced prominently.

**No Docker/container discovery.** Homepage and Homarr can scan Docker labels and auto-populate the tile catalog. Homepad requires manual admin catalog entry. For users who auto-generate their service list from Compose labels, this is a recurring papercut.

**No in-app notification / alerting surface.** When a service goes DOWN, Homepad surfaces it visually in the health panel. It does not push a notification, trigger an alert, or integrate with a notification channel (Gotify, ntfy, Discord). Competitors with tighter Uptime Kuma / Gatus integrations can route alerts.

**Single Gatus source.** Homepad polls one Gatus instance. Homelabs with multiple monitoring backends (or no Gatus) require workarounds. Support for Uptime Kuma or a generic ping-based fallback would broaden the addressable user base.

**No tile groups / sections from admin.** The catalog is a flat list with admin-defined tile data. Visual grouping into sections (e.g. "Media," "Infrastructure," "Dev") is not currently a first-class admin feature. Competitors (Homer, Homepage, Dashy) have per-section organization. *(Verify: check if this shipped in a recent spec — the SPEC-245 shared-catalog model may address this.)*

**No public/guest mode.** Some homelabs want an unauthenticated landing page for guests on the local network with a subset of tiles. Homepad requires login for everything.

---

## 6. Recommendations — Product Moves to Win the Niche

These are ordered by estimated impact-to-effort ratio.

### R-1: Admin Tile Grouping / Sections

**Gap addressed:** flat catalog, no visual organization.  
**Move:** Add an admin-managed `section` / `group` field to catalog entries. Tiles render under a section header in both admin and user views. Per-user ordering still works within and across sections.  
**Why it matters:** Every competitor has this. The absence of grouping is a visible maturity gap for homelabs with 15+ services. This is a contained schema + UI change.

### R-2: One-Click Compose Deployment (`docker compose up`)

**Gap addressed:** deployment friction (two containers + Postgres).  
**Move:** Ship a canonical `docker-compose.yml` in the README or a `deploy/` folder with sane defaults (internal Postgres, pre-configured Nginx), a `.env.example`, and a quickstart script. The goal is "clone, fill in 5 env vars, `docker compose up`, done."  
**Why it matters:** Homepage and Flame win many comparisons on "ease of setup." Homepad's architecture is not fundamentally harder to run — it just lacks the onboarding packaging. This costs almost nothing to ship.

### R-3: Uptime Kuma / Generic HTTP Status Source

**Gap addressed:** single Gatus dependency.  
**Move:** Extend the status poller to support Uptime Kuma's status API and/or a simple HTTP-ping mode (poll a URL, consider it UP if 2xx). Keep Gatus as the primary and most feature-rich path.  
**Why it matters:** Many homelabs run Uptime Kuma. Adding a second status source unlocks a segment that would otherwise choose a different launcher.

### R-4: Service Widget Library (Phase 1 — top 5)

**Gap addressed:** widget breadth vs. Homepage / Homarr.  
**Move:** Introduce a lightweight widget framework (a per-tile backend fetch + a small React component to render data) and ship widgets for the top 5 most common homelab services: Pi-hole (query count / blocking status), Proxmox or Portainer (container/VM count), Sonarr or Radarr (queue depth), and Plex/Jellyfin (active streams). Server-side fetch only — the browser never talks to these services.  
**Why it matters:** This is a large effort but it's the single feature request most likely to pull users away from Homepage. A Phase 1 of even 5 widgets changes the comparison. The server-side-only architecture is already a differentiator over Homepage's browser-side approach.

### R-5: Docker Label Auto-Discovery (Optional Mode)

**Gap addressed:** manual catalog management.  
**Move:** Add an optional background job in `homepad-api` that reads Docker socket labels (`homepad.enable=true`, `homepad.name=`, `homepad.url=`, `homepad.icon=`) and syncs them into the shared catalog. Admin can review/override discovered tiles. Runs alongside (not instead of) manual catalog management.  
**Why it matters:** This dramatically lowers the "first 10 tiles" setup time and is a frequently cited reason users choose Homepage or Homarr. It is architecturally natural given the Go backend.

### R-6: Public / Guest Tile Subset

**Gap addressed:** no unauthenticated access for household guests.  
**Move:** Add a per-tile `visibility` flag: `private` (login required) or `public` (visible to unauthenticated requests on the same network). An unauthenticated landing page shows only public tiles with no edit controls. Login button is present.  
**Why it matters:** Households with a TV/display running a kiosk-mode dashboard, or guests on the network who need to find the NAS or the printer, can't use Homepad today without a login. This opens a real use case at low implementation cost.

---

## 7. Appendix: Sources and Verification Notes

This document is based on knowledge current as of mid-2026. The following items are marked **needs verification** and should be confirmed before citing in external materials:

- Homepage star count (~20k GitHub stars): verify current figure at `github.com/gethomepage/homepage`
- Homarr v1.0 milestone and current multi-tenancy state: verify at `github.com/ajnart/homarr`
- Dashy Vue 3 migration status and maintenance pace: verify at `github.com/Lissy93/dashy`
- Organizr license type (was non-commercial at one point): verify at `github.com/causefx/Organizr`
- Flame last commit date and maintenance status: verify at `github.com/pawelmalak/flame`
- Mafl current state and maintenance pace: verify before citing
- Glance AGPL license and current widget list: verify at `github.com/glanceapp/glance`

---

*End of document. For product questions or to action these recommendations, reach Walt via Joe.*
