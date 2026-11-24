package api_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/finish06/homepad/api/internal/testsupport"
)

// SPEC-decisions-18.4.0 §2 (#599) — the API calls the member role "member".
// The database keeps "user"; the API maps it at the edge. "user" is still
// taken as input until 19.0.0, with a Warning header.

func roleOf(t *testing.T, body []byte) string {
	t.Helper()
	var v struct {
		Role string `json:"role"`
	}
	require.NoError(t, json.Unmarshal(body, &v), string(body))
	return v.Role
}

// AC-001 — /api/me and the accept-invite response.
func TestRoleMember_MeAndAccept(t *testing.T) {
	env := inviteEnv(t)

	code, me := getMeRaw(t, env.URL, "non-admin-session")
	require.Equal(t, http.StatusOK, code)
	assert.Equal(t, "member", me["role"])
	_, me = getMeRaw(t, env.URL, "admin-session")
	assert.Equal(t, "admin", me["role"], "admin is unchanged")

	inv := mustInvite(t, env, "Pat", "member")
	r, b := acceptInvite(t, env, acceptBody(inv.Token, "pat@example.com"))
	require.Equal(t, http.StatusCreated, r.StatusCode, string(b))
	assert.Equal(t, "member", roleOf(t, b))
}

// AC-002 — the accounts list and the role PATCH.
func TestRoleMember_Accounts(t *testing.T) {
	env := testsupport.NewEnv(t)

	rows, _ := listAccounts(t, env)
	found := false
	for _, a := range rows {
		if a.ID == env.UserID {
			found = true
			assert.Equal(t, "member", a.Role)
		}
		assert.NotEqual(t, "user", a.Role)
	}
	require.True(t, found)

	code, b := patchRole(t, env, "admin-session", env.UserID, map[string]any{"role": "admin"})
	require.Equal(t, http.StatusOK, code, string(b))
	code, b = patchRole(t, env, "admin-session", env.UserID, map[string]any{"role": "member"})
	require.Equal(t, http.StatusOK, code, string(b))
	assert.Equal(t, "member", roleOf(t, b))
	assert.Equal(t, "user", roleIn(t, env, env.UserID), "AC-005: the database keeps user")
}

// AC-003 — invite create, list and lookup.
func TestRoleMember_Invites(t *testing.T) {
	env := inviteEnv(t)

	inv := mustInvite(t, env, "Sam", "member")
	assert.Equal(t, "member", inv.Role)

	code, list, b := listInvites(t, env, "admin-session")
	require.Equal(t, http.StatusOK, code, string(b))
	require.Len(t, list, 1)
	assert.Equal(t, "member", list[0].Role)

	code, b = lookupInvite(t, env, inv.Token)
	require.Equal(t, http.StatusOK, code, string(b))
	assert.Equal(t, "member", roleOf(t, b))

	stored := dbCount(t, env, `SELECT count(*) FROM invites WHERE id = $1 AND role = 'user'`, inv.ID)
	assert.Equal(t, 1, stored, "AC-005: the database keeps user")
}

// AC-004 — "user" is a deprecated alias; anything else is 400.
func TestRoleMember_UserIsDeprecatedAlias(t *testing.T) {
	env := inviteEnv(t)

	r := doJSON(t, http.MethodPost, env.URL+"/api/admin/invites", "admin-session", map[string]any{"name": "Old", "role": "user"})
	b := readAll(t, r)
	require.Equal(t, http.StatusCreated, r.StatusCode, string(b))
	assert.Equal(t, "member", roleOf(t, b))
	assert.Contains(t, r.Header.Get("Warning"), "deprecated")
	assert.Contains(t, r.Header.Get("Warning"), "19.0.0")

	r = doJSON(t, http.MethodPost, env.URL+"/api/admin/invites", "admin-session", map[string]any{"name": "New", "role": "member"})
	readAll(t, r)
	require.Equal(t, http.StatusCreated, r.StatusCode)
	assert.Empty(t, r.Header.Get("Warning"), "member carries no warning")

	r = doJSON(t, http.MethodPatch, accountPath(env, env.UserID), "admin-session", map[string]any{"role": "user"})
	b = readAll(t, r)
	require.Equal(t, http.StatusOK, r.StatusCode, string(b))
	assert.Equal(t, "member", roleOf(t, b))
	assert.Contains(t, r.Header.Get("Warning"), "deprecated")

	for _, bad := range []string{"kid", "owner", "", "Member", "USER"} {
		code, _, b := createInvite(t, env, "admin-session", map[string]any{"name": "X", "role": bad})
		assert.Equal(t, http.StatusBadRequest, code, bad)
		assert.Equal(t, `role must be "admin" or "member"`, strings.TrimSpace(string(b)), bad)
		code, b = patchRole(t, env, "admin-session", env.UserID, map[string]any{"role": bad})
		assert.Equal(t, http.StatusBadRequest, code, bad)
		assert.Equal(t, `role must be "admin" or "member"`, strings.TrimSpace(string(b)), bad)
	}
}

// AC-006 — a backup holds no role, so the rename cannot break a restore.
func TestRoleMember_BackupHoldsNoRole(t *testing.T) {
	env := testsupport.NewEnv(t)
	resp, b := getExport(t, env.URL, "admin-session", "?people=true")
	require.Equal(t, http.StatusOK, resp.StatusCode, string(b))
	assert.Contains(t, string(b), `"people"`)
	assert.NotContains(t, string(b), `"role"`)
}
