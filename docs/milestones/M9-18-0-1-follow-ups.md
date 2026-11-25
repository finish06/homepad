# Milestone: M9 — 18.0.1: release follow-ups

**Target Maturity:** GA (maintain)
**Status:** COMPLETE
**Horizon:** DONE
**Started:** 2026-11-22 (the doc fixes in #620)
**Completed:** 2026-11-25 (18.6.0 in production since 2026-11-24; every issue below closed on Gitea)
**Created:** 2026-11-22, from the QA issues filed during 17.1.0 and 18.0.0 and the release's own follow-up list

## Goal

Fix what QA found while 17.1.0 and 18.0.0 were going out, and bring the specs and docs back in line with what shipped. A patch release (18.0.1) with no new features.

The fixes went out in 18.0.1. The last few came later, inside the 18.4.0 and 18.5.0 cleanups. The "Needs Caleb" items are not release work and are carried below.

## Success Criteria

### Product fixes

- [x] `/api/*` responses carry `X-Frame-Options` / `frame-ancestors` like the rest of the site (#612). 18.0.1, homepad-api#112
- [x] `-beta` builds report the real version, so a backup from production doesn't say `homepadVersion: "dev"` (#613). 18.0.1, homepad-api#112
- [x] The reset-link dialog has no ~150px empty gap (#617). 18.0.1, #632
- [x] The Accounts section still renders when `GET /api/admin/invites` fails (#583). 18.0.1, #632. #581 closed as its duplicate
- [x] An invite link opened in an already-open tab is handled and the token leaves the address bar (#582). 18.0.1, #632. #580 closed as its duplicate
- [x] Copy buttons work, or say why they can't, on plain-HTTP installs: Homepage import (#587) and the Gatus snippet (#584). 18.0.1, #632
- [x] What's new opens on the first load after an upgrade (#590). 18.0.1, #632
- [x] The invite API's role name matches the UI and docs: `member`, not `user` (#599). 18.4.0, #707. `user` is still accepted until 19.0.0 (SPEC-decisions-18.4.0 §2)
- [x] Restoring an unchanged backup keeps non-URL app icons (#585). 18.0.1, homepad-api#112
- [x] The homelab manifest fetch says the token is missing instead of an opaque 404 (#578). 18.5.0, #709. #577 closed as its duplicate
- [x] The first-sign-in switch saves in a scripted run (#602). Closed as not reproducible on 2026-11-22: a clean rerun saved, and the run's own note pointed at script timing
- [x] Staging reports `registration: open` (#615). Closed as a decision on 2026-11-24: staging is open on purpose so QA can sign up (OIDC is off there). Joe's reasons are on #615

### API follow-ups (`api/`)

- [x] The invite and reset-link lookups get a process-wide bound (dropped from the per-IP ceiling in #110). 18.0.1, homepad-api#112: one shared bucket, separate from sign-in (`TestLimits_LookupsShareAProcessBound`)
- [x] The #110 review nits: `failLogged` is reset, and the lock-waiter test query is narrowed. 18.0.1, homepad-api#112

### Spec and doc hygiene

- [x] Approved specs no longer say "Pending" in their decisions and sign-off tables (#593, #563, #564). Docs PR #620 (2026-11-22)
- [x] The backup `schemaVersion` 2 note names the JSON Schema file (#594); the widget address-guard wording matches AC-018 (#588). #620
- [x] `.env.example`: the `HOMEPAD_TRUSTED_PROXIES` comment is one line (#609), 18.0.1, #632. The empty-proxies help line and the wait line (#610) are covered by browser tests instead of a live check, 18.5.0, #709
- [x] README spec index and docs-only path list are current (#542, #544, #598); SPEC-kid-accounts §6 data model is corrected (#543), #620. PR #579's description is updated (#595), done by hand on 2026-11-22
- [x] Old 16.7.x leftovers: changelog chip type (#537) fixed in 18.0.1, #632. Quickstart compose pin (#535) closed as obsolete: `compose.yaml` pins a version that exists. Missing `SESSION_SECRET` (#533) closed as obsolete: the API never read it, and 18.0.1 (#632) removed it from `.env.example` and `compose.build.yaml`

## Carried to Caleb (not milestone criteria)

These are production checks and a production setting, not release work. They are not done, as far as the repo and Gitea show. They were taken out of the success criteria when M9 closed, and are tracked in `.add/handoff.md`.

- On production, as admin: the reset-link Copy button works over HTTPS, and Add an adult shows the PocketID line
- Decide production `OIDC_MEMBER_GROUP`. While it is unset, only the `Family` group gets SSO accounts. Since 18.1.0 an admin can set it in **Admin Panel → System → Sign-in**, with no restart

## Releases

| Release | Date | PRs | M9 items |
|---------|------|-----|----------|
| — (docs) | 2026-11-22 | #620 | #593, #563, #564, #594, #588, #542, #544, #598, #543 |
| 18.0.1 | 2026-11-22 (CHANGELOG; #636 merged and prod 11-23) | #632 (web), homepad-api#112 (API), release #636 | #612, #613, #617, #583, #582, #587, #584, #590, #585, #609, #537, the lookup bound, the #110 nits |
| 18.4.0 | 2026-11-24 | #707, release #708 | #599 |
| 18.5.0 | 2026-11-24 | #709, release #710 | #578, #610 |

18.1.0 to 18.6.0 also shipped work from outside M9: admin server settings (18.1.0), the API cleanup (18.2.0), UI and test setup (18.3.0), and the CSP (18.6.0). [M3](M3-robustness-security.md) closed with them.

## Tally

31 issues, all closed:

- **24 fixed.** 14 in a release (11 in 18.0.1, one in 18.4.0, two in 18.5.0), 10 in docs (#620 and the #579 description).
- **3 duplicates:** #581, #580, #577.
- **4 closed without a code change:** #602 (not reproducible), #615 (decision: staging stays open), #535 and #533 (obsolete).

The two API follow-ups had no issue; both shipped in 18.0.1. The two "Needs Caleb" items are open.

## Appetite

One cycle. It's a patch release: anything that turns out to need a spec moves out.

It ran over: 18.0.1 held most of it, and #599, #578 and #610 needed a decision or a test bundle, so they rode 18.4.0 and 18.5.0.

## Dependencies

- The API items ship in `api/` (the `homepad-api` image), which deploys before web.
- Staging-only checks (#607, #606) depend on M2's staging work. 18.5.0 (#709) covered both with browser tests instead.

## Cycles

| Cycle | Features Advanced | Status | Outcome |
|-------|-------------------|--------|---------|
| — | — | — | No ADD cycle. The work went out as the releases above |

## Left over

- The two "Needs Caleb" items above.
- #715 (open): the per-PR preview sends only `frame-ancestors 'none'`, not the full 18.6.0 policy. Staging and production send the full policy. M3 is closed, so it is tracked on its own: in the PRD roadmap's open list and `.add/handoff.md`.

## Retrospective Notes

- Two items needed a decision before any code (#599, #615). They waited on that call, not on the work. Marking "needs a decision" at the start would have shown the real end date.
- The API half of 18.0.1 shipped from the old homepad-api repo (#112). Since 18.1.0 both halves ship from this repo, under one tag.
