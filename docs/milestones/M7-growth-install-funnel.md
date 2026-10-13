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
| gethomepad.dev visitors / 30d (09-13 → 10-13) | **32** (prior 30d: 20); pageviews 42; bounce 91%; avg visit 14s | Umami, Joe's pull (getHomepad #26) |
| gethomepad.dev engaged sessions / 30d | `scroll-depth` 41 · `github-click` 21 · `demo-click` 4 | Umami events |
| Bot share (estimate) | ~42% of city-resolved visitors are in cloud-DC cities, so the human baseline is ~15–20 / 30d | Joe, #26 §6 |
| Referrers (90d) | github.com 6, google 3, bing 2; ~93% direct/none; **no UTM ever** | Umami |
| Zero-visitor days | 18 of the last 31 | Umami |
| GitHub stars / forks | 0 / 0 | api.github.com |
| GitHub unique visitors / 14d | 9 (27 views); referrers: Google 1, chatgpt.com 1 | repo traffic API |
| GitHub clones / 14d | 488 by 166 unique cloners: mostly automation (Actions checkouts, mirrors), not people | repo traffic API |
| GHCR total downloads | homepad 1 · homepad-api 1 (both images went public or first released 2026-10-13) | package pages |

**Target (2026-11-12):** ≥ 96 visitors / 30d on Umami's counter (3 × 32). Because ~40% of today's counter is bots, the goal is also tracked on a bot-resistant proxy: **`scroll-depth` sessions ≥ 3× 41** and **`install-copy` + `demo-click`**. The launch posts carry `utm_*` tags (launch kit), so the weekly pull can attribute each channel.

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
- [x] A stranger installs with **one command** and sees a working dashboard. Verified on a clean Docker host, with a log (16.7.4, 2026-10-13: healthy in 16s, arm64)
- [x] Public, version-tagged images for **both** web and API on GHCR (`:16.7.x`, `:latest`), amd64 and arm64
- [x] The README leads with a screenshot, the one-command install and the comparison
- [x] The site's install steps match the README; CTAs are tracked as Umami events; SEO basics are in place (getHomepad 0.4.0)
- [~] A launch kit drafted for Caleb (r/selfhosted, r/homelab, selfh.st, Show HN, AlternativeTo); posting dates and results logged here
- [ ] GitHub stars and GHCR pulls tracked weekly in this file

## Features

| Feature | Repo | Position | Notes |
|---|---|---|---|
| Public API image on GHCR (+ semver tags on both) | homepad-api, homepad | DONE | Copy homepad's `ghcr-release.yml`; add `v*` tag handling |
| Quickstart compose (published images, Gatus optional) | homepad | DONE | nginx config inlined via compose `configs:`, so the published image is enough and prod's ConfigMap is untouched |
| README rewrite | homepad, homepad-api | DONE (homepad) | Move developer content to `docs/development.md` |
| Site funnel + SEO | getHomepad | DONE | 0.4.0 live |
| Launch kit | — | DOWNHILL | Drafts for Caleb; posting is his |
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
| 2026-10-13 | 16.7.3 and 16.7.4 released (public multi-arch images, one-file install, user README, public App Library seed). Site 0.4.0 live. GitHub Releases created. Demo live status redesigned to option A (homelab snapshot), waiting on Joe/Gus. Launch kit drafted. Baseline hint from Joe: the demo had zero visitors on 18 of the last 31 days |
