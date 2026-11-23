package api_test

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/finish06/homepad/api/internal/api"
	"github.com/finish06/homepad/api/internal/testsupport"
)

// SPEC-admin-server-settings AC-030 — with more than one API process, a
// change made on one applies on the others within 30 seconds. main reloads
// every api.SettingsReloadEvery; the test uses a short interval.
func TestServerSettingsReload_OtherProcessFollows(t *testing.T) {
	require.LessOrEqual(t, api.SettingsReloadEvery, 30*time.Second, "main's interval keeps the 30 s promise")
	envVals := map[string]string{"HOMEPAD_REGISTRATION": "open"}
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	reloading := func(d *api.Deps) {
		envDeps(envVals)(d)
		d.Context = ctx
		d.SettingsReloadEvery = 20 * time.Millisecond
	}
	a := testsupport.NewEnvWith(t, testsupport.Options{Deps: reloading})
	b := a.Twin(t, reloading)
	require.Equal(t, "open", authConfig(t, b).Registration)

	code, raw, _ := ssPatch(t, a, map[string]any{"HOMEPAD_REGISTRATION": "invite_only", "OIDC_MEMBER_GROUP": "family"})
	require.Equal(t, http.StatusOK, code, raw)
	assert.Eventually(t, func() bool { return authConfig(t, b).Registration == "invite_only" }, 2*time.Second, 10*time.Millisecond)
	assert.Equal(t, "ui", ssGet(t, b).get(t, "OIDC_MEMBER_GROUP")["source"])

	code, raw, _ = ssReset(t, a, "HOMEPAD_REGISTRATION", "registration_open")
	require.Equal(t, http.StatusOK, code, raw)
	assert.Eventually(t, func() bool { return authConfig(t, b).Registration == "open" }, 2*time.Second, 10*time.Millisecond)

	// A save on b compares with what is stored, not b's older snapshot.
	code, raw, _ = ssPatch(t, a, map[string]any{"HOMEPAD_MAX_ACCOUNTS": 40})
	require.Equal(t, http.StatusOK, code, raw)
	code, raw, body := ssPatch(t, b, map[string]any{"OIDC_ADMIN_GROUP": "admins"})
	require.Equal(t, http.StatusOK, code, raw)
	assert.Equal(t, float64(40), body.get(t, "HOMEPAD_MAX_ACCOUNTS")["value"])
}
