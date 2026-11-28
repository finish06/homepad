package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/finish06/homepad/api/internal/testsupport"
)

// SPEC-health-widget §4.3 — the per-person hidden widgets list on
// GET/PATCH /api/me, and the old showHealthBar / showWidgets fields kept
// until 19.0.0.

const legacyWarning = `299 - "showHealthBar and showWidgets are deprecated; use hiddenWidgets. They go away in 19.0.0."`

// patchMeRaw sends body as is (so a test can send what json.Marshal of a map
// can't express, like a duplicate) and returns the status, headers and body.
func patchMeRaw(t *testing.T, baseURL, session, body string) (int, http.Header, map[string]any) {
	t.Helper()
	req, _ := http.NewRequest(http.MethodPatch, baseURL+"/api/me", bytes.NewReader([]byte(body)))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: "homepad_session", Value: session})
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	var out map[string]any
	_ = json.Unmarshal(b, &out)
	return resp.StatusCode, resp.Header, out
}

func hiddenOf(t *testing.T, me map[string]any) []string {
	t.Helper()
	raw, ok := me["hiddenWidgets"].([]any)
	require.True(t, ok, "hiddenWidgets is an array: %v", me["hiddenWidgets"])
	out := []string{}
	for _, v := range raw {
		out = append(out, v.(string))
	}
	return out
}

// AC-006 — GET /api/me returns the list, never null, plus the old fields
// worked out from it, for adults and kids.
func TestHiddenWidgets_GetShape(t *testing.T) {
	env := testsupport.NewEnv(t)
	code, me := getMeRaw(t, env.URL, "non-admin-session")
	require.Equal(t, http.StatusOK, code)
	assert.Equal(t, []string{}, hiddenOf(t, me))
	assert.Equal(t, true, me["showHealthBar"])
	assert.Equal(t, true, me["showWidgets"])

	_, kidTok := env.SeedKid(t, "Ava")
	code, me = getMeRaw(t, env.URL, kidTok)
	require.Equal(t, http.StatusOK, code)
	assert.Equal(t, []string{"health"}, hiddenOf(t, me), "a new kid hides health (AC-004)")
	assert.Equal(t, false, me["showHealthBar"], "a kid's health is the old showHealthBar false")
	assert.Equal(t, true, me["showWidgets"])
}

// AC-006, AC-007 — PATCH replaces the whole list; the response and a later
// GET carry it in the fixed order with the old fields worked out from it.
func TestHiddenWidgets_PatchReplaces(t *testing.T) {
	env := testsupport.NewEnv(t)
	for _, c := range []struct {
		body        string
		want        []string
		bar, widget bool
	}{
		{`{"hiddenWidgets":["tiles","healthDetails","clock"]}`, []string{"clock", "healthDetails", "tiles"}, false, true},
		{`{"hiddenWidgets":["weather","tiles","clock"]}`, []string{"clock", "weather", "tiles"}, true, false},
		{`{"hiddenWidgets":["health"]}`, []string{"health"}, true, true},
		{`{"hiddenWidgets":[]}`, []string{}, true, true},
	} {
		code, h, out := patchMeRaw(t, env.URL, "non-admin-session", c.body)
		require.Equal(t, http.StatusOK, code, c.body)
		assert.Empty(t, h.Get("Warning"), "the new field carries no warning")
		assert.Equal(t, c.want, hiddenOf(t, out), c.body)
		assert.Equal(t, c.bar, out["showHealthBar"], c.body)
		assert.Equal(t, c.widget, out["showWidgets"], c.body)
		_, me := getMeRaw(t, env.URL, "non-admin-session")
		assert.Equal(t, c.want, hiddenOf(t, me), c.body)
	}
	_, admin := getMeRaw(t, env.URL, "admin-session")
	assert.Equal(t, []string{}, hiddenOf(t, admin), "another person's list is untouched")
}

// AC-007 — every bad list is a 400 and writes nothing, including a theme
// sent with it.
func TestHiddenWidgets_PatchRejectsBadLists(t *testing.T) {
	env := testsupport.NewEnv(t)
	code, _, _ := patchMeRaw(t, env.URL, "non-admin-session", `{"hiddenWidgets":["clock"]}`)
	require.Equal(t, http.StatusOK, code)

	for name, body := range map[string]string{
		"unknown key":     `{"hiddenWidgets":["clock","pihole"],"themePref":"dark"}`,
		"duplicate":       `{"hiddenWidgets":["weather","weather"],"themePref":"dark"}`,
		"non-string":      `{"hiddenWidgets":["weather",3],"themePref":"dark"}`,
		"non-array":       `{"hiddenWidgets":"weather","themePref":"dark"}`,
		"object":          `{"hiddenWidgets":{"weather":true},"themePref":"dark"}`,
		"null":            `{"hiddenWidgets":null,"themePref":"dark"}`,
		"more than 16":    `{"hiddenWidgets":["clock","clock","clock","clock","clock","clock","clock","clock","clock","clock","clock","clock","clock","clock","clock","clock","clock"]}`,
		"empty-string":    `{"hiddenWidgets":[""],"themePref":"dark"}`,
		"wrong case":      `{"hiddenWidgets":["Clock"],"themePref":"dark"}`,
		"list and old":    `{"hiddenWidgets":["weather"],"showHealthBar":false}`,
		"list and widget": `{"hiddenWidgets":[],"showWidgets":true}`,
	} {
		code, _, _ := patchMeRaw(t, env.URL, "non-admin-session", body)
		assert.Equal(t, http.StatusBadRequest, code, name)
	}
	_, me := getMeRaw(t, env.URL, "non-admin-session")
	assert.Equal(t, []string{"clock"}, hiddenOf(t, me), "nothing was written")
	assert.Equal(t, "system", me["themePref"], "nothing was written")
}

// AC-008 — the old fields still work for adults, change the list as §4.3
// says, and carry the Warning: 299 header.
func TestHiddenWidgets_OldFieldsStillWork(t *testing.T) {
	env := testsupport.NewEnv(t)
	code, _, _ := patchMeRaw(t, env.URL, "non-admin-session", `{"hiddenWidgets":["health"]}`)
	require.Equal(t, http.StatusOK, code)

	code, h, out := patchMeRaw(t, env.URL, "non-admin-session", `{"showHealthBar":false}`)
	require.Equal(t, http.StatusOK, code)
	assert.Equal(t, legacyWarning, h.Get("Warning"))
	assert.Equal(t, []string{"health", "healthDetails"}, hiddenOf(t, out))
	assert.Equal(t, false, out["showHealthBar"])

	code, h, out = patchMeRaw(t, env.URL, "non-admin-session", `{"showWidgets":false,"themePref":"dark"}`)
	require.Equal(t, http.StatusOK, code)
	assert.Equal(t, legacyWarning, h.Get("Warning"))
	assert.Equal(t, []string{"clock", "weather", "health", "healthDetails", "tiles"}, hiddenOf(t, out))
	assert.Equal(t, false, out["showWidgets"])
	assert.Equal(t, "dark", out["themePref"])

	code, h, out = patchMeRaw(t, env.URL, "non-admin-session", `{"showWidgets":true,"showHealthBar":true}`)
	require.Equal(t, http.StatusOK, code)
	assert.Equal(t, legacyWarning, h.Get("Warning"))
	assert.Equal(t, []string{"health"}, hiddenOf(t, out), "the old switch on shows all three; health stays hidden")

	code, h, _ = patchMeRaw(t, env.URL, "non-admin-session", `{"themePref":"light"}`)
	require.Equal(t, http.StatusOK, code)
	assert.Empty(t, h.Get("Warning"), "no old field, no warning")
}

// AC-009 — a kid's PATCH with hiddenWidgets, alone or with themePref, is a
// 403 and writes nothing.
func TestHiddenWidgets_KidsCannotChangeTheList(t *testing.T) {
	env := testsupport.NewEnv(t)
	kidID, kidTok := env.SeedKid(t, "Ava")
	for _, body := range []string{
		`{"hiddenWidgets":[]}`,
		`{"hiddenWidgets":[],"themePref":"dark"}`,
	} {
		code, _, _ := patchMeRaw(t, env.URL, kidTok, body)
		assert.Equal(t, http.StatusForbidden, code, body)
	}
	kid, err := env.Store.UserByID(context.Background(), kidID)
	require.NoError(t, err)
	assert.Equal(t, []string{"health"}, kid.HiddenWidgets)
	assert.Equal(t, "system", kid.ThemePref)
}
