# Cycle 3 — Growth funnel: one-command install, a README for users, then a launch kit

**Milestone:** M7 — Growth: install funnel + launch
**Maturity:** ga
**Status:** IN_PROGRESS
**Started:** 2026-10-13
**Completed:** TBD
**Planned:** 2026-10-13. Caleb set the goal and the priority ("fix the funnel, then launch") and pre-approved GitHub metadata, releases and images, and site PRs. Run autonomously, with updates.

## Work Items

| ID | Item | Repo | Acceptance |
|---|---|---|---|
| A | Public API image + semver tags | homepad-api, homepad | `ghcr.io/finish06/homepad-api` is public. A push to `main` publishes `:<sha>` and `:latest`; a `v*` tag also publishes `:X.Y.Z`. homepad gets the same `v*` handling |
| B | Quickstart compose | homepad | Download one file → set one secret → `docker compose up -d` → login works. Gatus is optional (a profile). Verified on a clean Docker host with no repo checkout, log attached |
| C | README for users | homepad (+ api pointer) | Screenshot, one-command install, comparison and demo link above the fold; developer content moved to `docs/development.md`; no internal hostnames |
| D | Site funnel + SEO | getHomepad | Install steps match the README; CTAs carry Umami events; meta, OG, sitemap and robots in place |
| E | Launch kit | — | Drafts for r/selfhosted, r/homelab, selfh.st, Show HN, AlternativeTo, with the honest comparison and the demo link. Caleb posts |

Order: A → B → C (C documents B) → D → E. A and D are independent.

## Validation

- [ ] B's clean-host install log: no repo checkout, published images only
- [ ] Nothing public carries the prod URL, cluster names, internal hostnames or IPs (grep before each publish)
- [ ] Prod is untouched: no homelab change, no internal-registry change
- [ ] Each PR is QA-approved at its head SHA

## Progress Log

| Time | Item | Status | Notes |
|---|---|---|---|
| 2026-10-13 | plan | done | Milestone M7 + this plan. GitHub metadata done (topics, homepage, description). homepad-api#72 merged as #73 (`a42d0cd`) via Joe/Stitch |
