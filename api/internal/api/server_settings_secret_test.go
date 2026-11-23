package api_test

import (
	"bytes"
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/finish06/homepad/api/internal/api"
	"github.com/finish06/homepad/api/internal/testsupport"
	"github.com/finish06/homepad/api/internal/widgets"
)

// SPEC-admin-server-settings §2.4 — the OIDC client secret (AC-013…AC-015).

const knownSecret = "known-client-secret-7c41"

// AC-013 — the secret is in no response body, log line or error of the
// three routes (and the test sign-in), whatever happens.
func TestServerSettingsSecret_NeverInResponsesOrLogs(t *testing.T) {
	idp := newMockIdP(t, "admin@homepad.test", nil)
	idp.clientSecret = knownSecret
	env := newSettingsEnv(t, nil)
	logs := captureLog(t)
	var bodies []string
	call := func(method, path string, body any) {
		_, raw, _ := ssCall(t, method, env.URL+path, "admin-session", body)
		bodies = append(bodies, raw)
	}
	call(http.MethodPatch, settingsURL, map[string]any{"set": map[string]any{"OIDC_CLIENT_SECRET": knownSecret}})
	call(http.MethodGet, settingsURL, nil)
	// Errors carrying the secret in the request.
	call(http.MethodPatch, settingsURL, map[string]any{"set": map[string]any{"OIDC_CLIENT_SECRET": knownSecret, "HOMEPAD_MAX_ACCOUNTS": -1}})
	call(http.MethodPatch, settingsURL, map[string]any{"set": map[string]any{"OIDC_CLIENT_SECRET": knownSecret + "x", "COOKIE_SECURE": false}})
	call(http.MethodPatch, settingsURL, map[string]any{"set": map[string]any{"OIDC_CLIENT_SECRET": knownSecret + "y", "OIDC_ENABLED": true}})
	call(http.MethodPatch, settingsURL, map[string]any{"set": map[string]any{
		"OIDC_CLIENT_SECRET": knownSecret, "OIDC_ENABLED": true, "OIDC_ISSUER": "http://127.0.0.1:1",
		"OIDC_CLIENT_ID": testClientID, "OIDC_REDIRECT_URL": testRedirectURL}})
	call(http.MethodPost, settingsURL+"/oidc/test", map[string]any{"set": map[string]any{
		"OIDC_CLIENT_SECRET": knownSecret, "OIDC_ISSUER": idp.issuer(), "OIDC_CLIENT_ID": testClientID, "OIDC_REDIRECT_URL": testRedirectURL}})
	call(http.MethodPost, settingsURL+"/oidc/test", map[string]any{"set": map[string]any{
		"OIDC_CLIENT_SECRET": knownSecret, "OIDC_ISSUER": "http://127.0.0.1:1", "OIDC_CLIENT_ID": testClientID, "OIDC_REDIRECT_URL": testRedirectURL}})
	// Turn it on for real, then change it, then reset it.
	call(http.MethodPatch, settingsURL, map[string]any{"set": map[string]any{
		"OIDC_ENABLED": true, "OIDC_ISSUER": idp.issuer(), "OIDC_CLIENT_ID": testClientID, "OIDC_REDIRECT_URL": testRedirectURL}})
	call(http.MethodGet, settingsURL, nil)
	call(http.MethodDelete, settingsURL+"/OIDC_CLIENT_SECRET", nil)
	call(http.MethodGet, settingsURL, nil)

	for i, b := range bodies {
		assert.NotContains(t, b, knownSecret, "response %d", i)
	}
	assert.NotContains(t, logs.String(), knownSecret)
	assert.Contains(t, bodies[0], `"isSet":true`)
}

// AC-014 — with a server key the secret is sealed: value NULL, sealed and
// nonce set, and the ciphertext doesn't hold the plaintext.
func TestServerSettingsSecret_SealedAtRest(t *testing.T) {
	env := newSettingsEnv(t, nil)
	code, raw, b := ssPatch(t, env, map[string]any{"OIDC_CLIENT_SECRET": knownSecret})
	require.Equal(t, http.StatusOK, code, raw)
	sec := b.get(t, "OIDC_CLIENT_SECRET")
	assert.Equal(t, true, sec["isSet"])
	assert.Equal(t, "ui", sec["source"])

	var value *string
	var sealed, nonce []byte
	require.NoError(t, env.Store.Pool().QueryRow(context.Background(),
		`SELECT value, sealed, nonce FROM server_settings WHERE key = 'OIDC_CLIENT_SECRET'`).Scan(&value, &sealed, &nonce))
	assert.Nil(t, value)
	assert.NotEmpty(t, sealed)
	assert.Len(t, nonce, 12)
	assert.False(t, bytes.Contains(sealed, []byte(knownSecret)))
	assert.NotContains(t, dumpDB(t, env), knownSecret)
}

// AC-014 (Q1 A) — without a server key, saving the secret is 409
// no_secret_key; the row says why; the env secret keeps working.
func TestServerSettingsSecret_NoServerKey(t *testing.T) {
	env := testsupport.NewEnvWith(t, testsupport.Options{
		Widgets: testsupport.WidgetOptions{NoSecretKey: true},
		Deps:    envDeps(map[string]string{"OIDC_CLIENT_SECRET": "env-secret"}),
	})
	code, raw, _ := ssPatch(t, env, map[string]any{"OIDC_CLIENT_SECRET": knownSecret})
	assert.Equal(t, http.StatusConflict, code)
	assert.Equal(t, "no_secret_key", errCode(raw))
	assert.NotContains(t, raw, "HOMEPAD_SECRET_KEY")
	rows, _ := env.Store.ServerSettings(context.Background())
	assert.Empty(t, rows)

	sec := ssGet(t, env).get(t, "OIDC_CLIENT_SECRET")
	assert.Equal(t, false, sec["editable"])
	assert.Equal(t, "no_secret_key", sec["readOnlyReason"])
	assert.Equal(t, true, sec["isSet"], "the env secret still counts")
	assert.Equal(t, "env", sec["source"])

	// Other keys still save.
	code, raw, _ = ssPatch(t, env, map[string]any{"OIDC_CLIENT_ID": "homepad"})
	assert.Equal(t, http.StatusOK, code, raw)
}

// AC-015 — a saved secret that can't be opened (the server key changed)
// reads unreadable:true; the env secret applies; one warning at boot.
func TestServerSettingsSecret_Unreadable(t *testing.T) {
	envVals := map[string]string{"OIDC_CLIENT_SECRET": "env-secret"}
	env := newSettingsEnv(t, envVals)
	code, raw, _ := ssPatch(t, env, map[string]any{"OIDC_CLIENT_SECRET": knownSecret})
	require.Equal(t, http.StatusOK, code, raw)

	logs := captureLog(t)
	other, err := widgets.ParseSecretKey(strings.Repeat("ab", 32))
	require.NoError(t, err)
	twin := env.Twin(t, func(d *api.Deps) {
		envDeps(envVals)(d)
		d.Sealer = other
	})
	sec := ssGet(t, twin).get(t, "OIDC_CLIENT_SECRET")
	assert.Equal(t, true, sec["unreadable"])
	assert.Equal(t, true, sec["saved"])
	assert.Equal(t, "env", sec["source"], "the env secret applies")
	assert.Equal(t, 1, strings.Count(logs.String(), "OIDC_CLIENT_SECRET can't be opened"), logs.String())

	// Replacing it clears the state.
	code, raw, b := ssPatch(t, twin, map[string]any{"OIDC_CLIENT_SECRET": knownSecret})
	require.Equal(t, http.StatusOK, code, raw)
	assert.Equal(t, false, b.get(t, "OIDC_CLIENT_SECRET")["unreadable"])
	assert.Equal(t, "ui", b.get(t, "OIDC_CLIENT_SECRET")["source"])
}
