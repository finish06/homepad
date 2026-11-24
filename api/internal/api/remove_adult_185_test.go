package api_test

import (
	"net/http"
	"sort"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// SPEC-qa-cleanup-18.5.0 §2.1 (#591) — what goes with a removed adult.
// DELETE /api/admin/accounts/{id} shipped in 18.0.0; these tests close the
// two gaps #591 asked about: the reset links made for that adult, and a guard
// on every foreign key to users, so a new table can't quietly cascade a
// removal into shared data.

// AC-001 — a live reset link made for an adult dies with the account.
func TestRemoveAdult_TheirResetLinkStopsWorking(t *testing.T) {
	env := resetEnv(t)
	id := seedAdult(t, env, "leaving@example.com")
	link := mustResetLink(t, env, id)
	code, b := lookupReset(t, env, link.Token)
	require.Equal(t, http.StatusOK, code, "the link works before the removal: %s", b)

	code, b = removeAdult(t, env, "admin-session", id)
	require.Equal(t, http.StatusNoContent, code, string(b))

	code, _ = lookupReset(t, env, link.Token)
	assert.Equal(t, http.StatusNotFound, code, "the link is dead after the removal")
	assert.Zero(t, dbCount(t, env, `SELECT count(*) FROM password_resets WHERE user_id = $1`, id),
		"no reset row is left for the removed adult")
}

// AC-002 — every foreign key that points at users, with its delete rule.
// CASCADE is allowed only on rows that belong to that one account. A new key
// or a changed rule fails here: decide what a removal does to it, then update
// this list and SPEC-qa-cleanup-18.5.0 §2.1.
var usersForeignKeys = map[string]string{
	"favorites.user_id":                          "CASCADE",
	"invites.created_by":                         "SET NULL",
	"invites.used_by":                            "SET NULL",
	"kid_allowed_services.user_id":               "CASCADE",
	"password_resets.created_by":                 "SET NULL",
	"password_resets.user_id":                    "CASCADE",
	"server_settings.updated_by":                 "SET NULL",
	"sessions.user_id":                           "CASCADE",
	"system_settings.status_degraded_updated_by": "SET NULL",
	"user_collapsed_categories.user_id":          "CASCADE",
	"user_layout.user_id":                        "CASCADE",
}

func TestRemoveAdult_ForeignKeysToUsers(t *testing.T) {
	env := resetEnv(t)
	// 'users'::regclass resolves through search_path: the schema the API's
	// migrations ran in.
	rows, err := env.Store.Pool().Query(t.Context(), `
		SELECT cl.relname || '.' || a.attname,
		       CASE c.confdeltype WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT'
		                          WHEN 'r' THEN 'RESTRICT' ELSE 'NO ACTION' END
		  FROM pg_constraint c
		  JOIN pg_class cl ON cl.oid = c.conrelid
		  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
		 WHERE c.contype = 'f' AND c.confrelid = 'users'::regclass`)
	require.NoError(t, err)
	defer rows.Close()
	got := map[string]string{}
	for rows.Next() {
		var col, rule string
		require.NoError(t, rows.Scan(&col, &rule))
		got[col] = rule
	}
	require.NoError(t, rows.Err())

	var problems []string
	for col, rule := range got {
		want, ok := usersForeignKeys[col]
		switch {
		case !ok:
			problems = append(problems, col+" is a new foreign key to users ("+rule+")")
		case want != rule:
			problems = append(problems, col+" is ON DELETE "+rule+", expected "+want)
		}
	}
	for col := range usersForeignKeys {
		if _, ok := got[col]; !ok {
			problems = append(problems, col+" is no longer a foreign key to users")
		}
	}
	sort.Strings(problems)
	assert.Empty(t, problems, "what removing an account does to each table changed:\n%s", strings.Join(problems, "\n"))
}
