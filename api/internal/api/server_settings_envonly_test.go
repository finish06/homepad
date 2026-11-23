package api_test

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/finish06/homepad/api/internal/api"
)

// SPEC-admin-server-settings §2.6, AC-031 — HOMEPAD_SETTINGS_FROM_ENV_ONLY.
func TestServerSettingsEnvOnly_IgnoresSavedValues(t *testing.T) {
	envVals := map[string]string{"HOMEPAD_REGISTRATION": "open", "COOKIE_SECURE": "false"}
	env := newSettingsEnv(t, envVals)
	code, raw, _ := ssPatch(t, env, map[string]any{"HOMEPAD_REGISTRATION": "invite_only", "COOKIE_SECURE": true,
		"OIDC_MEMBER_GROUP": "family", "GATUS_DEGRADED_MS": 300, "OIDC_CLIENT_SECRET": "saved-secret"}, allConfirms...)
	require.Equal(t, http.StatusOK, code, raw)
	before, err := env.Store.ServerSettings(context.Background())
	require.NoError(t, err)

	for _, v := range []string{"true", "1", "yes", "ON"} {
		withFlag := map[string]string{api.SettingsFromEnvOnlyEnv: v}
		for k, val := range envVals {
			withFlag[k] = val
		}
		twin := env.Twin(t, envDeps(withFlag))
		b := ssGet(t, twin)
		require.True(t, b.EnvOnly, v)
		for _, s := range b.Settings {
			assert.NotEqual(t, "ui", s["source"], "%s=%s: %s", api.SettingsFromEnvOnlyEnv, v, s["key"])
			assert.Equal(t, false, s["editable"], s["key"])
		}
		reg := b.get(t, "HOMEPAD_REGISTRATION")
		assert.Equal(t, "open", reg["value"])
		assert.Equal(t, "env", reg["source"])
		assert.Equal(t, true, reg["saved"])
		assert.Equal(t, "invite_only", reg["savedValue"], "the panel can say what is ignored")
		assert.Equal(t, "env_only", reg["readOnlyReason"])
		assert.Equal(t, float64(1000), b.get(t, "GATUS_DEGRADED_MS")["value"])
		assert.Equal(t, "open", authConfig(t, twin).Registration, "the live config uses env")
	}

	flagged := map[string]string{api.SettingsFromEnvOnlyEnv: "true"}
	for k, val := range envVals {
		flagged[k] = val
	}
	twin := env.Twin(t, envDeps(flagged))
	code, raw, _ = ssPatch(t, twin, map[string]any{"OIDC_MEMBER_GROUP": "other"})
	assert.Equal(t, http.StatusConflict, code)
	assert.Equal(t, "env_only", errCode(raw))
	code, raw, _ = ssCall(t, http.MethodPost, twin.URL+settingsURL+"/oidc/test", "admin-session", map[string]any{"set": map[string]any{}})
	assert.Equal(t, http.StatusConflict, code, raw)

	after, _ := env.Store.ServerSettings(context.Background())
	assert.Equal(t, before, after, "the saved rows are unchanged")

	// Reset still works, and changes only that row.
	code, raw, b := ssReset(t, twin, "COOKIE_SECURE")
	require.Equal(t, http.StatusOK, code, raw)
	assert.Equal(t, false, b.get(t, "COOKIE_SECURE")["saved"])
	code, raw, _ = ssReset(t, twin, "GATUS_DEGRADED_MS")
	require.Equal(t, http.StatusOK, code, raw)
	rows, _ := env.Store.ServerSettings(context.Background())
	assert.Len(t, rows, len(before)-1)
	cfg, _ := env.Store.SystemSettings(context.Background())
	assert.Nil(t, cfg.StatusDegradedMs)

	// Off again (any other value is off): the remaining saved values apply.
	for _, v := range []string{"false", "0", "maybe"} {
		off := map[string]string{api.SettingsFromEnvOnlyEnv: v}
		for k, val := range envVals {
			off[k] = val
		}
		logs := captureLog(t)
		back := env.Twin(t, envDeps(off))
		b = ssGet(t, back)
		assert.False(t, b.EnvOnly, v)
		assert.Equal(t, "ui", b.get(t, "HOMEPAD_REGISTRATION")["source"])
		assert.Equal(t, "env", b.get(t, "COOKIE_SECURE")["source"], "the reset row stays reset")
		if v == "maybe" {
			assert.True(t, strings.Contains(logs.String(), api.SettingsFromEnvOnlyEnv), "an unknown value warns at boot")
		}
	}
}
