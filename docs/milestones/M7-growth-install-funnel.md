# Milestone: M7 — Growth: an install a stranger finishes, then a launch

**Target Maturity:** GA (maintain)
**Status:** IN_PROGRESS
**Horizon:** NOW
**Started:** 2026-10-13
**Target:** 2026-11-12 (30 days)
**Owner:** Caleb (goal); homepad-21 runs it autonomously (Caleb, 2026-10-13: "free to run here, keep me updated, never share confidential info")

## Goal

**Triple gethomepad.dev traffic in 30 days** (Umami), and get more people starring and pulling Homepad on GitHub.

From this baseline there is little to lose, and every visitor we win is lost at the install step. So: **fix the funnel first** (week 1), **then launch** (week 2+). Caleb publishes the launch posts himself; I draft them.

## Baseline (2026-10-13)

| Metric | Value | Source |
|---|---|---|
| gethomepad.dev visitors / 30d | requested from Joe | Umami (`013fa9d0-…`) |
| GitHub stars / forks | 0 / 0 | api.github.com |
| GitHub unique visitors / 14d | 9 (27 views); referrers: Google 1, chatgpt.com 1 | repo traffic API |
| GHCR `homepad` downloads | single digits | package page |
| GHCR `homepad-api` | **does not exist** | ghcr.io |

## Funnel defects found (2026-10-13)

1. **No one-command install.**
   - `compose.yaml` builds **both** images from source: `build:` from this repo and from a git URL of homepad-api.
   - There is no public API image at all.
   - The `api` service `depends_on: gatus`.
   - Competitors (Homepage, Homarr, Dashy, Heimdall) install with one `docker run`.
2. **The web image can't be used on its own.** Its nginx config has no `/api/` proxy; that only works through the separately mounted `deploy/compose/nginx.conf`.
3. **The README is written for developers.**
   - It has a k3s namespace diagram, spec AC references, a stale `v15.6.0` badge, and no screenshot or quickstart near the top.
   - The repo root carries internal files: STATUS*.md, retros/, qa-artifacts/, design-review-*.md.
4. **The GitHub repos had no topics and no homepage.** Fixed 2026-10-13.
5. **The pitch differs everywhere.** The site, the GitHub description and the README describe three different products.

## Success Criteria

- [ ] Umami: 30-day visitors at ≥ 3× the baseline by 2026-11-12, measured by Joe's pull
- [ ] A stranger installs with **one command** and sees a working dashboard. Verified on a clean Docker host, with a log
- [ ] Public, version-tagged images for **both** web and API on GHCR (`:16.7.x`, `:latest`)
- [ ] The README leads with a screenshot, the one-command install and the comparison
- [ ] The site's install steps match the README; CTAs are tracked as Umami events; SEO basics are in place
- [ ] A launch kit drafted for Caleb (r/selfhosted, r/homelab, selfh.st, Show HN, AlternativeTo); posting dates and results logged here
- [ ] GitHub stars and GHCR pulls tracked weekly in this file

## Features

| Feature | Repo | Position | Notes |
|---|---|---|---|
| Public API image on GHCR (+ semver tags on both) | homepad-api, homepad | SHAPED | Copy homepad's `ghcr-release.yml`; add `v*` tag handling |
| Quickstart compose (published images, Gatus optional) | homepad | SHAPED | nginx config inlined via compose `configs:`, so the published image is enough and prod's ConfigMap is untouched |
| README rewrite | homepad, homepad-api | SHAPED | Move developer content to `docs/development.md` |
| Site funnel + SEO | getHomepad | SHAPED | Audit in progress |
| Launch kit | — | SHAPED | Drafts for Caleb; posting is his |
| Competitive features (import from Homepage config, Docker discovery) | homepad, homepad-api | IDEA | Only after the launch shows what people ask for; each needs a spec |

## Risks

| Risk | Mitigation |
|---|---|
| Launch traffic hits a broken install | Funnel first; a clean-host install test before any post |
| Leaking internal details on public surfaces | Public text never carries the prod URL, cluster names, internal hostnames or IPs; reviewed before each publish |
| Changing what prod runs | Prod uses the homelab ConfigMap and the internal registry; nothing in this milestone changes those |
| Growth depends on channels only Caleb can post to | Drafts ready early; the timing is Caleb's |

## Cycles

| Cycle | Features Advanced | Status | Outcome |
|---|---|---|---|
| cycle-3 | API image, quickstart compose, README, site, launch kit | IN_PROGRESS | `.add/cycles/cycle-3.md` |

## Progress log

| Date | Event |
|---|---|
| 2026-10-13 | Goal set. GitHub metadata fixed on both repos: homepage gethomepad.dev, a user-facing description, 12 topics |
