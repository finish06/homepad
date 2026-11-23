# Milestone: M9 — 18.0.1: release follow-ups

**Target Maturity:** GA (maintain)
**Status:** NOT_STARTED
**Horizon:** NOW (active)
**Started:** TBD
**Completed:** TBD
**Created:** 2026-11-22, from the QA issues filed during 17.1.0 and 18.0.0 and the release's own follow-up list

## Goal

Fix what QA found while 17.1.0 and 18.0.0 were going out, and bring the specs and docs back in line with what shipped. A patch release (18.0.1) with no new features.

## Success Criteria

### Product fixes

- [ ] `/api/*` responses carry `X-Frame-Options` / `frame-ancestors` like the rest of the site (#612)
- [ ] `-beta` builds report the real version, so a backup from production doesn't say `homepadVersion: "dev"` (#613)
- [ ] The reset-link dialog has no ~150px empty gap (#617; it comes from `.kid-field` flex in `index.css`)
- [ ] The Accounts section still renders when `GET /api/admin/invites` fails (#583; #581 is the same bug)
- [ ] An invite link opened in an already-open tab is handled and the token leaves the address bar (#582; #580 is the same bug)
- [ ] Copy buttons work, or say why they can't, on plain-HTTP installs: Homepage import (#587) and the Gatus snippet (#584)
- [ ] What's new opens on the first load after an upgrade (#590)
- [ ] The invite API's role name matches the UI and docs: `member`, not `user` (#599)
- [ ] Restoring an unchanged backup keeps non-URL app icons (#585)
- [ ] The homelab manifest fetch says the token is missing instead of an opaque 404 (#578; #577 is the same bug)
- [ ] The first-sign-in switch saves in a scripted run (#602), or the issue is closed with a repro showing it was the test
- [ ] Staging reports `registration: open` (#615): decide whether that is the right staging setting, and fix the setting or close the issue

### API follow-ups (`api/`)

- [ ] The invite and reset-link lookups get a process-wide bound (dropped from the per-IP ceiling in #110)
- [ ] The #110 review nits: `failLogged` is reset, and the lock-waiter test query is narrowed

### Spec and doc hygiene

- [ ] Approved specs no longer say "Pending" in their decisions and sign-off tables (#593, #563, #564)
- [ ] The backup `schemaVersion` 2 note names the JSON Schema file (#594); the widget address-guard wording matches AC-018 (#588)
- [ ] `.env.example`: the `HOMEPAD_TRUSTED_PROXIES` comment is one line (#609); the empty-proxies help line and the wait line are checked live (#610)
- [ ] README spec index and docs-only path list are current (#542, #544, #598); SPEC-kid-accounts §6 data model is corrected (#543); PR #579's description is updated (#595)
- [ ] Old 16.7.x leftovers closed or fixed: changelog chip type (#537), quickstart compose pin (#535) and missing `SESSION_SECRET` (#533)

### Needs Caleb

- [ ] On production, as admin: the reset-link Copy button works over HTTPS, and Add an adult shows the PocketID line
- [ ] Decide production `OIDC_MEMBER_GROUP`. While it is unset, only the `Family` group gets SSO accounts

## Appetite

One cycle. It's a patch release: anything that turns out to need a spec moves out.

## Dependencies

- The API items ship in `api/` (the `homepad-api` image), which deploys before web.
- Staging-only checks (#607, #606) depend on M2's staging work.

## Cycles

| Cycle | Features Advanced | Status | Outcome |
|-------|-------------------|--------|---------|
| — | — | — | Not yet started |

## Retrospective Notes

Filled in when the milestone completes.
