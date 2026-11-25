# Milestone: M3 — Robustness & security

**Target Maturity:** GA (maintain)
**Status:** COMPLETE
**Horizon:** DONE
**Started:** 2026-11-22 (#334 shipped in 18.0.0)
**Completed:** 2026-11-25 (18.6.0 in production since 2026-11-24, with the full CSP on staging and production)
**Created:** 2026-10-11 — from the backlog triage that closed 26 of 71 open issues with evidence (see `.add/handoff.md`)

## Goal

Close the remaining robustness and security gaps in the client: the missing error boundary and the missing Content-Security-Policy. Tidy the two smaller behaviour issues alongside them. (The iframe sandbox, the other original gap, shipped in 18.0.0.)

## Success Criteria

- [x] #334: iframe sandbox decided and pinned. 18.0.0 uses a strict sandbox by default, and an app gets `allow-same-origin` only when an admin opts it in (see the 18.0.0 CHANGELOG, "Overlay apps"; SPEC-iframe-sandbox-optin)
- [x] #341: every lazy overlay sits inside an ErrorBoundary; a failed chunk fetch shows a recoverable error instead of crashing the app — tested by simulating the failure. 18.3.0, #703: `src/ui/ChunkErrorBoundary.tsx` wraps every lazy `<Suspense>` and shows **Reload** and **Close**. Tests: `src/ui/ChunkErrorBoundary.test.tsx` and `tests/browser-gate/lazy-chunk-error-341.spec.ts`, which aborts the real Settings chunk
- [x] #335: blocked-embed detection (X-Frame-Options / CSP) — improve it, or document the limitation in the UI copy. 18.3.0, #703 took the second path: the Inline overlay hint in the tile editor says some sites block embedding, and that you then get a link to open it in a new tab (`TileEditModal.test.tsx`)
- [x] #451: `retryNote` resets when the health panel re-enters STALE. 18.3.0, #703 (`HealthPanel.test.tsx`)
- [x] #529: a Content-Security-Policy on staging and prod, from a spec and an audit of inline code and origins. 18.6.0, #711 ([SPEC-cleanup-18.6.0](../../specs/SPEC-cleanup-18.6.0.md)): the image and both compose configs send it, and the homelab ConfigMap carries the same line (§7). Checked on 2026-11-25: staging and production answer `/`, a script file, `/version.json` and `/manifest.webmanifest` with exactly one full policy header

## Appetite

One cycle.

## Features

### Feature Detail

| Feature | Spec | Position | Status | Cycle |
|---------|------|----------|--------|-------|
| Iframe sandbox | [SPEC-iframe-sandbox-optin](../../specs/SPEC-iframe-sandbox-optin.md) | DONE | #334 — strict sandbox + per-app opt-in, 18.0.0 | — |
| Content-Security-Policy | [SPEC-cleanup-18.6.0](../../specs/SPEC-cleanup-18.6.0.md) | DONE | #529 — 18.6.0 (#711); image, compose and the staging and prod ConfigMap | — |
| ErrorBoundary for lazy overlays | [SPEC-ui-cleanup-18.3.0](../../specs/SPEC-ui-cleanup-18.3.0.md) | DONE | #341 — 18.3.0 (#703) | — |
| Blocked-embed fallback | [SPEC-ui-cleanup-18.3.0](../../specs/SPEC-ui-cleanup-18.3.0.md) | DONE | #335 — 18.3.0 (#703), the limit is said in the UI copy | — |
| Stale retry note | [SPEC-ui-cleanup-18.3.0](../../specs/SPEC-ui-cleanup-18.3.0.md) | DONE | #451 — 18.3.0 (#703) | — |

Every issue listed here was **re-checked against `main` at `57733eb` on 2026-10-11** and is still true. Issues that turned out to be fixed, obsolete or duplicates were closed with evidence rather than carried in.

## Dependencies

Client work, except #529: the CSP header is set in the homelab ConfigMap (Joe).

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Dropping `allow-same-origin` breaks embedded apps that need cookies or storage | MED | HIGH | Inventory which tiles use the iframe click action before changing the sandbox; decide per threat model, not by default |
| An ErrorBoundary hides real failures | LOW | MED | Show the error and a retry, and log it; never swallow silently |

## Cycles

| Cycle | Features Advanced | Status | Outcome |
|-------|-------------------|--------|---------|
| — | — | — | No ADD cycle. The work went out in 18.0.0, 18.3.0 and 18.6.0 |

## Left over

- #715 (open): the per-PR preview sends only `frame-ancestors 'none'`, not the full policy. The preview's nginx config lives in the homelab repo, like the staging and prod ConfigMaps.
- When a release changes the inline theme script in `index.html`, the hash in the ConfigMap must change in the same promotion (SPEC-cleanup-18.6.0 §7). `tests/infra/frame-headers.test.ts` catches drift in this repo, not in the ConfigMap.

## Retrospective Notes

- The milestone sat in Next while all five items shipped inside other releases. It is closed after the fact, from the CHANGELOG and the PRs.
- #529 needed a change outside this repo. Putting the exact ConfigMap lines in the spec (§7) let it go out in the same promotion as the image.
