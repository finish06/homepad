package storage_test

import (
	"os"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/finish06/homepad/api/internal/storage"
)

// SPEC-admin-server-settings §3 — migration 0024_server_settings and the
// storage half of server settings saved in the UI.

const mig0024 = "0024_server_settings.up.sql"

// AC-001 — 0024 creates the table, is idempotent, and has a down file that
// drops it.
func TestMigration0024_CreatesTableIdempotentWithDown(t *testing.T) {
	ctx, conn, store := freshStore(t, "homepad_mig0024_create_test")
	_, err := store.MigrateReport(ctx)
	require.NoError(t, err)
	assert.Contains(t, embeddedMigrations(t), mig0024)
	require.True(t, tableExists(t, ctx, conn, "server_settings"))

	v := "https://status.example.com"
	require.NoError(t, store.ApplyServerSettings(ctx, "", storage.ServerSettingsChange{
		Upserts: []storage.ServerSettingRow{{Key: "GATUS_BASE_URL", Value: &v}},
	}))
	rerunMigration(t, ctx, store, mig0024)
	rerunMigration(t, ctx, store, mig0024)
	rows, err := store.ServerSettings(ctx)
	require.NoError(t, err)
	require.Len(t, rows, 1, "a re-run keeps saved values")

	down, err := os.ReadFile("../../migrations/0024_server_settings.down.sql")
	require.NoError(t, err, "0024 has a down file")
	_, err = conn.Exec(ctx, string(down))
	require.NoError(t, err)
	assert.False(t, tableExists(t, ctx, conn, "server_settings"))
}

// StoredKeysFromCheck reads the key CHECK of server_settings out of the
// migration file, for the AC-002 comparison in the api package.
func checkKeys(t *testing.T) []string {
	t.Helper()
	b, err := os.ReadFile("../../migrations/" + mig0024)
	require.NoError(t, err)
	m := regexp.MustCompile(`(?s)key IN \((.*?)\)\)`).FindStringSubmatch(string(b))
	require.Len(t, m, 2)
	var keys []string
	for _, q := range regexp.MustCompile(`'([A-Z_]+)'`).FindAllStringSubmatch(m[1], -1) {
		keys = append(keys, q[1])
	}
	sort.Strings(keys)
	return keys
}

// AC-002 — the CHECK in the database refuses a key that isn't listed, and
// lists exactly the keys of the migration (the api package compares the
// migration with the Go allowlist).
func TestServerSettings_CheckRefusesUnknownKeys(t *testing.T) {
	store, ctx := openStore(t)
	conn := rawConn(t, ctx)
	for _, k := range []string{"PORT", "DATABASE_URL", "HOMEPAD_SECRET_KEY", "GATUS_DEGRADED_MS", "NOPE"} {
		_, err := conn.Exec(ctx, `INSERT INTO server_settings (key, value) VALUES ($1, 'x')`, k)
		assert.Error(t, err, k)
	}
	var def string
	require.NoError(t, conn.QueryRow(ctx, `SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c
		WHERE c.conrelid = 'server_settings'::regclass AND pg_get_constraintdef(c.oid) LIKE '%COOKIE_SECURE%'`).Scan(&def))
	for _, k := range checkKeys(t) {
		assert.True(t, strings.Contains(def, "'"+k+"'"), k)
	}
	_ = store
}

// §3.2 — only the secret is sealed, and it has no plain value.
func TestServerSettings_SecretShapeCheck(t *testing.T) {
	_, ctx := openStore(t)
	conn := rawConn(t, ctx)
	_, err := conn.Exec(ctx, `INSERT INTO server_settings (key, value) VALUES ('OIDC_CLIENT_SECRET', 'plain')`)
	assert.Error(t, err, "a plain secret is refused")
	_, err = conn.Exec(ctx, `INSERT INTO server_settings (key, value, sealed, nonce) VALUES ('OIDC_ISSUER', NULL, '\x01', '\x02')`)
	assert.Error(t, err, "a sealed non-secret is refused")
}

// AC-005, AC-028 — upsert, delete and the degraded threshold go in one
// transaction; rows carry who saved them; removing that admin keeps the row.
func TestServerSettings_ApplyAndRead(t *testing.T) {
	store, ctx := openStore(t)
	conn := rawConn(t, ctx)
	_, err := conn.Exec(ctx, `DELETE FROM server_settings`)
	require.NoError(t, err)
	admin := seedStoreAdmin(t, store, ctx)

	a, b := "open", "5"
	ms := 2500
	require.NoError(t, store.ApplyServerSettings(ctx, admin, storage.ServerSettingsChange{
		Upserts: []storage.ServerSettingRow{
			{Key: "HOMEPAD_REGISTRATION", Value: &a},
			{Key: "HOMEPAD_MAX_ACCOUNTS", Value: &b},
			{Key: "OIDC_CLIENT_SECRET", Sealed: []byte{1, 2, 3}, Nonce: []byte{4, 5}},
		},
		Degraded: &storage.DegradedChange{Ms: &ms},
	}))
	rows, err := store.ServerSettings(ctx)
	require.NoError(t, err)
	require.Len(t, rows, 3)
	byKey := map[string]storage.ServerSettingRow{}
	for _, r := range rows {
		byKey[r.Key] = r
	}
	assert.Equal(t, "open", *byKey["HOMEPAD_REGISTRATION"].Value)
	assert.Equal(t, admin, byKey["HOMEPAD_REGISTRATION"].UpdatedBy)
	assert.NotEmpty(t, byKey["HOMEPAD_REGISTRATION"].UpdatedByName)
	assert.False(t, byKey["HOMEPAD_REGISTRATION"].UpdatedAt.IsZero())
	assert.Nil(t, byKey["OIDC_CLIENT_SECRET"].Value)
	assert.Equal(t, []byte{1, 2, 3}, byKey["OIDC_CLIENT_SECRET"].Sealed)
	cfg, err := store.SystemSettings(ctx)
	require.NoError(t, err)
	require.NotNil(t, cfg.StatusDegradedMs)
	assert.Equal(t, 2500, *cfg.StatusDegradedMs)

	// A failing write rolls back the whole change.
	bad := "x"
	err = store.ApplyServerSettings(ctx, admin, storage.ServerSettingsChange{
		Upserts: []storage.ServerSettingRow{{Key: "GATUS_BASE_URL", Value: &bad}, {Key: "NOPE", Value: &bad}},
		Deletes: []string{"HOMEPAD_REGISTRATION"},
	})
	assert.Error(t, err)
	rows, _ = store.ServerSettings(ctx)
	assert.Len(t, rows, 3, "nothing from a failed change is kept")

	// Reset: delete the row; the threshold goes back to NULL.
	require.NoError(t, store.ApplyServerSettings(ctx, admin, storage.ServerSettingsChange{
		Deletes: []string{"HOMEPAD_REGISTRATION"}, Degraded: &storage.DegradedChange{Ms: nil},
	}))
	rows, _ = store.ServerSettings(ctx)
	assert.Len(t, rows, 2)
	cfg, _ = store.SystemSettings(ctx)
	assert.Nil(t, cfg.StatusDegradedMs)

	_, err = conn.Exec(ctx, `DELETE FROM users WHERE id = $1`, admin)
	require.NoError(t, err)
	rows, _ = store.ServerSettings(ctx)
	require.Len(t, rows, 2)
	assert.Empty(t, rows[0].UpdatedBy, "the saver's removal keeps the value")
}

// §2.5 (Q2 A) — whether any admin can sign in with a local password.
func TestServerSettings_AdminHasLocalPassword(t *testing.T) {
	store, ctx := openStore(t)
	conn := rawConn(t, ctx)
	_, err := conn.Exec(ctx, `TRUNCATE users CASCADE`)
	require.NoError(t, err)
	ok, err := store.AdminHasLocalPassword(ctx)
	require.NoError(t, err)
	assert.False(t, ok)
	_, err = store.CreateUser(ctx, "sso-admin@example.com", "oidc:no-local-password", "admin")
	require.NoError(t, err)
	_, err = store.CreateUser(ctx, "member@example.com", "$2a$10$abc", "user")
	require.NoError(t, err)
	ok, _ = store.AdminHasLocalPassword(ctx)
	assert.False(t, ok, "an SSO-only admin and a member with a password don't count")
	_, err = store.CreateUser(ctx, "admin@example.com", "$2a$10$abc", "admin")
	require.NoError(t, err)
	ok, _ = store.AdminHasLocalPassword(ctx)
	assert.True(t, ok)
}
