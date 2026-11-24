package api_test

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/netip"
	"net/url"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/finish06/homepad/api/internal/api"
	"github.com/finish06/homepad/api/internal/testsupport"
)

// SPEC-admin-server-settings §2.2 — every Live key applies on the saving
// process with no restart (AC-016…AC-019).

func authConfig(t *testing.T, env *testsupport.Env) authConfigView {
	t.Helper()
	resp, err := http.Get(env.URL + "/api/auth/config")
	require.NoError(t, err)
	defer resp.Body.Close()
	var c authConfigView
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&c))
	return c
}

// oidcSettings is the Sign-in group pointed at idp.
func oidcSettings(idp *mockIdP) map[string]any {
	return map[string]any{
		"OIDC_ENABLED": true, "OIDC_ISSUER": idp.issuer(), "OIDC_CLIENT_ID": testClientID,
		"OIDC_CLIENT_SECRET": testClientSecret, "OIDC_REDIRECT_URL": testRedirectURL,
	}
}

func loginCookie(t *testing.T, env *testsupport.Env) *http.Cookie {
	t.Helper()
	code, h, body := login(t, env, "", "alice@example.com", "correct horse battery staple")
	require.Equal(t, http.StatusOK, code, body)
	resp := http.Response{Header: h}
	for _, c := range resp.Cookies() {
		if c.Name == "homepad_session" {
			return c
		}
	}
	t.Fatal("no session cookie")
	return nil
}

func statusOf(t *testing.T, env *testsupport.Env) string {
	t.Helper()
	r := doJSON(t, http.MethodPost, env.URL+"/api/status/refresh", "admin-session", nil)
	r.Body.Close()
	resp := doJSON(t, http.MethodGet, env.URL+"/api/status", "admin-session", nil)
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return string(b)
}

// AC-016 — one subtest per Live key.
func TestServerSettingsLive_EveryKey(t *testing.T) {
	t.Run("COOKIE_SECURE", func(t *testing.T) {
		env := newSettingsEnv(t, map[string]string{"COOKIE_SECURE": "false"})
		assert.False(t, loginCookie(t, env).Secure)
		code, raw, _ := ssPatch(t, env, map[string]any{"COOKIE_SECURE": true}, "cookie_secure_on")
		require.Equal(t, http.StatusOK, code, raw)
		assert.True(t, loginCookie(t, env).Secure, "the next cookie set uses it")
	})

	t.Run("HOMEPAD_REGISTRATION", func(t *testing.T) {
		env := newSettingsEnv(t, map[string]string{"HOMEPAD_REGISTRATION": "open"})
		assert.Equal(t, "open", authConfig(t, env).Registration)
		code, raw, _ := ssPatch(t, env, map[string]any{"HOMEPAD_REGISTRATION": "invite_only"})
		require.Equal(t, http.StatusOK, code, raw)
		assert.Equal(t, "invite_only", authConfig(t, env).Registration, "/api/auth/config follows at once")
		resp := postJSON(t, env.URL+"/api/register", map[string]string{"email": "new@example.com", "password": "a long enough password"})
		resp.Body.Close()
		assert.Equal(t, http.StatusForbidden, resp.StatusCode, "sign-up is closed with no restart")
	})

	t.Run("HOMEPAD_MAX_ACCOUNTS", func(t *testing.T) {
		env := newSettingsEnv(t, nil)
		code, _, _ := createInvite(t, env, "admin-session", map[string]any{"name": "Guest", "role": "user"})
		require.Equal(t, http.StatusCreated, code)
		code, raw, _ := ssPatch(t, env, map[string]any{"HOMEPAD_MAX_ACCOUNTS": 4})
		require.Equal(t, http.StatusOK, code, raw)
		code, _, body := createInvite(t, env, "admin-session", map[string]any{"name": "Guest", "role": "user"})
		assert.Equal(t, http.StatusConflict, code, "%s", body)
		assert.Contains(t, string(body), "account limit reached (limit 4)")
	})

	t.Run("HOMEPAD_TRUSTED_PROXIES", func(t *testing.T) {
		env := testsupport.NewEnvWith(t, testsupport.Options{Limits: api.Limits{Login: api.RateLimit{PerMinute: 1, Burst: 1}}, Deps: envDeps(nil)})
		try := func(xff string) int {
			code, _, _ := login(t, env, xff, "nobody@example.com", "short")
			return code
		}
		require.Equal(t, http.StatusUnauthorized, try("192.0.2.1"))
		assert.Equal(t, http.StatusTooManyRequests, try("192.0.2.2"), "untrusted: one client, one bucket")
		code, raw, _ := ssPatch(t, env, map[string]any{"HOMEPAD_TRUSTED_PROXIES": "127.0.0.1"}, "trusted_proxies")
		require.Equal(t, http.StatusOK, code, raw)
		assert.Equal(t, http.StatusUnauthorized, try("192.0.2.3"), "trusted: the forwarded client has its own bucket")
		assert.Equal(t, http.StatusUnauthorized, try("192.0.2.4"))
	})

	t.Run("GATUS_BASE_URL", func(t *testing.T) {
		_, gatusURL := testsupport.NewServerWithGatus(t, map[string][]testsupport.GatusResult{"core_gitea": {{Success: true, DurationMs: 40}}})
		env := newSettingsEnv(t, map[string]string{"GATUS_BASE_URL": "http://127.0.0.1:1"})
		assert.NotContains(t, statusOf(t, env), `"UP"`)
		code, raw, b := ssPatch(t, env, map[string]any{"GATUS_BASE_URL": gatusURL})
		require.Equal(t, http.StatusOK, code, raw)
		assert.Empty(t, b.Warnings, "Gatus answered the save-time check")
		assert.Contains(t, statusOf(t, env), `"UP"`, "the next poll uses the new address")
		// AC-004 — an empty UI value turns status off over env.
		code, raw, _ = ssPatch(t, env, map[string]any{"GATUS_BASE_URL": ""})
		require.Equal(t, http.StatusOK, code, raw)
		assert.NotContains(t, statusOf(t, env), `"UP"`)
	})

	t.Run("GATUS_DEGRADED_MS", func(t *testing.T) {
		_, gatusURL := testsupport.NewServerWithGatus(t, map[string][]testsupport.GatusResult{"core_gitea": {{Success: true, DurationMs: 400}}})
		env := newSettingsEnv(t, map[string]string{"GATUS_BASE_URL": gatusURL})
		assert.NotContains(t, statusOf(t, env), `"DEGRADED"`)
		code, raw, _ := ssPatch(t, env, map[string]any{"GATUS_DEGRADED_MS": 100})
		require.Equal(t, http.StatusOK, code, raw)
		assert.Contains(t, statusOf(t, env), `"DEGRADED"`)
		assert.Equal(t, float64(100), getSysCfg(t, env.URL)["statusDegradedMs"])
		code, raw, _ = ssReset(t, env, "GATUS_DEGRADED_MS")
		require.Equal(t, http.StatusOK, code, raw)
		assert.NotContains(t, statusOf(t, env), `"DEGRADED"`, "reset brings the default back")
		assert.Equal(t, float64(1000), getSysCfg(t, env.URL)["statusDegradedMs"])
	})

	t.Run("OIDC_MEMBER_GROUP", func(t *testing.T) {
		// TC-007 — single sign-on on, invite_only, no member group: a new
		// identity has no account; after setting the group, it gets one.
		idp := newMockIdP(t, "pat@example.com", []string{"homepad"})
		env := newSettingsEnv(t, map[string]string{"HOMEPAD_REGISTRATION": "invite_only", "OIDC_ENABLED": "true",
			"OIDC_ISSUER": idp.issuer(), "OIDC_CLIENT_ID": testClientID, "OIDC_CLIENT_SECRET": testClientSecret, "OIDC_REDIRECT_URL": testRedirectURL})
		resp := oidcCallback(t, env.Server, idp)
		resp.Body.Close()
		assert.Equal(t, "/#signin-error=not_invited", resp.Header.Get("Location"))
		code, raw, _ := ssPatch(t, env, map[string]any{"OIDC_MEMBER_GROUP": "homepad"})
		require.Equal(t, http.StatusOK, code, raw)
		_, role := fetchMe(t, env.Server, runOIDCLogin(t, env.Server, idp))
		assert.Equal(t, "member", role)
	})

	t.Run("OIDC_ADMIN_GROUP", func(t *testing.T) {
		idp := newMockIdP(t, "boss@example.com", []string{"homepad-admins"})
		env := newSettingsEnv(t, map[string]string{"OIDC_ENABLED": "true",
			"OIDC_ISSUER": idp.issuer(), "OIDC_CLIENT_ID": testClientID, "OIDC_CLIENT_SECRET": testClientSecret, "OIDC_REDIRECT_URL": testRedirectURL})
		code, raw, _ := ssPatch(t, env, map[string]any{"OIDC_ADMIN_GROUP": "homepad-admins"})
		require.Equal(t, http.StatusOK, code, raw)
		_, role := fetchMe(t, env.Server, runOIDCLogin(t, env.Server, idp))
		assert.Equal(t, "admin", role)
	})

	t.Run("OIDC_CLIENT_ID_and_SECRET", func(t *testing.T) {
		idp := newMockIdP(t, "kim@example.com", nil)
		idp.clientID, idp.clientSecret = "homepad-new", "new-secret-value"
		env := newSettingsEnv(t, map[string]string{"OIDC_ENABLED": "true", "HOMEPAD_REGISTRATION": "open",
			"OIDC_ISSUER": idp.issuer(), "OIDC_CLIENT_ID": testClientID, "OIDC_CLIENT_SECRET": testClientSecret, "OIDC_REDIRECT_URL": testRedirectURL})
		client := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
		resp, err := client.Get(env.URL + "/api/auth/oidc/login")
		require.NoError(t, err)
		resp.Body.Close()
		au, _ := url.Parse(resp.Header.Get("Location"))
		assert.Equal(t, testClientID, au.Query().Get("client_id"))
		code, raw, _ := ssPatch(t, env, map[string]any{"OIDC_CLIENT_ID": "homepad-new", "OIDC_CLIENT_SECRET": "new-secret-value"})
		require.Equal(t, http.StatusOK, code, raw)
		email, _ := fetchMe(t, env.Server, runOIDCLogin(t, env.Server, idp))
		assert.Equal(t, "kim@example.com", email, "the new client ID and secret are used")
	})

	t.Run("OIDC_ISSUER_DISCOVERY_REDIRECT", func(t *testing.T) {
		old := newMockIdP(t, "lee@example.com", nil)
		idp := newMockIdP(t, "lee@example.com", nil)
		env := newSettingsEnv(t, map[string]string{"OIDC_ENABLED": "true", "HOMEPAD_REGISTRATION": "open",
			"OIDC_ISSUER": old.issuer(), "OIDC_CLIENT_ID": testClientID, "OIDC_CLIENT_SECRET": testClientSecret, "OIDC_REDIRECT_URL": testRedirectURL})
		redirect := "http://home.example.com/api/auth/oidc/callback"
		code, raw, _ := ssPatch(t, env, map[string]any{"OIDC_ISSUER": idp.issuer(),
			"OIDC_DISCOVERY_URL": idp.issuer() + "/.well-known/openid-configuration", "OIDC_REDIRECT_URL": redirect})
		require.Equal(t, http.StatusOK, code, raw)
		client := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
		resp, err := client.Get(env.URL + "/api/auth/oidc/login")
		require.NoError(t, err)
		resp.Body.Close()
		loc := resp.Header.Get("Location")
		assert.True(t, strings.HasPrefix(loc, idp.issuer()+"/authorize"), loc)
		au, _ := url.Parse(loc)
		assert.Equal(t, redirect, au.Query().Get("redirect_uri"))
		email, _ := fetchMe(t, env.Server, runOIDCLogin(t, env.Server, idp))
		assert.Equal(t, "lee@example.com", email)
	})
}

// AC-017 — the login and callback routes always exist, answer 404 while
// single sign-on is off, and work once it is turned on live;
// /api/auth/config follows at once.
func TestServerSettingsLive_OIDCRoutesFollowTheSwitch(t *testing.T) {
	idp := newMockIdP(t, "sam@example.com", nil)
	env := newSettingsEnv(t, map[string]string{"HOMEPAD_REGISTRATION": "open"})
	get := func(path string) int {
		resp, err := http.Get(env.URL + path)
		require.NoError(t, err)
		resp.Body.Close()
		return resp.StatusCode
	}
	assert.Equal(t, http.StatusNotFound, get("/api/auth/oidc/login"))
	assert.Equal(t, http.StatusNotFound, get("/api/auth/oidc/callback?state=x&code=y"))
	assert.False(t, authConfig(t, env).OIDCEnabled)

	code, raw, _ := ssPatch(t, env, oidcSettings(idp))
	require.Equal(t, http.StatusOK, code, raw)
	assert.True(t, authConfig(t, env).OIDCEnabled)
	email, role := fetchMe(t, env.Server, runOIDCLogin(t, env.Server, idp))
	assert.Equal(t, "sam@example.com", email)
	assert.Equal(t, "member", role)

	code, raw, _ = ssPatch(t, env, map[string]any{"OIDC_ENABLED": false})
	require.Equal(t, http.StatusOK, code, raw, "an admin has a password, so turning it off is allowed")
	assert.Equal(t, http.StatusNotFound, get("/api/auth/oidc/login"))
	assert.False(t, authConfig(t, env).OIDCEnabled)
}

// AC-018 — a change builds a new provider (discovery fetched again), and a
// login begun before it fails on callback with sso_failed, not a 500.
func TestServerSettingsLive_OIDCChangeRebuildsProvider(t *testing.T) {
	idp := newMockIdP(t, "ana@example.com", nil)
	env := newSettingsEnv(t, map[string]string{"HOMEPAD_REGISTRATION": "open", "OIDC_ENABLED": "true",
		"OIDC_ISSUER": idp.issuer(), "OIDC_CLIENT_ID": testClientID, "OIDC_CLIENT_SECRET": testClientSecret, "OIDC_REDIRECT_URL": testRedirectURL})
	client := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}

	// Begin a login, and leave it at the provider.
	resp, err := client.Get(env.URL + "/api/auth/oidc/login")
	require.NoError(t, err)
	resp.Body.Close()
	authResp, err := client.Get(resp.Header.Get("Location"))
	require.NoError(t, err)
	authResp.Body.Close()
	cb, _ := url.Parse(authResp.Header.Get("Location"))
	before := idp.discoveries.Load()

	code, raw, _ := ssPatch(t, env, map[string]any{"OIDC_MEMBER_GROUP": "family"})
	require.Equal(t, http.StatusOK, code, raw)

	cbResp, err := client.Get(env.URL + "/api/auth/oidc/callback?" + cb.RawQuery)
	require.NoError(t, err)
	cbResp.Body.Close()
	assert.Equal(t, http.StatusFound, cbResp.StatusCode)
	assert.Equal(t, "/#signin-error=sso_failed", cbResp.Header.Get("Location"))

	runOIDCLogin(t, env.Server, idp)
	assert.Greater(t, idp.discoveries.Load(), before, "the new provider fetched discovery again")
}

// fakeResolver answers trusted-proxy hostnames from a table and counts the
// lookups per name.
type fakeResolver struct {
	mu    sync.Mutex
	addrs map[string]netip.Addr
	calls map[string]int
}

func (f *fakeResolver) lookup(_ context.Context, host string) ([]netip.Addr, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls[host]++
	if a, ok := f.addrs[host]; ok {
		return []netip.Addr{a}, nil
	}
	return nil, fmt.Errorf("no such host %s", host)
}

func (f *fakeResolver) count(host string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.calls[host]
}

// patchFrom is ssPatch sent with an X-Forwarded-For header.
func patchFrom(t *testing.T, env *testsupport.Env, xff string, set map[string]any, confirm ...string) (int, string) {
	t.Helper()
	b, _ := json.Marshal(map[string]any{"set": set, "confirm": confirm})
	req, _ := http.NewRequest(http.MethodPatch, env.URL+settingsURL, strings.NewReader(string(b)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Forwarded-For", xff)
	req.AddCookie(&http.Cookie{Name: "homepad_session", Value: "admin-session"})
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, string(raw)
}

// AC-019 — saving trusted proxies resolves hostnames before the swap, stops
// the old refresh loop and starts a new one; 20 saves leak no goroutines.
func TestServerSettingsLive_TrustedProxyLoopSwap(t *testing.T) {
	res := &fakeResolver{calls: map[string]int{}, addrs: map[string]netip.Addr{
		"proxy-a.example.com": netip.MustParseAddr("127.0.0.1"),
		"proxy-b.example.com": netip.MustParseAddr("127.0.0.1"),
	}}
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	env := testsupport.NewEnvWith(t, testsupport.Options{Deps: func(d *api.Deps) {
		envDeps(nil)(d)
		d.Context = ctx
		d.ResolveHost = res.lookup
		d.ProxyRefreshEvery = 5 * time.Millisecond
		d.ProxyRetryEvery = 5 * time.Millisecond
	}})

	// Resolved before the swap: the confirm already sees the forwarded client.
	code, raw := patchFrom(t, env, "192.0.2.50", map[string]any{"HOMEPAD_TRUSTED_PROXIES": "proxy-a.example.com"})
	require.Equal(t, http.StatusConflict, code, raw)
	assert.Contains(t, raw, `"currentAddress":"127.0.0.1"`)
	assert.Contains(t, raw, `"newAddress":"192.0.2.50"`)
	code, raw = patchFrom(t, env, "192.0.2.50", map[string]any{"HOMEPAD_TRUSTED_PROXIES": "proxy-a.example.com"}, "trusted_proxies")
	require.Equal(t, http.StatusOK, code, raw)

	require.Eventually(t, func() bool { return res.count("proxy-a.example.com") > 3 }, 2*time.Second, 5*time.Millisecond, "a's loop runs")
	code, raw = patchFrom(t, env, "", map[string]any{"HOMEPAD_TRUSTED_PROXIES": "proxy-b.example.com"}, "trusted_proxies")
	require.Equal(t, http.StatusOK, code, raw)
	require.Eventually(t, func() bool { return res.count("proxy-b.example.com") > 3 }, 2*time.Second, 5*time.Millisecond, "b's loop runs")
	a := res.count("proxy-a.example.com")
	time.Sleep(50 * time.Millisecond)
	assert.Equal(t, a, res.count("proxy-a.example.com"), "a's loop stopped")

	// 20 more saves: the goroutine count doesn't grow.
	settle := func() int {
		var n int
		for i := 0; i < 20; i++ {
			runtime.GC()
			n = runtime.NumGoroutine()
			time.Sleep(10 * time.Millisecond)
		}
		return n
	}
	base := settle()
	for i := 0; i < 20; i++ {
		host := []string{"proxy-a.example.com", "proxy-b.example.com"}[i%2]
		code, raw := patchFrom(t, env, "", map[string]any{"HOMEPAD_TRUSTED_PROXIES": host + ",192.0.2." + fmt.Sprint(i+1)}, "trusted_proxies")
		require.Equal(t, http.StatusOK, code, raw)
	}
	after := settle()
	assert.LessOrEqual(t, after, base+2, "20 saves leak no goroutines (before %d, after %d)", base, after)

	// A name that doesn't resolve is a note, not an error.
	code, raw = patchFrom(t, env, "", map[string]any{"HOMEPAD_TRUSTED_PROXIES": "proxy-c.example.com"}, "trusted_proxies")
	require.Equal(t, http.StatusOK, code, raw)
	assert.Contains(t, raw, `"code":"proxy_unresolved"`)
}
