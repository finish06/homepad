package storage_test

import (
	"fmt"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// SPEC-health-widget §4.2 — migration 0026_hidden_widgets. It adds
// users.hidden_widgets and system_settings.health_enabled, and in the same
// batch copies every show_health_bar / show_widgets choice into the list.

const mig0026 = "0026_hidden_widgets.up.sql"

// AC-001 — both columns exist with the right type, nullability and default.
func TestMigration0026_AddsTheColumns(t *testing.T) {
	ctx, conn, store := freshStore(t, "homepad_mig0026_columns_test")
	_, err := store.MigrateReport(ctx)
	require.NoError(t, err)
	assert.Contains(t, embeddedMigrations(t), mig0026)

	assert.Equal(t, []string{"ARRAY|NO|'{}'::text[]"}, rowsOf(t, ctx, conn, `SELECT data_type, is_nullable, column_default
		FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'hidden_widgets'`))
	assert.Equal(t, []string{"boolean|NO|true"}, rowsOf(t, ctx, conn, `SELECT data_type, is_nullable, column_default
		FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'system_settings' AND column_name = 'health_enabled'`))
}

// AC-002 — every role × show_health_bar × show_widgets maps as §4.2 says,
// and a household that had settings keeps health on. A later boot changes
// nothing, and a list changed after the upgrade stays changed.
func TestMigration0026_CopiesEveryChoiceOnce(t *testing.T) {
	ctx, conn, store := freshStore(t, "homepad_mig0026_backfill_test")
	applyMigrations(t, ctx, conn, "0026") // what 18.7's runner leaves behind
	_, err := conn.Exec(ctx, `INSERT INTO system_settings (id, clock_enabled, weather_enabled) VALUES (1, TRUE, FALSE)
		ON CONFLICT (id) DO UPDATE SET clock_enabled = TRUE`)
	require.NoError(t, err)

	want := map[string]string{}
	for _, role := range []string{"admin", "user", "kid"} {
		for _, bar := range []bool{true, false} {
			for _, wid := range []bool{true, false} {
				name := fmt.Sprintf("%s-bar%t-wid%t", role, bar, wid)
				if role == "kid" {
					_, err = conn.Exec(ctx, `INSERT INTO users (email, password_hash, role, display_name, show_health_bar, show_widgets, show_uptime_display)
						VALUES (NULL, NULL, 'kid', $1, $2, $3, TRUE)`, name, bar, wid)
				} else {
					_, err = conn.Exec(ctx, `INSERT INTO users (email, password_hash, role, display_name, show_health_bar, show_widgets, show_uptime_display)
						VALUES ($1, 'h', $2, $3, $4, $5, TRUE)`, name+"@example.com", role, name, bar, wid)
				}
				require.NoError(t, err)
				var list string
				switch {
				case role == "kid" && !bar:
					list = "{health}"
				case role == "kid":
					list = "{}"
				case !bar && !wid:
					list = "{clock,weather,healthDetails,tiles}"
				case !bar:
					list = "{healthDetails}"
				case !wid:
					list = "{clock,weather,tiles}"
				default:
					list = "{}"
				}
				want[name] = list
			}
		}
	}

	rep, err := store.MigrateReport(ctx)
	require.NoError(t, err)
	assert.Contains(t, rep.Applied, mig0026)

	var exp []string
	for name, list := range want {
		exp = append(exp, name+"|"+list)
	}
	q := `SELECT display_name, hidden_widgets::text FROM users`
	assert.ElementsMatch(t, exp, rowsOf(t, ctx, conn, q))
	assert.Equal(t, []string{"true"}, rowsOf(t, ctx, conn, `SELECT health_enabled FROM system_settings`))

	// Someone changes their list after the upgrade; a later boot runs
	// nothing and keeps it.
	_, err = conn.Exec(ctx, `UPDATE users SET hidden_widgets = '{weather}' WHERE display_name = 'user-bartrue-widtrue'`)
	require.NoError(t, err)
	again, err := store.MigrateReport(ctx)
	require.NoError(t, err)
	assert.Empty(t, again.Applied)
	want["user-bartrue-widtrue"] = "{weather}"
	exp = exp[:0]
	for name, list := range want {
		exp = append(exp, name+"|"+list)
	}
	assert.ElementsMatch(t, exp, rowsOf(t, ctx, conn, q))
}

// §4.2 — the backfill runs only in the batch that adds the column. Run again
// on a database that already has it (a lost record), it changes nothing.
func TestMigration0026_ReRunDoesNotBackfillAgain(t *testing.T) {
	ctx, conn, store := freshStore(t, "homepad_mig0026_rerun_test")
	_, err := store.MigrateReport(ctx)
	require.NoError(t, err)
	// An 18.7 tab wrote the old column after the upgrade; the list is the
	// source of truth and a re-run must not "fix" it from the old column.
	_, err = conn.Exec(ctx, `INSERT INTO users (email, password_hash, role, display_name, show_health_bar, show_widgets, hidden_widgets, show_uptime_display)
		VALUES ('rr@example.com', 'h', 'user', 'rr', FALSE, FALSE, '{clock}', TRUE)`)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, `INSERT INTO system_settings (id, health_enabled) VALUES (1, FALSE)
		ON CONFLICT (id) DO UPDATE SET health_enabled = FALSE`)
	require.NoError(t, err)

	rerunMigration(t, ctx, store, mig0026)
	assert.Equal(t, []string{"rr|{clock}"}, rowsOf(t, ctx, conn, `SELECT display_name, hidden_widgets::text FROM users`))
	assert.Equal(t, []string{"false"}, rowsOf(t, ctx, conn, `SELECT health_enabled FROM system_settings`),
		"a re-run keeps the admin's choice")
}

// §4.2 — the down migration drops both columns, and the old columns still
// hold what each person chose.
func TestMigration0026_DownDropsTheColumns(t *testing.T) {
	ctx, conn, store := freshStore(t, "homepad_mig0026_down_test")
	_, err := store.MigrateReport(ctx)
	require.NoError(t, err)
	down, err := os.ReadFile("../../migrations/0026_hidden_widgets.down.sql")
	require.NoError(t, err)
	_, err = conn.Exec(ctx, string(down))
	require.NoError(t, err)
	assert.False(t, columnExists(t, ctx, conn, "users", "hidden_widgets"))
	assert.False(t, columnExists(t, ctx, conn, "system_settings", "health_enabled"))
	assert.True(t, columnExists(t, ctx, conn, "users", "show_health_bar"))
	assert.True(t, columnExists(t, ctx, conn, "users", "show_widgets"))
	_, err = conn.Exec(ctx, string(down))
	require.NoError(t, err, "IF EXISTS: a second run is harmless")
}
