# Spec: API cleanup for 18.2.0

**Spec ID:** SPEC-api-cleanup-18.2.0
**Version:** 0.1.0
**Created:** 2026-11-23
**Author:** Claude (Caleb asked, 2026-11-23: "clean up the open issues, pick a section and do an 18.2.0". This is the API section.)
**Status:** SHIPPED — 18.2.0 (2026-11-23): #698, release #700. Every listed issue is closed. Status line read "In review" until 2026-11-25.
**Repo:** `Code/homepad` (`api/`, `.gitea/workflows/`, `.github/workflows/`)
**Issues:** #651–#676 and #688, moved from the archived homepad-api repo on 2026-11-23
**Target version:** 18.2.0

---

## 1. Overview

28 issues came over from homepad-api. Most are QA advisories. Some were fixed before the move, some are process notes, and some are small real bugs. This spec sorts them, fixes the real ones with a test each, and closes the rest with evidence.

No new features. Two fixes change what a client sees (AC-001, AC-004). They are called out in the CHANGELOG.

## 2. Already fixed or no longer true (close with evidence)

| Issue | Evidence |
|---|---|
| #653 library-add not admin-gated | `api/internal/api/library.go:179` calls `requireAdmin`; `shared_catalog_test.go:131` (AC-010b) asserts 403 |
| #654 PR #34 description stale | Code gates it (above). Nothing left to change |
| #659 fetch-icon missing from the 501 stub list | The router registers every route once and swaps in a 501 in stub mode (`server.go:296`). There is no second list to drift |
| #661 kubectl without checksum | Every kubectl download is followed by `sha256sum -c` (`staging-release.yml:62,114`, `mr-staging.yml:133`, `preview-teardown.yml:35`) |
| #671 storage tests unguarded | `storage_test.go:27` goes through `dbguard.RequireTestDatabase` (eff74ce) |
| #673 demo-status-snapshot comment | `cmd/demo-status-snapshot` is not in the repo any more |
| #674 OIDC cookie ignores COOKIE_SECURE | Fixed in 71c7d53; every sign-in uses `baseSessionCookie` (`cookie.go:42`); `signin_small_bugs_test.go:120` |

## 3. Process and deploy notes (close, no code)

#655 (spec sign-offs, cap6 shipped long ago), #660 and #667 (staging ran an old image at the time; previews now run each PR's own image), #663 (migration tests need CREATEDB; CI's Postgres has it), #675 (registration default; intentional, documented in the CHANGELOG at the time), #676 (force-push during QA; the transfer code shipped and was reviewed since).

## 4. Acceptance criteria

| ID | Issue | Criterion | Priority |
|----|-------|-----------|----------|
| AC-001 | #656 | `POST /api/login` no longer checks the 8-character minimum. A short password is checked against the hash like any other: right → 200, wrong → 401. Registration still refuses passwords under 8 (400). | Must |
| AC-002 | #657 | The fetch-icon 422 contract says the body is plain text, like every other error from that handler, and the web app shows it as is. The v21 spec text is corrected. (Switching to JSON would make the tile editor show raw JSON.) | Should |
| AC-003 | #658 | A test: a favicon that is not a PNG (an ICO) → 422, and the stored icon is unchanged. | Should |
| AC-004 | #662 | `POST /api/services` returns the saved `gatus_key` in its 201 body. `POST /api/library/{id}/add` returns `clickAction`, `iframeSameOrigin` and `gatus_key` like the other service responses. | Should |
| AC-005 | #665 | `PATCH /api/me` writes every field in one `UPDATE`. If the write fails, no field is changed. | Should |
| AC-006 | #668 | `gatus.Client`'s threshold and base URL are unexported. The only way to change them is the locked setters, so the bypass cannot compile. `main.go` uses `SetDegradedAfter`. | Should |
| AC-007 | #669 | Before any destructive test, the guard also checks the real server: the connected database's name must pass the `_test` rule, and the database must carry a marker comment. A fresh database with no homepad tables gets the marker on first use. A database that already has homepad tables but no marker is refused with the one line of SQL that marks it. | Should |
| AC-008 | #651 | `widgets.Manager.Remove` drops the service's lock, so the map holds at most one lock per live service. | Could |
| AC-009 | #652 | Tests: a non-admin `PATCH /api/categories/{id}` with only `gridWidth` → 403 (the shared-catalog form of the old cross-user test); an admin PATCH with `name` and `gridWidth` together applies both. | Should |
| AC-010 | #672 | Every third-party action in `.gitea/workflows/` and `.github/workflows/` is pinned to a full commit SHA, with the version in a comment. The SHA is the one the floating tag points at today, so nothing changes at run time. Our own `ci-shared` actions are out of scope. | Should |
| AC-011 | #688 | The server-settings contract says numbers must be JSON numbers; `"1500"` is a 400. A test locks it. We do not accept numeric strings: the web app sends numbers, booleans are already strict, and a looser parser is more surface for no user. | Should |
| AC-012 | #664, #666, #670 | Stale comments fixed: `density_test.go` cites OQ-9 only; the `Category` comment describes the 3/4/6/12 span with default 6 (§10.4). #670 (`SetShowUptimeDisplay` carried `SetShowHealthBar`'s doc comment) goes away with AC-005: both setters are replaced by `SetUserPrefs`. | Could |

## 5. Out of scope

- Changing the registration default (#675). That is a product decision.
- Pinning our own `ci-shared` actions to SHAs.
- Changing any other handler's error format.

## 6. Test plan

`cd api && go vet ./... && go build ./... && go test ./... -count=1 -p 1` against a local throwaway Postgres. Each AC with code has a test that fails before its fix, except AC-010 (CI runs the pinned workflows), AC-011 (behaviour already correct; the test locks it) and AC-012 (comments).
