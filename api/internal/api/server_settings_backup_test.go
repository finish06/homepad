package api_test

import (
	"context"
	"net/http"
	"net/netip"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/finish06/homepad/api/internal/api"
	"github.com/finish06/homepad/api/internal/testsupport"
)

// SPEC-admin-server-settings §2.8, AC-029 — a backup made with every server
// setting saved holds none of them (statusDegradedMs aside) and never the
// secret; a restore leaves server_settings unchanged. This extends
// SPEC-backup-import AC-004 (TestTransfer_ExportFromAPopulatedDB).
func TestServerSettingsBackup_HoldsNoServerSettings(t *testing.T) {
	idp := newMockIdP(t, "admin@homepad.test", nil)
	idp.clientID = "client-id-marker"
	res := &fakeResolver{calls: map[string]int{}, addrs: map[string]netip.Addr{}} // no real DNS from a test
	env := testsupport.NewEnvWith(t, testsupport.Options{Deps: func(d *api.Deps) {
		envDeps(nil)(d)
		d.ResolveHost = res.lookup
	}})
	populate(t, env)
	marker := map[string]any{
		"COOKIE_SECURE":           false,
		"HOMEPAD_TRUSTED_PROXIES": "192.0.2.77,proxy-marker.example.com",
		"GATUS_BASE_URL":          "http://127.0.0.1:1/gatus-marker",
		"GATUS_DEGRADED_MS":       4321,
		"HOMEPAD_REGISTRATION":    "open",
		"HOMEPAD_MAX_ACCOUNTS":    977,
		"OIDC_ENABLED":            true,
		"OIDC_ISSUER":             idp.issuer(),
		"OIDC_DISCOVERY_URL":      idp.issuer() + "/.well-known/openid-configuration",
		"OIDC_REDIRECT_URL":       "https://redirect-marker.example.com/api/auth/oidc/callback",
		"OIDC_CLIENT_ID":          idp.clientID,
		"OIDC_CLIENT_SECRET":      "secret-marker-1b7d",
		"OIDC_ADMIN_GROUP":        "admin-group-marker",
		"OIDC_MEMBER_GROUP":       "member-group-marker",
	}
	code, raw, _ := ssPatch(t, env, marker, allConfirms...)
	require.Equal(t, http.StatusOK, code, raw)

	resp, b := getExport(t, env.URL, "admin-session", "")
	require.Equal(t, http.StatusOK, resp.StatusCode, "%s", b)
	body := string(b)
	for _, s := range []string{"192.0.2.77", "proxy-marker", "gatus-marker", "redirect-marker", "secret-marker-1b7d",
		"admin-group-marker", "member-group-marker", idp.issuer(), "977", idp.clientID,
		"COOKIE_SECURE", "OIDC_", "HOMEPAD_", "GATUS_", "server_settings"} {
		assert.NotContains(t, body, s)
	}
	assert.Contains(t, body, `"statusDegradedMs": 4321`, "the household's Slow threshold stays in the backup")

	before, err := env.Store.ServerSettings(context.Background())
	require.NoError(t, err)
	require.Len(t, before, 13)
	plan := previewRestore(t, env.URL, "admin-session", "replace", b)
	code, out := applyRestore(t, env.URL, "admin-session", "replace", plan.PlanHash, b)
	require.Equal(t, http.StatusOK, code, "%s", out)
	after, err := env.Store.ServerSettings(context.Background())
	require.NoError(t, err)
	assert.Equal(t, before, after, "a restore leaves server_settings unchanged")
}
