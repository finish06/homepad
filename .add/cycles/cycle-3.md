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
| 2026-10-13 | A: public images | DONE | homepad-api #74 (gracie). `ghcr.io/finish06/homepad-api` is public, amd64+arm64. Both repos publish `:X.Y.Z/:X.Y/:X` on `v*` tags; `:latest` still tracks main |
| 2026-10-13 | B: quickstart | DONE | #531 (ada). `compose.yaml` = published images + inlined nginx `/api` proxy and security headers; Gatus is a profile; `compose.build.yaml` for contributors. Healthcheck fixed (`localhost` → `::1`, nginx IPv4-only). Clean-machine runs: 16.7.3 healthy in 15s, 16.7.4 in 16s, on arm64 |
| 2026-10-13 | (lesson) | — | Opened #531 and #532 together; both deployed to the one staging slot and #531's rollout timed out. Re-ran it alone. **One homepad PR in staging at a time, even for docs** |
| 2026-10-13 | C: README | DONE | In #531. Screenshots/demo/install/comparison first; dev content moved to `docs/development.md`. Every claim checked against src: the site's "per-person click actions" was wrong (click action is per tile) |
| 2026-10-13 | 16.7.3 | released | #534 (gracie), tag `v16.7.3` = `5b2acb3`; homepad-api `v16.7.3` = `98d6293` (runtime = prod's `fe9b4e3`). Gitea + GitHub Releases. **NATS notify http=202**, so #528 is verified end to end. Not promoted |
| 2026-10-13 | D: site | DONE | getHomepad #27 (ada), 0.4.0 live: real quickstart via the `gethomepad.dev/compose.yaml` 302, accurate title (no more "knows who's home"), `/privacy.html`, 10 tracked CTAs (was 6), JSON-LD |
| 2026-10-13 | demo status | redesigned | homepad-api #76: a Gatus inside the demo can't work on Cloud Run (request-scoped CPU, scale-to-zero, in-memory store), as Joe's review showed; my local 52/52 couldn't reveal it. **Caleb chose option A:** the homelab Gatus runs the 52 checks; `cmd/demo-status-snapshot` publishes a static, demo_-only snapshot to a public bucket; the demo reads it. Waiting on Joe/Gus. Joe's data: 18 of the last 31 days had zero demo visitors |
| 2026-10-13 | **seed leak** | fixed | The API's App Library seed (shipped in the public image, run on any empty DB) was 45 of the maintainer's own services on his personal domain. homepad-api #77 (gracie): the 52-app public catalog plus `TestLibrarySeedIsPublicCatalog` (negative-controlled: 45 hits on the old seed). Hostnames only, no credentials. Old seed still in public git history since 2026-06-22: Caleb's call |
| 2026-10-13 | 16.7.4 | released | #536 (ada), tag `v16.7.4` = `d3173a3`; homepad-api `v16.7.4` = `c966c46`. Clean install via `gethomepad.dev/compose.yaml`: 52 public library offers, 0 personal URLs. Not promoted |
| 2026-10-13 | E: launch kit | drafted | `getHomepad/docs/launch-kit.md`: gates, UTM links, channel order, drafts (Caleb writes the opening; AI-assisted disclosed). Launch gated on demo status + Umami baseline |
