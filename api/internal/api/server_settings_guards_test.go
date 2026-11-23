package api_test

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/finish06/homepad/api/internal/session"
	"github.com/finish06/homepad/api/internal/testsupport"
)

// SPEC-admin-server-settings §2.5 — the guards (AC-020…AC-027).

type confirmBody struct {
	Error    string `json:"error"`
	Warnings []struct {
		Code           string `json:"code"`
		Message        string `json:"message"`
		CurrentAddress string `json:"currentAddress"`
		NewAddress     string `json:"newAddress"`
		Accounts       *int   `json:"accounts"`
		PendingInvites *int   `json:"pendingInvites"`
		Limit          *int   `json:"limit"`
	} `json:"warnings"`
}

// AC-025 — each risky change answers 409 confirm_required with its warning
// until it is resent with the code.
func TestServerSettingsGuards_ConfirmCodes(t *testing.T) {
	env := newSettingsEnv(t, map[string]string{"COOKIE_SECURE": "true", "HOMEPAD_REGISTRATION": "invite_only"})
	cases := []struct {
		set  map[string]any
		code string
		text string
	}{
		{map[string]any{"COOKIE_SECURE": false}, "cookie_secure_off", "Only do this on plain http://"},
		{map[string]any{"COOKIE_SECURE": true}, "cookie_secure_on", "On plain http://, nobody can sign in after this."},
		{map[string]any{"HOMEPAD_REGISTRATION": "open"}, "registration_open", "Anyone who can open Homepad can make an account"},
		{map[string]any{"HOMEPAD_TRUSTED_PROXIES": "192.0.2.1"}, "trusted_proxies", "Homepad sees you as"},
		{map[string]any{"HOMEPAD_MAX_ACCOUNTS": 1}, "max_accounts_below_count", "Nobody is removed."},
	}
	for _, c := range cases {
		code, raw, _ := ssPatch(t, env, c.set)
		require.Equal(t, http.StatusConflict, code, "%v: %s", c.set, raw)
		var b confirmBody
		require.NoError(t, json.Unmarshal([]byte(raw), &b))
		assert.Equal(t, "confirm_required", b.Error)
		require.Len(t, b.Warnings, 1, raw)
		assert.Equal(t, c.code, b.Warnings[0].Code)
		assert.Contains(t, b.Warnings[0].Message, c.text)

		code, raw, _ = ssPatch(t, env, c.set, "some_other_code")
		assert.Equal(t, http.StatusConflict, code, "a wrong code doesn't confirm")
		code, raw, _ = ssPatch(t, env, c.set, c.code)
		require.Equal(t, http.StatusOK, code, "%v: %s", c.set, raw)
	}
	// Sign-up to invite_only needs no confirm.
	code, raw, _ := ssPatch(t, env, map[string]any{"HOMEPAD_REGISTRATION": "invite_only"})
	assert.Equal(t, http.StatusOK, code, raw)
	// Reset runs the same guards for the value it leaves in place: resetting
	// COOKIE_SECURE (UI true) to env true needs none; resetting the proxy
	// list to "none" does.
	code, raw, _ = ssReset(t, env, "HOMEPAD_TRUSTED_PROXIES")
	assert.Equal(t, http.StatusConflict, code, raw)
	assert.Equal(t, "confirm_required", errCode(raw))
	code, raw, _ = ssReset(t, env, "HOMEPAD_TRUSTED_PROXIES", "trusted_proxies")
	assert.Equal(t, http.StatusOK, code, raw)
	code, raw, _ = ssReset(t, env, "COOKIE_SECURE")
	assert.Equal(t, http.StatusOK, code, raw)
}

// AC-026 — the trusted_proxies warning gives the caller's address now and
// under the new list.
func TestServerSettingsGuards_TrustedProxyWarningAddresses(t *testing.T) {
	env := newSettingsEnv(t, nil)
	code, raw := patchFrom(t, env, "192.0.2.50", map[string]any{"HOMEPAD_TRUSTED_PROXIES": "127.0.0.1"})
	require.Equal(t, http.StatusConflict, code, raw)
	var b confirmBody
	require.NoError(t, json.Unmarshal([]byte(raw), &b))
	assert.Equal(t, "127.0.0.1", b.Warnings[0].CurrentAddress)
	assert.Equal(t, "192.0.2.50", b.Warnings[0].NewAddress)
	assert.Contains(t, b.Warnings[0].Message, "Homepad sees you as 127.0.0.1 now. With this list it would see 192.0.2.50.")
}

// AC-027, TC-003 — a limit below accounts plus pending invites removes
// nobody; new accounts and invites get the existing 409.
func TestServerSettingsGuards_AccountLimitBelowCount(t *testing.T) {
	env := newSettingsEnv(t, nil)
	code, _, _ := createInvite(t, env, "admin-session", map[string]any{"name": "Guest", "role": "user"})
	require.Equal(t, http.StatusCreated, code)
	code, raw, _ := ssPatch(t, env, map[string]any{"HOMEPAD_MAX_ACCOUNTS": 2})
	require.Equal(t, http.StatusConflict, code, raw)
	var b confirmBody
	require.NoError(t, json.Unmarshal([]byte(raw), &b))
	w := b.Warnings[0]
	assert.Equal(t, 3, *w.Accounts)
	assert.Equal(t, 1, *w.PendingInvites)
	assert.Equal(t, 2, *w.Limit)
	assert.Equal(t, "There are 3 accounts and 1 pending invites. Nobody is removed. New accounts and invites are refused until there are fewer than 2.", w.Message)

	code, raw, _ = ssPatch(t, env, map[string]any{"HOMEPAD_MAX_ACCOUNTS": 2}, "max_accounts_below_count")
	require.Equal(t, http.StatusOK, code, raw)
	n, err := env.Store.CountUsers(context.Background())
	require.NoError(t, err)
	assert.Equal(t, 3, n, "nobody is removed")
	code, _, body := createInvite(t, env, "admin-session", map[string]any{"name": "Other", "role": "user"})
	assert.Equal(t, http.StatusConflict, code)
	assert.Contains(t, string(body), "account limit reached (limit 2)")
	resp := doJSON(t, http.MethodPost, env.URL+"/api/admin/kids", "admin-session", map[string]any{"name": "Kiddo", "avatarColor": "blue"})
	resp.Body.Close()
	assert.Equal(t, http.StatusConflict, resp.StatusCode)
}

// AC-020 — under invite_only set in the UI: invites are still accepted, and
// the first account on an empty install still registers as admin.
func TestServerSettingsGuards_InviteOnlyFromUI(t *testing.T) {
	env := newSettingsEnv(t, map[string]string{"HOMEPAD_REGISTRATION": "open"})
	code, raw, _ := ssPatch(t, env, map[string]any{"HOMEPAD_REGISTRATION": "invite_only"})
	require.Equal(t, http.StatusOK, code, raw)
	code, inv, b := createInvite(t, env, "admin-session", map[string]any{"name": "Guest", "role": "user"})
	require.Equal(t, http.StatusCreated, code, "%s", b)
	resp, body := acceptInvite(t, env, acceptBody(inv.Token, "guest@example.com"))
	assert.Less(t, resp.StatusCode, 300, "an invite still works: %s", body)

	empty := testsupport.NewEnvWith(t, testsupport.Options{Empty: true, Deps: envDeps(map[string]string{"HOMEPAD_REGISTRATION": "open"})})
	_, err := empty.Store.Pool().Exec(context.Background(), `INSERT INTO server_settings (key, value) VALUES ('HOMEPAD_REGISTRATION', 'invite_only')`)
	require.NoError(t, err)
	twin := empty.Twin(t, envDeps(map[string]string{"HOMEPAD_REGISTRATION": "open"}))
	assert.Equal(t, "invite_only", authConfig(t, twin).Registration)
	resp = postJSON(t, twin.URL+"/api/register", map[string]string{"email": "first@example.com", "password": "a long enough password"})
	resp.Body.Close()
	require.Equal(t, http.StatusCreated, resp.StatusCode)
	u, err := twin.Store.UserByEmail(context.Background(), "first@example.com")
	require.NoError(t, err)
	assert.Equal(t, "admin", u.Role)
}

// AC-021, TC-009 — an OIDC change that leaves single sign-on on checks
// discovery first; a failure is 422 discovery_failed and saves nothing.
func TestServerSettingsGuards_DiscoveryBeforeSave(t *testing.T) {
	idp := newMockIdP(t, "admin@homepad.test", nil)
	env := newSettingsEnv(t, nil)
	set := oidcSettings(idp)
	set["OIDC_ISSUER"] = idp.issuer() + "/wrong"
	code, raw, _ := ssPatch(t, env, set)
	require.Equal(t, http.StatusUnprocessableEntity, code, raw)
	assert.Equal(t, "discovery_failed", errCode(raw))
	assert.Contains(t, raw, "Couldn't read the sign-in settings at "+idp.issuer()+"/wrong/.well-known/openid-configuration")
	rows, _ := env.Store.ServerSettings(context.Background())
	assert.Empty(t, rows)

	idp.issuerClaim = "https://other.example.com"
	code, raw, _ = ssPatch(t, env, oidcSettings(idp))
	assert.Equal(t, http.StatusUnprocessableEntity, code, raw)
	assert.Contains(t, raw, "issuer")
	idp.issuerClaim = ""

	// Turning it on needs every required value.
	code, raw, _ = ssPatch(t, env, map[string]any{"OIDC_ENABLED": true, "OIDC_ISSUER": idp.issuer()})
	require.Equal(t, http.StatusBadRequest, code, raw)
	var e struct {
		Error   string   `json:"error"`
		Missing []string `json:"missing"`
	}
	require.NoError(t, json.Unmarshal([]byte(raw), &e))
	assert.Equal(t, []string{"OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET", "OIDC_REDIRECT_URL"}, e.Missing)

	code, raw, _ = ssPatch(t, env, oidcSettings(idp))
	require.Equal(t, http.StatusOK, code, raw)
}

// ssoOnlyAdmin makes an install whose only admin has no local password,
// with single sign-on on against idp. It returns the env and the admin's
// session token.
func ssoOnlyAdmin(t *testing.T, idp *mockIdP) (*testsupport.Env, string) {
	t.Helper()
	env := testsupport.NewEnvWith(t, testsupport.Options{Empty: true, Deps: envDeps(map[string]string{
		"OIDC_ENABLED": "true", "OIDC_ISSUER": idp.issuer(), "OIDC_CLIENT_ID": testClientID,
		"OIDC_CLIENT_SECRET": testClientSecret, "OIDC_REDIRECT_URL": testRedirectURL, "OIDC_ADMIN_GROUP": "homepad-admins"})})
	ctx := context.Background()
	u, err := env.Store.CreateUser(ctx, "sso-admin@example.com", "oidc:no-local-password", "admin")
	require.NoError(t, err)
	require.NoError(t, env.Sessions.Bind(ctx, "sso-admin-session", u.ID, session.AdultLifetime))
	return env, "sso-admin-session"
}

func ssoPatch(t *testing.T, env *testsupport.Env, tok string, body map[string]any) (int, string) {
	t.Helper()
	code, raw, _ := ssCall(t, http.MethodPatch, env.URL+settingsURL, tok, body)
	return code, raw
}

// AC-022 — with no admin password and no valid test token, turning single
// sign-on off or changing any OIDC value is 409 would_lock_out.
func TestServerSettingsGuards_WouldLockOut(t *testing.T) {
	idp := newMockIdP(t, "sso-admin@example.com", nil)
	env, tok := ssoOnlyAdmin(t, idp)
	for _, set := range []map[string]any{
		{"OIDC_ENABLED": false},
		{"OIDC_CLIENT_ID": "homepad-2"},
		{"OIDC_MEMBER_GROUP": "family"},
	} {
		code, raw := ssoPatch(t, env, tok, map[string]any{"set": set})
		assert.Equal(t, http.StatusConflict, code, "%v: %s", set, raw)
		assert.Equal(t, "would_lock_out", errCode(raw))
	}
	code, raw := ssoPatch(t, env, tok, map[string]any{"set": map[string]any{"OIDC_MEMBER_GROUP": "family"}, "oidcTest": "made-up"})
	assert.Equal(t, http.StatusConflict, code, raw)
	rows, _ := env.Store.ServerSettings(context.Background())
	assert.Empty(t, rows)
	// A non-OIDC change is not guarded.
	code, raw = ssoPatch(t, env, tok, map[string]any{"set": map[string]any{"GATUS_DEGRADED_MS": 500}})
	assert.Equal(t, http.StatusOK, code, raw)
	// A reset is guarded the same way.
	_, err := env.Store.Pool().Exec(context.Background(), `INSERT INTO server_settings (key, value) VALUES ('OIDC_MEMBER_GROUP', 'family')`)
	require.NoError(t, err)
	_, _, _ = ssCall(t, http.MethodGet, env.URL+settingsURL, tok, nil)
	code, raw, _ = ssCall(t, http.MethodDelete, env.URL+settingsURL+"/OIDC_MEMBER_GROUP", tok, nil)
	assert.Equal(t, http.StatusConflict, code, raw)
	assert.Equal(t, "would_lock_out", errCode(raw))
}

// runOIDCTest starts a test sign-in for set as tok, drives the provider and
// the callback, and returns the callback's Location, the Set-Cookie headers
// and the status route's answer.
func runOIDCTest(t *testing.T, env *testsupport.Env, tok string, set map[string]any) (string, []*http.Cookie, map[string]string) {
	t.Helper()
	code, raw, _ := ssCall(t, http.MethodPost, env.URL+settingsURL+"/oidc/test", tok, map[string]any{"set": set})
	require.Equal(t, http.StatusOK, code, raw)
	var start struct {
		ID           string `json:"id"`
		AuthorizeURL string `json:"authorizeUrl"`
	}
	require.NoError(t, json.Unmarshal([]byte(raw), &start))
	require.NotEmpty(t, start.ID)

	_, raw, _ = ssCall(t, http.MethodGet, env.URL+settingsURL+"/oidc/test/"+start.ID, tok, nil)
	assert.Contains(t, raw, `"state":"pending"`)

	client := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	authResp, err := client.Get(start.AuthorizeURL)
	require.NoError(t, err)
	authResp.Body.Close()
	require.Equal(t, http.StatusFound, authResp.StatusCode)
	cb, _ := url.Parse(authResp.Header.Get("Location"))
	cbResp, err := client.Get(env.URL + "/api/auth/oidc/callback?" + cb.RawQuery)
	require.NoError(t, err)
	cbResp.Body.Close()

	code, raw, _ = ssCall(t, http.MethodGet, env.URL+settingsURL+"/oidc/test/"+start.ID, tok, nil)
	require.Equal(t, http.StatusOK, code, raw)
	var st map[string]string
	require.NoError(t, json.Unmarshal([]byte(raw), &st))
	return cbResp.Header.Get("Location"), cbResp.Cookies(), st
}

// AC-023, TC-008 — the test sign-in: an authorize URL for the staged
// values; the callback starts no session; a pass gives a token bound to the
// admin and those values; a token for other values is refused.
func TestServerSettingsGuards_TestSignIn(t *testing.T) {
	idp := newMockIdP(t, "sso-admin@example.com", nil)
	idp.clientID = "homepad-2"
	env, tok := ssoOnlyAdmin(t, idp)
	staged := map[string]any{"OIDC_CLIENT_ID": "homepad-2"}

	loc, cookies, st := runOIDCTest(t, env, tok, staged)
	assert.Equal(t, "/#oidc-test=passed", loc)
	for _, c := range cookies {
		assert.NotEqual(t, "homepad_session", c.Name, "a test sign-in starts no session")
	}
	n := countRows(t, env, `SELECT count(*) FROM sessions`)
	assert.Equal(t, 1, n, "only the admin's own session exists")
	require.Equal(t, "passed", st["state"], st["message"])
	token := st["token"]
	require.NotEmpty(t, token)

	// A token for other values is refused.
	code, raw := ssoPatch(t, env, tok, map[string]any{"set": map[string]any{"OIDC_CLIENT_ID": "homepad-3"}, "oidcTest": token})
	assert.Equal(t, http.StatusConflict, code, raw)
	assert.Equal(t, "would_lock_out", errCode(raw))
	// Another admin can't use it.
	ctx := context.Background()
	other, err := env.Store.CreateUser(ctx, "other-admin@example.com", "oidc:no-local-password", "admin")
	require.NoError(t, err)
	require.NoError(t, env.Sessions.Bind(ctx, "other-admin-session", other.ID, session.AdultLifetime))
	code, raw = ssoPatch(t, env, "other-admin-session", map[string]any{"set": staged, "oidcTest": token})
	assert.Equal(t, http.StatusConflict, code, raw)

	// The right token saves; the admin is still signed in (AC-024).
	code, raw = ssoPatch(t, env, tok, map[string]any{"set": staged, "oidcTest": token})
	require.Equal(t, http.StatusOK, code, raw)
	resp := doJSON(t, http.MethodGet, env.URL+"/api/me", tok, nil)
	resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	// A fresh sign-in works with the new client ID.
	email, _ := fetchMe(t, env.Server, runOIDCLogin(t, env.Server, idp))
	assert.Equal(t, "sso-admin@example.com", email)

	// The status route is the starting admin's only.
	code, _, _ = ssCall(t, http.MethodGet, env.URL+settingsURL+"/oidc/test/nope", tok, nil)
	assert.Equal(t, http.StatusNotFound, code)
}

// AC-023 — a test sign-in as someone else, outside the admin group, fails.
func TestServerSettingsGuards_TestSignInFails(t *testing.T) {
	idp := newMockIdP(t, "stranger@example.com", []string{"everyone"})
	env, tok := ssoOnlyAdmin(t, idp)
	loc, _, st := runOIDCTest(t, env, tok, map[string]any{"OIDC_MEMBER_GROUP": "family"})
	assert.Equal(t, "/#oidc-test=failed", loc)
	assert.Equal(t, "failed", st["state"])
	assert.NotEmpty(t, st["message"])
	assert.Empty(t, st["token"])

	// In the staged admin group passes, whoever it is.
	idp.groups = []string{"homepad-admins"}
	_, _, st = runOIDCTest(t, env, tok, map[string]any{"OIDC_MEMBER_GROUP": "family"})
	assert.Equal(t, "passed", st["state"])

	// Staging a non-sign-in key is refused; a bad discovery is 422.
	code, raw, _ := ssCall(t, http.MethodPost, env.URL+settingsURL+"/oidc/test", tok, map[string]any{"set": map[string]any{"COOKIE_SECURE": false}})
	assert.Equal(t, http.StatusBadRequest, code, raw)
	code, raw, _ = ssCall(t, http.MethodPost, env.URL+settingsURL+"/oidc/test", tok, map[string]any{"set": map[string]any{"OIDC_ISSUER": idp.issuer() + "/wrong"}})
	assert.Equal(t, http.StatusUnprocessableEntity, code, raw)
	assert.Equal(t, "discovery_failed", errCode(raw))
}

// AC-024 — no OIDC change ends any session.
func TestServerSettingsGuards_OIDCChangesKeepSessions(t *testing.T) {
	idp := newMockIdP(t, "admin@homepad.test", nil)
	env := newSettingsEnv(t, nil)
	before := countRows(t, env, `SELECT count(*) FROM sessions`)
	for _, set := range []map[string]any{oidcSettings(idp), {"OIDC_MEMBER_GROUP": "family"}, {"OIDC_ENABLED": false}} {
		code, raw, _ := ssPatch(t, env, set)
		require.Equal(t, http.StatusOK, code, raw)
	}
	assert.Equal(t, before, countRows(t, env, `SELECT count(*) FROM sessions`))
	for _, tok := range []string{"admin-session", "non-admin-session"} {
		resp := doJSON(t, http.MethodGet, env.URL+"/api/me", tok, nil)
		resp.Body.Close()
		assert.Equal(t, http.StatusOK, resp.StatusCode, tok)
	}
}

// §1a — save-time checks of an admin-typed address go through the guarded
// client: a link-local (cloud metadata) address is refused without a dial.
func TestServerSettingsGuards_GuardedClientForAdminTypedURLs(t *testing.T) {
	env := newSettingsEnv(t, nil)
	set := map[string]any{"OIDC_ENABLED": true, "OIDC_ISSUER": "http://169.254.169.254", "OIDC_CLIENT_ID": testClientID,
		"OIDC_CLIENT_SECRET": testClientSecret, "OIDC_REDIRECT_URL": testRedirectURL}
	code, raw, _ := ssPatch(t, env, set)
	assert.Equal(t, http.StatusUnprocessableEntity, code, raw)
	assert.Equal(t, "discovery_failed", errCode(raw))

	code, raw, b := ssPatch(t, env, map[string]any{"GATUS_BASE_URL": "http://169.254.169.254"})
	require.Equal(t, http.StatusOK, code, raw)
	require.Len(t, b.Warnings, 1)
	assert.Equal(t, "gatus_unreachable", b.Warnings[0]["code"])
}

// AC-026 over a real IPv6 connection: the warning names ::1 and the
// forwarded client, never a /64 bucket.
func TestServerSettingsGuards_TrustedProxyWarningIPv6(t *testing.T) {
	ln, err := net.Listen("tcp", "[::1]:0")
	if err != nil {
		t.Skipf("no IPv6 loopback: %v", err)
	}
	env := newSettingsEnv(t, nil)
	srv := httptest.NewUnstartedServer(env.Config.Handler)
	srv.Listener.Close()
	srv.Listener = ln
	srv.Start()
	t.Cleanup(srv.Close)
	v6 := *env
	v6.Server = srv

	for _, c := range []struct{ list, xff, now, after string }{
		{"192.0.2.1", "2001:db8::77", "::1", "::1"},    // no matching proxy
		{"::1", "2001:db8::77", "::1", "2001:db8::77"}, // ::1 is the proxy
	} {
		code, raw := patchFrom(t, &v6, c.xff, map[string]any{"HOMEPAD_TRUSTED_PROXIES": c.list})
		require.Equal(t, http.StatusConflict, code, raw)
		var b confirmBody
		require.NoError(t, json.Unmarshal([]byte(raw), &b))
		assert.Equal(t, c.now, b.Warnings[0].CurrentAddress, c.list)
		assert.Equal(t, c.after, b.Warnings[0].NewAddress, c.list)
		assert.NotContains(t, b.Warnings[0].Message, "/64")
	}
}
