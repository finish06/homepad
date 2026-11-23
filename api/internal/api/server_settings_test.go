package api_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"regexp"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/finish06/homepad/api/internal/api"
	"github.com/finish06/homepad/api/internal/gatus"
	"github.com/finish06/homepad/api/internal/oidc"
	"github.com/finish06/homepad/api/internal/testsupport"
)

// SPEC-admin-server-settings — storage, precedence and the API shape
// (AC-002…AC-012, AC-028).

const settingsURL = "/api/admin/server-settings"

// allConfirms is every confirm code, for tests that aren't about confirms.
var allConfirms = []string{"trusted_proxies", "cookie_secure_on", "cookie_secure_off", "max_accounts_below_count", "registration_open"}

type ssBody struct {
	EnvOnly  bool             `json:"envOnly"`
	Settings []map[string]any `json:"settings"`
	Warnings []map[string]any `json:"warnings"`
}

func (b ssBody) get(t *testing.T, key string) map[string]any {
	t.Helper()
	for _, s := range b.Settings {
		if s["key"] == key {
			return s
		}
	}
	t.Fatalf("no setting %s in the body", key)
	return nil
}

// ssCall sends a request to the settings routes and returns the status, the
// raw body and the body decoded as the GET shape.
func ssCall(t *testing.T, method, url, token string, body any) (int, string, ssBody) {
	t.Helper()
	resp := doJSON(t, method, url, token, body)
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	var b ssBody
	_ = json.Unmarshal(raw, &b)
	return resp.StatusCode, string(raw), b
}

func ssGet(t *testing.T, env *testsupport.Env) ssBody {
	t.Helper()
	code, raw, b := ssCall(t, http.MethodGet, env.URL+settingsURL, "admin-session", nil)
	require.Equal(t, http.StatusOK, code, raw)
	return b
}

func ssPatch(t *testing.T, env *testsupport.Env, set map[string]any, confirm ...string) (int, string, ssBody) {
	t.Helper()
	body := map[string]any{"set": set}
	if len(confirm) > 0 {
		body["confirm"] = confirm
	}
	return ssCall(t, http.MethodPatch, env.URL+settingsURL, "admin-session", body)
}

func ssReset(t *testing.T, env *testsupport.Env, key string, confirm ...string) (int, string, ssBody) {
	t.Helper()
	u := env.URL + settingsURL + "/" + key
	if len(confirm) > 0 {
		u += "?confirm=" + strings.Join(confirm, ",")
	}
	return ssCall(t, http.MethodDelete, u, "admin-session", nil)
}

func errCode(raw string) string {
	var e struct {
		Error string `json:"error"`
	}
	_ = json.Unmarshal([]byte(raw), &e)
	return e.Error
}

// envDeps sets a test server's env layer from env the way main parses it,
// so a test can say "this env var is set to that".
func envDeps(env map[string]string) func(*api.Deps) {
	return func(d *api.Deps) {
		getenv := func(k string) string { return env[k] }
		d.Getenv = getenv
		d.Registration, _ = api.RegistrationFromEnv(env["HOMEPAD_REGISTRATION"])
		d.MaxAccounts, _ = api.ParseMaxAccounts(env["HOMEPAD_MAX_ACCOUNTS"])
		tp, err := api.ParseTrustedProxies(env["HOMEPAD_TRUSTED_PROXIES"])
		if err != nil {
			panic(err)
		}
		d.TrustedProxies = tp
		c := gatus.NewClient(env["GATUS_BASE_URL"])
		if v := env["GATUS_DEGRADED_MS"]; v != "" {
			ms, _ := time.ParseDuration(v + "ms")
			c.SetDegradedAfter(ms)
		}
		d.Poller = gatus.NewPoller(c, time.Hour)
		d.OIDC = oidc.Config{
			Enabled:      env["OIDC_ENABLED"] == "true",
			Issuer:       strings.TrimRight(env["OIDC_ISSUER"], "/"),
			DiscoveryURL: env["OIDC_DISCOVERY_URL"],
			RedirectURL:  env["OIDC_REDIRECT_URL"],
			ClientID:     env["OIDC_CLIENT_ID"],
			ClientSecret: env["OIDC_CLIENT_SECRET"],
			AdminGroup:   env["OIDC_ADMIN_GROUP"],
			MemberGroup:  env["OIDC_MEMBER_GROUP"],
		}
	}
}

func newSettingsEnv(t *testing.T, env map[string]string) *testsupport.Env {
	t.Helper()
	return testsupport.NewEnvWith(t, testsupport.Options{Deps: envDeps(env)})
}

// AC-002 — one allowlist: the migration's CHECK, the Go list of stored keys
// and the GET response's keys agree, and GET lists PORT and
// GATUS_DEGRADED_MS too, which aren't stored in server_settings.
func TestServerSettings_AllowlistMatchesMigrationAndGET(t *testing.T) {
	b, err := os.ReadFile("../../migrations/0024_server_settings.up.sql")
	require.NoError(t, err)
	m := regexp.MustCompile(`(?s)key IN \((.*?)\)\)`).FindStringSubmatch(string(b))
	require.Len(t, m, 2)
	var check []string
	for _, q := range regexp.MustCompile(`'([A-Z_]+)'`).FindAllStringSubmatch(m[1], -1) {
		check = append(check, q[1])
	}
	sort.Strings(check)
	assert.Equal(t, check, api.StoredServerSettingKeys())

	env := newSettingsEnv(t, nil)
	var got []string
	for _, s := range ssGet(t, env).Settings {
		got = append(got, s["key"].(string))
	}
	want := append(api.StoredServerSettingKeys(), "PORT", "GATUS_DEGRADED_MS")
	sort.Strings(got)
	sort.Strings(want)
	assert.Equal(t, want, got)
	assert.Equal(t, api.ServerSettingKeys(), func() []string {
		var k []string
		for _, s := range ssGet(t, env).Settings {
			k = append(k, s["key"].(string))
		}
		return k
	}(), "GET lists the keys in display order")
	assert.Len(t, got, 15, "the 14 env-config rows plus the client secret")

	code, raw, _ := ssPatch(t, env, map[string]any{"NOPE": "x"})
	assert.Equal(t, http.StatusNotFound, code, raw)
	assert.Equal(t, "unknown_key", errCode(raw))
	code, raw, _ = ssReset(t, env, "NOPE")
	assert.Equal(t, http.StatusNotFound, code, raw)
}

// precedenceCase is one key: its env value, a UI value, and what each reads
// back as.
type precedenceCase struct {
	key              string
	envRaw           string
	envWire, uiWire  any
	defaultWire      any
	uiWireNormalized any // when the saved value reads back normalized
}

func precedenceCases(idp *mockIdP) []precedenceCase {
	return []precedenceCase{
		{key: "COOKIE_SECURE", envRaw: "false", envWire: false, uiWire: true, defaultWire: true},
		{key: "HOMEPAD_TRUSTED_PROXIES", envRaw: "192.0.2.1", envWire: "192.0.2.1", uiWire: " 192.0.2.0/24 , 198.51.100.7 ", defaultWire: "", uiWireNormalized: "192.0.2.0/24,198.51.100.7"},
		{key: "GATUS_BASE_URL", envRaw: "http://127.0.0.1:2", envWire: "http://127.0.0.1:2", uiWire: "http://127.0.0.1:1/", defaultWire: "", uiWireNormalized: "http://127.0.0.1:1"},
		{key: "GATUS_DEGRADED_MS", envRaw: "2500", envWire: float64(2500), uiWire: float64(300), defaultWire: float64(1000)},
		{key: "HOMEPAD_REGISTRATION", envRaw: "open", envWire: "open", uiWire: "invite_only", defaultWire: "invite_only"},
		{key: "HOMEPAD_MAX_ACCOUNTS", envRaw: "10", envWire: float64(10), uiWire: float64(50), defaultWire: float64(0)},
		{key: "OIDC_ENABLED", envRaw: "true", envWire: true, uiWire: false, defaultWire: false},
		{key: "OIDC_ISSUER", envRaw: idp.issuer(), envWire: idp.issuer(), uiWire: "https://sso.example.com/", defaultWire: "", uiWireNormalized: "https://sso.example.com"},
		// AC-004 — a saved empty string is a UI value and wins over env.
		{key: "OIDC_DISCOVERY_URL", envRaw: idp.issuer() + "/.well-known/openid-configuration", envWire: idp.issuer() + "/.well-known/openid-configuration", uiWire: "", defaultWire: ""},
		{key: "OIDC_REDIRECT_URL", envRaw: testRedirectURL, envWire: testRedirectURL, uiWire: "https://home.example.com/api/auth/oidc/callback", defaultWire: ""},
		{key: "OIDC_CLIENT_ID", envRaw: testClientID, envWire: testClientID, uiWire: "homepad-2", defaultWire: ""},
		{key: "OIDC_ADMIN_GROUP", envRaw: "admins", envWire: "admins", uiWire: "", defaultWire: ""},
		{key: "OIDC_MEMBER_GROUP", envRaw: "family", envWire: "family", uiWire: " homepad ", defaultWire: "", uiWireNormalized: "homepad"},
	}
}

// AC-003, AC-004, AC-005 — every key from all three sources: default with no
// env, env when set, UI after a save (an empty string included), and env
// again after a reset.
func TestServerSettings_PrecedenceEveryKey(t *testing.T) {
	idp := newMockIdP(t, "admin@homepad.test", nil)
	cases := precedenceCases(idp)

	// Default: no env at all.
	plain := newSettingsEnv(t, nil)
	b := ssGet(t, plain)
	for _, c := range cases {
		s := b.get(t, c.key)
		assert.Equal(t, "default", s["source"], c.key)
		assert.Equal(t, c.defaultWire, s["value"], c.key)
		assert.Equal(t, c.defaultWire, s["defaultValue"], c.key)
		assert.Nil(t, s["envValue"], c.key)
		assert.Equal(t, false, s["saved"], c.key)
	}
	assert.Equal(t, "default", b.get(t, "OIDC_CLIENT_SECRET")["source"])
	port := b.get(t, "PORT")
	assert.Equal(t, "default", port["source"])
	assert.Equal(t, float64(8080), port["value"])

	// Env: every key set.
	envVals := map[string]string{"OIDC_CLIENT_SECRET": testClientSecret, "PORT": "9090"}
	for _, c := range cases {
		envVals[c.key] = c.envRaw
	}
	env := newSettingsEnv(t, envVals)
	b = ssGet(t, env)
	for _, c := range cases {
		s := b.get(t, c.key)
		assert.Equal(t, "env", s["source"], c.key)
		assert.Equal(t, c.envWire, s["value"], c.key)
		assert.Equal(t, c.envWire, s["envValue"], c.key)
	}
	sec := b.get(t, "OIDC_CLIENT_SECRET")
	assert.Equal(t, "env", sec["source"])
	assert.Equal(t, true, sec["envIsSet"])
	port = b.get(t, "PORT")
	assert.Equal(t, "env", port["source"])
	assert.Equal(t, float64(9090), port["value"])

	// UI: save every key at once; each wins over env.
	set := map[string]any{"OIDC_CLIENT_SECRET": "ui-secret-value"}
	for _, c := range cases {
		set[c.key] = c.uiWire
	}
	code, raw, b := ssPatch(t, env, set, allConfirms...)
	require.Equal(t, http.StatusOK, code, raw)
	for _, c := range cases {
		s := b.get(t, c.key)
		want := c.uiWire
		if c.uiWireNormalized != nil {
			want = c.uiWireNormalized
		}
		assert.Equal(t, "ui", s["source"], c.key)
		assert.Equal(t, want, s["value"], c.key)
		assert.Equal(t, want, s["savedValue"], c.key)
		assert.Equal(t, c.envWire, s["envValue"], "%s: envValue is still the env's", c.key)
		assert.Equal(t, true, s["saved"], c.key)
	}
	assert.Equal(t, "ui", b.get(t, "OIDC_CLIENT_SECRET")["source"])
	assert.Equal(t, b.Settings, ssGet(t, env).Settings, "PATCH answers the full GET body")

	// Reset: back to env, one key at a time. OIDC_ENABLED last, so turning
	// single sign-on back on checks discovery against the env provider.
	order := append([]precedenceCase{}, cases...)
	sort.SliceStable(order, func(i, j int) bool { return order[j].key == "OIDC_ENABLED" })
	for _, c := range append(order, precedenceCase{key: "OIDC_CLIENT_SECRET"}) {
		if c.key == "OIDC_CLIENT_SECRET" {
			continue
		}
		code, raw, b = ssReset(t, env, c.key, allConfirms...)
		require.Equal(t, http.StatusOK, code, "%s: %s", c.key, raw)
		s := b.get(t, c.key)
		assert.Equal(t, "env", s["source"], c.key)
		assert.Equal(t, c.envWire, s["value"], c.key)
		assert.Equal(t, false, s["saved"], c.key)
	}
	code, raw, b = ssReset(t, env, "OIDC_CLIENT_SECRET")
	require.Equal(t, http.StatusOK, code, raw)
	assert.Equal(t, "env", b.get(t, "OIDC_CLIENT_SECRET")["source"])

	// AC-005 — the "Slow" threshold's reset is NULL in system_settings.
	cfg, err := env.Store.SystemSettings(context.Background())
	require.NoError(t, err)
	assert.Nil(t, cfg.StatusDegradedMs)
	rows, err := env.Store.ServerSettings(context.Background())
	require.NoError(t, err)
	assert.Empty(t, rows, "every reset deleted its row")

	// AC-005 — a reset with no env falls back to the default.
	code, raw, _ = ssPatch(t, plain, map[string]any{"HOMEPAD_MAX_ACCOUNTS": 7})
	require.Equal(t, http.StatusOK, code, raw)
	_, _, b = ssReset(t, plain, "HOMEPAD_MAX_ACCOUNTS")
	assert.Equal(t, "default", b.get(t, "HOMEPAD_MAX_ACCOUNTS")["source"])
	assert.Equal(t, float64(0), b.get(t, "HOMEPAD_MAX_ACCOUNTS")["value"])
}

// AC-001 — an upgraded install with an empty table behaves exactly as
// before: every key reads env or default, and nothing is saved.
func TestServerSettings_EmptyTableChangesNothing(t *testing.T) {
	env := newSettingsEnv(t, map[string]string{"HOMEPAD_REGISTRATION": "open", "COOKIE_SECURE": "false"})
	for _, s := range ssGet(t, env).Settings {
		assert.NotEqual(t, "ui", s["source"], s["key"])
		assert.Equal(t, false, s["saved"], s["key"])
	}
	resp, err := http.Get(env.URL + "/api/auth/config")
	require.NoError(t, err)
	defer resp.Body.Close()
	var c authConfigView
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&c))
	assert.Equal(t, "open", c.Registration)
}

// AC-006 — a saved value that fails validation at boot is ignored with a
// warning; a bad sign-up mode fails closed to invite_only; a bad account
// limit stops the API.
func TestServerSettings_BootValidation(t *testing.T) {
	env := newSettingsEnv(t, map[string]string{"GATUS_BASE_URL": "http://127.0.0.1:2", "HOMEPAD_REGISTRATION": "open"})
	ctx := context.Background()
	_, err := env.Store.Pool().Exec(ctx, `INSERT INTO server_settings (key, value) VALUES
		('GATUS_BASE_URL', 'ftp://status.example.com'), ('HOMEPAD_REGISTRATION', 'sometimes')`)
	require.NoError(t, err)
	logs := captureLog(t)
	twin := env.Twin(t, envDeps(map[string]string{"GATUS_BASE_URL": "http://127.0.0.1:2", "HOMEPAD_REGISTRATION": "open"}))
	b := ssGet(t, twin)
	g := b.get(t, "GATUS_BASE_URL")
	assert.Equal(t, "env", g["source"])
	assert.Equal(t, "http://127.0.0.1:2", g["value"])
	assert.Equal(t, true, g["saved"])
	assert.Equal(t, true, g["savedInvalid"])
	reg := b.get(t, "HOMEPAD_REGISTRATION")
	assert.Equal(t, "invite_only", reg["value"], "a bad saved sign-up mode fails closed")
	assert.Contains(t, logs.String(), "GATUS_BASE_URL fails validation")
	assert.Contains(t, logs.String(), "HOMEPAD_REGISTRATION is not open or invite_only")

	_, err = env.Store.Pool().Exec(ctx, `INSERT INTO server_settings (key, value) VALUES ('HOMEPAD_MAX_ACCOUNTS', 'lots')`)
	require.NoError(t, err)
	d := api.Deps{Store: env.Store, Sessions: env.Sessions}
	envDeps(nil)(&d)
	_, err = api.NewChecked(d)
	require.Error(t, err, "a bad saved account limit stops the API")
	assert.Contains(t, err.Error(), "account limit")
}

// §3.3 — a bad env value stops the API only when no good UI value replaces
// it.
func TestServerSettings_SavedValueReplacesJunkEnv(t *testing.T) {
	env := newSettingsEnv(t, nil)
	getenv := func(k string) string { return map[string]string{"HOMEPAD_MAX_ACCOUNTS": "lots"}[k] }
	ctx := context.Background()
	assert.False(t, api.SavedSettingReplacesEnv(ctx, env.Store, "HOMEPAD_MAX_ACCOUNTS", getenv))
	code, raw, _ := ssPatch(t, env, map[string]any{"HOMEPAD_MAX_ACCOUNTS": 20, "HOMEPAD_TRUSTED_PROXIES": "192.0.2.1"}, allConfirms...)
	require.Equal(t, http.StatusOK, code, raw)
	assert.True(t, api.SavedSettingReplacesEnv(ctx, env.Store, "HOMEPAD_MAX_ACCOUNTS", getenv))
	assert.True(t, api.SavedSettingReplacesEnv(ctx, env.Store, "HOMEPAD_TRUSTED_PROXIES", getenv))
	flag := func(k string) string {
		if k == api.SettingsFromEnvOnlyEnv {
			return "true"
		}
		return getenv(k)
	}
	assert.False(t, api.SavedSettingReplacesEnv(ctx, env.Store, "HOMEPAD_MAX_ACCOUNTS", flag), "the recovery flag ignores saved values")
}

// AC-007 — the GET shape, for a plain key, the secret and PORT.
func TestServerSettings_GETShape(t *testing.T) {
	env := newSettingsEnv(t, map[string]string{"GATUS_BASE_URL": "http://127.0.0.1:2"})
	code, raw, b := ssPatch(t, env, map[string]any{"GATUS_BASE_URL": "http://127.0.0.1:1"})
	require.Equal(t, http.StatusOK, code, raw)
	assert.False(t, b.EnvOnly)
	g := b.get(t, "GATUS_BASE_URL")
	for _, f := range []string{"key", "group", "type", "value", "source", "envValue", "defaultValue", "editable", "applies", "updatedAt", "updatedBy", "saved", "savedValue"} {
		assert.Contains(t, g, f)
	}
	assert.Equal(t, "status", g["group"])
	assert.Equal(t, "string", g["type"])
	assert.Equal(t, "live", g["applies"])
	assert.Equal(t, true, g["editable"])
	by := g["updatedBy"].(map[string]any)
	assert.Equal(t, env.AdminID, by["id"])
	assert.NotEmpty(t, by["name"])
	_, err := time.Parse(time.RFC3339, g["updatedAt"].(string))
	assert.NoError(t, err)

	sec := b.get(t, "OIDC_CLIENT_SECRET")
	for _, f := range []string{"isSet", "envIsSet", "unreadable", "secret", "source"} {
		assert.Contains(t, sec, f)
	}
	for _, f := range []string{"value", "envValue", "defaultValue", "savedValue"} {
		assert.NotContains(t, sec, f, "the secret has no %s", f)
	}
	assert.Equal(t, "signin", sec["group"])

	reg := b.get(t, "HOMEPAD_REGISTRATION")
	assert.Equal(t, "choice", reg["type"])
	assert.Equal(t, []any{"invite_only", "open"}, reg["choices"])
	assert.Equal(t, "accounts", reg["group"])
	assert.Equal(t, "server", b.get(t, "COOKIE_SECURE")["group"])
}

// AC-008 — all keys in one request save in one transaction, or none do.
func TestServerSettings_PatchIsAllOrNothing(t *testing.T) {
	env := newSettingsEnv(t, nil)
	code, raw, _ := ssPatch(t, env, map[string]any{"OIDC_MEMBER_GROUP": "family", "HOMEPAD_MAX_ACCOUNTS": -3})
	assert.Equal(t, http.StatusBadRequest, code, raw)
	rows, err := env.Store.ServerSettings(context.Background())
	require.NoError(t, err)
	assert.Empty(t, rows, "a bad value saves nothing")

	code, raw, b := ssPatch(t, env, map[string]any{"OIDC_MEMBER_GROUP": "family", "OIDC_ADMIN_GROUP": "admins", "GATUS_DEGRADED_MS": 1500})
	require.Equal(t, http.StatusOK, code, raw)
	assert.Equal(t, "family", b.get(t, "OIDC_MEMBER_GROUP")["value"])
	assert.Equal(t, "admins", b.get(t, "OIDC_ADMIN_GROUP")["value"])
	assert.Equal(t, float64(1500), b.get(t, "GATUS_DEGRADED_MS")["value"])

	code, raw, _ = ssPatch(t, env, map[string]any{})
	assert.Equal(t, http.StatusBadRequest, code, raw)
	resp := doJSON(t, http.MethodPatch, env.URL+settingsURL, "admin-session", "not an object")
	resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

// AC-009 — DELETE resets one key and answers the full body; a key with no
// saved value is a no-op.
func TestServerSettings_DeleteAnswersBody(t *testing.T) {
	env := newSettingsEnv(t, nil)
	code, raw, b := ssReset(t, env, "OIDC_MEMBER_GROUP")
	require.Equal(t, http.StatusOK, code, raw)
	assert.Len(t, b.Settings, 15)
	ssPatch(t, env, map[string]any{"OIDC_MEMBER_GROUP": "family"})
	code, raw, b = ssReset(t, env, "OIDC_MEMBER_GROUP")
	require.Equal(t, http.StatusOK, code, raw)
	assert.Equal(t, "default", b.get(t, "OIDC_MEMBER_GROUP")["source"])
}

// AC-010 — admin only: no session 401, member 403 (kids: routes_test.go).
func TestServerSettings_AdminOnly(t *testing.T) {
	env := newSettingsEnv(t, nil)
	routes := []struct{ method, path string }{
		{http.MethodGet, settingsURL},
		{http.MethodPatch, settingsURL},
		{http.MethodDelete, settingsURL + "/GATUS_BASE_URL"},
		{http.MethodPost, settingsURL + "/oidc/test"},
		{http.MethodGet, settingsURL + "/oidc/test/x"},
	}
	for _, r := range routes {
		body := map[string]any{"set": map[string]any{"GATUS_BASE_URL": "http://127.0.0.1:1"}}
		resp := doNoCookie(t, r.method, env.URL+r.path, body)
		resp.Body.Close()
		assert.Equal(t, http.StatusUnauthorized, resp.StatusCode, "%s %s without a session", r.method, r.path)
		resp = doJSON(t, r.method, env.URL+r.path, "non-admin-session", body)
		resp.Body.Close()
		assert.Equal(t, http.StatusForbidden, resp.StatusCode, "%s %s as a member", r.method, r.path)
	}
	rows, _ := env.Store.ServerSettings(context.Background())
	assert.Empty(t, rows)
}

// AC-011, TC-002 — each rule, in plain words; nothing is saved.
func TestServerSettings_Validation(t *testing.T) {
	env := newSettingsEnv(t, nil)
	bad := []struct {
		key  string
		v    any
		want string
	}{
		{"HOMEPAD_MAX_ACCOUNTS", -3, "Enter a whole number from 0 to 10000."},
		{"HOMEPAD_MAX_ACCOUNTS", "lots", "Enter a whole number from 0 to 10000."},
		{"HOMEPAD_MAX_ACCOUNTS", 10001, "Enter a whole number from 0 to 10000."},
		{"HOMEPAD_MAX_ACCOUNTS", 2.5, "Enter a whole number from 0 to 10000."},
		{"GATUS_DEGRADED_MS", 600001, "Enter a whole number from 0 to 600000."},
		{"HOMEPAD_TRUSTED_PROXIES", "0.0.0.0/0", "That trusts every address. Anyone could pick their own address, and the sign-in limits would stop working."},
		{"HOMEPAD_TRUSTED_PROXIES", "192.0.2.1, ::/0", "That trusts every address."},
		{"HOMEPAD_TRUSTED_PROXIES", "not a proxy!", "is not an address"},
		{"HOMEPAD_TRUSTED_PROXIES", strings.Repeat("192.0.2.1,", 65), "at most 64"},
		{"COOKIE_SECURE", "yes", "Choose on or off."},
		{"OIDC_ENABLED", 1, "Choose on or off."},
		{"HOMEPAD_REGISTRATION", "sometimes", "Choose invite only or open."},
		{"GATUS_BASE_URL", "ftp://status.example.com", "http://"},
		{"GATUS_BASE_URL", "https://status.example.com/?x=1", "no ? or #"},
		{"OIDC_ISSUER", "id.example.com", "Enter your provider's address"},
		{"OIDC_DISCOVERY_URL", "nope", "http://"},
		{"OIDC_REDIRECT_URL", "https://homepad.example.com/", "/api/auth/oidc/callback"},
		{"OIDC_CLIENT_ID", "has space", "no spaces"},
		{"OIDC_CLIENT_ID", "", "1 to 255"},
		{"OIDC_CLIENT_SECRET", "", "1 to 1024"},
		{"OIDC_CLIENT_SECRET", strings.Repeat("x", 1025), "1 to 1024"},
		{"OIDC_ADMIN_GROUP", strings.Repeat("g", 256), "at most 255"},
		{"OIDC_MEMBER_GROUP", 5, "Enter text."},
	}
	for _, c := range bad {
		code, raw, _ := ssPatch(t, env, map[string]any{c.key: c.v}, allConfirms...)
		assert.Equal(t, http.StatusBadRequest, code, "%s=%v: %s", c.key, c.v, raw)
		var e struct{ Error, Key, Message string }
		require.NoError(t, json.Unmarshal([]byte(raw), &e))
		assert.Equal(t, "invalid", e.Error, c.key)
		assert.Equal(t, c.key, e.Key)
		assert.Contains(t, e.Message, c.want, "%s=%v", c.key, c.v)
	}
	rows, _ := env.Store.ServerSettings(context.Background())
	assert.Empty(t, rows)
}

// AC-012 — PORT is read-only; DATABASE_URL and HOMEPAD_SECRET_KEY are never
// in any response.
func TestServerSettings_PortAndHiddenKeys(t *testing.T) {
	env := newSettingsEnv(t, map[string]string{"PORT": "9090"})
	b := ssGet(t, env)
	p := b.get(t, "PORT")
	assert.Equal(t, false, p["editable"])
	assert.Equal(t, "restart", p["applies"])
	assert.Equal(t, "restart", p["readOnlyReason"])

	code, raw, _ := ssPatch(t, env, map[string]any{"PORT": 9091})
	assert.Equal(t, http.StatusBadRequest, code)
	assert.Equal(t, "read_only", errCode(raw))
	code, raw, _ = ssReset(t, env, "PORT")
	assert.Equal(t, http.StatusBadRequest, code)
	assert.Equal(t, "read_only", errCode(raw))

	var all []string
	_, raw, _ = ssCall(t, http.MethodGet, env.URL+settingsURL, "admin-session", nil)
	all = append(all, raw)
	for _, k := range []string{"DATABASE_URL", "HOMEPAD_SECRET_KEY"} {
		code, raw, _ := ssPatch(t, env, map[string]any{k: "x"})
		assert.Equal(t, http.StatusNotFound, code)
		all = append(all, raw)
		_, raw, _ = ssReset(t, env, k)
		all = append(all, raw)
	}
	for _, r := range all {
		assert.NotContains(t, r, "DATABASE_URL")
		assert.NotContains(t, r, "HOMEPAD_SECRET_KEY")
	}
}

// AC-028 — one log line per changed key after the write; secrets as (set),
// (replaced) or (removed); refusals log; updated_by is set.
func TestServerSettings_AuditLines(t *testing.T) {
	env := newSettingsEnv(t, map[string]string{"HOMEPAD_MAX_ACCOUNTS": "10"})
	logs := captureLog(t)
	code, raw, _ := ssPatch(t, env, map[string]any{"OIDC_ISSUER": "https://id.example.com", "HOMEPAD_MAX_ACCOUNTS": 5, "OIDC_CLIENT_SECRET": "s3cr3t-audit-value"}, allConfirms...)
	require.Equal(t, http.StatusOK, code, raw)
	id := env.AdminID
	out := logs.String()
	assert.Contains(t, out, `settings: admin `+id+` changed OIDC_ISSUER from "" to "https://id.example.com"`)
	assert.Contains(t, out, `settings: admin `+id+` changed HOMEPAD_MAX_ACCOUNTS from "10" to "5"`)
	assert.Contains(t, out, `settings: admin `+id+` changed OIDC_CLIENT_SECRET (set)`)

	ssPatch(t, env, map[string]any{"OIDC_CLIENT_SECRET": "s3cr3t-audit-value-2"})
	assert.Contains(t, logs.String(), `changed OIDC_CLIENT_SECRET (replaced)`)

	ssReset(t, env, "HOMEPAD_MAX_ACCOUNTS")
	assert.Contains(t, logs.String(), `settings: admin `+id+` reset HOMEPAD_MAX_ACCOUNTS (was "5"; now env "10")`)
	ssReset(t, env, "OIDC_CLIENT_SECRET")
	assert.Contains(t, logs.String(), `settings: admin `+id+` reset OIDC_CLIENT_SECRET (removed)`)

	ssPatch(t, env, map[string]any{"COOKIE_SECURE": false})
	assert.Contains(t, logs.String(), `settings: admin `+id+` refused COOKIE_SECURE: confirm_required`)

	// Saving the value already saved writes no line.
	before := strings.Count(logs.String(), "changed OIDC_ISSUER")
	ssPatch(t, env, map[string]any{"OIDC_ISSUER": "https://id.example.com"})
	assert.Equal(t, before, strings.Count(logs.String(), "changed OIDC_ISSUER"))

	assert.NotContains(t, logs.String(), "s3cr3t-audit-value")
	rows, _ := env.Store.ServerSettings(context.Background())
	for _, r := range rows {
		assert.Equal(t, id, r.UpdatedBy, r.Key)
		assert.False(t, r.UpdatedAt.IsZero())
	}
}
