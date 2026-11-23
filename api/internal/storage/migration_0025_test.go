package storage_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// SPEC-admin-server-settings AC-007 — migration 0025_status_degraded_meta
// adds who saved the "Slow" threshold and when. A threshold saved before it
// keeps its value; its time comes from the row, its saver stays unknown.

const mig0025 = "0025_status_degraded_meta.up.sql"

func TestMigration0025_KeepsASavedThreshold(t *testing.T) {
	ctx, conn, store := freshStore(t, "homepad_mig0025_saved_test")
	applyMigrations(t, ctx, conn, "0025") // what 18.0.x leaves behind
	_, err := conn.Exec(ctx, `INSERT INTO system_settings (id, show_uptime_display, status_degraded_ms, updated_at)
		VALUES (1, FALSE, 1500, '2026-10-01T12:00:00Z')`)
	require.NoError(t, err)

	rep, err := store.MigrateReport(ctx)
	require.NoError(t, err)
	assert.Contains(t, rep.Applied, mig0025)

	got, err := store.SystemSettings(ctx)
	require.NoError(t, err)
	require.NotNil(t, got.StatusDegradedMs)
	assert.Equal(t, 1500, *got.StatusDegradedMs, "the saved value survives")
	assert.False(t, got.ShowUptimeDisplay)
	require.NotNil(t, got.StatusDegradedUpdatedAt)
	assert.Equal(t, "2026-10-01T12:00:00Z", got.StatusDegradedUpdatedAt.UTC().Format("2006-01-02T15:04:05Z07:00"))
	assert.Empty(t, got.StatusDegradedUpdatedBy, "the saver was never recorded")

	again, err := store.MigrateReport(ctx)
	require.NoError(t, err)
	assert.Empty(t, again.Applied)
}

func TestMigration0025_NoThresholdNoRecord(t *testing.T) {
	ctx, conn, store := freshStore(t, "homepad_mig0025_unset_test")
	applyMigrations(t, ctx, conn, "0025")
	_, err := conn.Exec(ctx, `INSERT INTO system_settings (id, show_uptime_display) VALUES (1, TRUE)`)
	require.NoError(t, err)
	_, err = store.MigrateReport(ctx)
	require.NoError(t, err)

	got, err := store.SystemSettings(ctx)
	require.NoError(t, err)
	assert.Nil(t, got.StatusDegradedMs)
	assert.Nil(t, got.StatusDegradedUpdatedAt)
	assert.Equal(t, []string{"NULL|NULL"}, rowsOf(t, ctx, conn,
		`SELECT status_degraded_updated_by, status_degraded_updated_at FROM system_settings`))
}
