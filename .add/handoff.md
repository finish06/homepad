# Session Handoff

**Written:** 2026-11-26 (M10 closed; 18.7.0 in production)

## Where things stand
- **18.7.0 is in production** since 2026-11-26 14:39Z (`fd60fa7`, homelab 56fe6243; rollback `5475545-beta`). GitHub release published.
- The full Content-Security-Policy is live on staging and production (checked 2026-11-25). The per-PR preview still sends only `frame-ancestors` (#715).
- **No milestone is active.** M10 (UI review, first batch) is COMPLETE: #735, #736, #740, #746, #753, release #758. M9, M3, M4 and M6 closed before it. `planning.current_milestone` is null.

## Done this window
- M10 built in three workstreams and shipped as 18.7.0. #753 reversed SPEC-group-header-collapse §3.5 (a failed load no longer lets a fold overwrite the saved set).
- #729 closed M9, M3, M4 and M6 in the docs, brought the PRD, specs index, spec `Status:` lines and docs up to 18.6.0, and added a dark-mode login contrast gate (#379).

## Needs Caleb
- After a failed or slow saved-folds load, should a late reply or a retry turn fold saving back on? (SPEC-group-header-collapse §10)
- #724 accent: option A or B.
- Production `OIDC_MEMBER_GROUP`. It is unset, so only the `Family` group gets SSO accounts. Since 18.1.0 it can be set in Admin Panel → System → Sign-in.
- Two production checks as admin: the reset-link Copy button over HTTPS, and the PocketID line in Add an adult.
- M7 launch posts (drafts in getHomepad #30).

## Open issues
- #576: staging HTTPS ingress serves the wrong certificate. Staging is used over http. It is the last open item in M2.
- Kare: screen checks of the pip shapes, skeleton/empty-box button and group status bar (shipped without them).
- #745: health panel shifts the page as services load.
- #691 (QA runner has no Go or node_modules) closed 2026-11-25; `docs/testing.md` still says QA's runner has no Go, and that a "not measured" repo gate is expected.
- QA bots keep refiling two flakes: Go tests on a shared DB in parallel (#730…#760, 11 issues) and mobile kid-accounts TC-001 (6 issues).
- #715: preview CSP.
- #727: QA code-review input on ci-shared @v3.
- #717, #719–#721, #723, #724 (accent decision), #726: the rest of the 2026-11-24 UI review, ranked.

## Rules learned this window
L-022…L-026: one clear owner ask plus a workaround, then slow the check; reserve shared files for parallel builds; verify no Docker after agent runs; measure CI frame cost before adding waits; sync "never waits" tests on events, not time.
