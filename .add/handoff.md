# Session Handoff

**Written:** 2026-11-25 (M9, M3, M4 and M6 closed in the docs)

## Where things stand
- **18.6.0 is in production** since 2026-11-24 (`5475545`). 18.0.1 to 18.6.0 all shipped on 11-22 to 11-24.
- The full Content-Security-Policy is live on staging and production (checked 2026-11-25). The per-PR preview still sends only `frame-ancestors` (#715).
- **M10 is active** (UI review, first batch, 18.7.0; three specs approved 2026-11-25, ready to build). Before it: M9 (18.0.1 follow-ups), M3 (robustness and security), M4 (accessibility debt) and M6 (layout and design) are COMPLETE in `docs/milestones/`. `planning.current_milestone` is `M10-ui-review-first-batch`.

## Done this window
- #729 closed M9, M3, M4 and M6 in the docs, brought the PRD, specs index, spec `Status:` lines and docs up to 18.6.0, and added a dark-mode login contrast gate (#379).

## Needs Caleb
- Production `OIDC_MEMBER_GROUP`. It is unset, so only the `Family` group gets SSO accounts. Since 18.1.0 it can be set in Admin Panel → System → Sign-in.
- Two production checks as admin: the reset-link Copy button over HTTPS, and the PocketID line in Add an adult.
- M7 launch posts (drafts in getHomepad #30).

## Open issues
- #576: staging HTTPS ingress serves the wrong certificate. Staging is used over http. It is the last open item in M2.
- #691: QA runner has no Go or node_modules (Joe, runner side).
- #715: preview CSP.
- #727: QA code-review input on ci-shared @v3.
- #717, #719–#721, #723, #724 (accent decision), #726: the rest of the 2026-11-24 UI review, ranked, not in M10.

## Rules learned this window
L-022…L-026: one clear owner ask plus a workaround, then slow the check; reserve shared files for parallel builds; verify no Docker after agent runs; measure CI frame cost before adding waits; sync "never waits" tests on events, not time.
