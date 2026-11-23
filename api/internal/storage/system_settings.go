package storage

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// SystemSettings is the global, admin-controlled configuration singleton
// (migration 0010). Today it holds one field — the app-grid uptime-display
// toggle — but the singleton-row shape lets future settings add columns rather
// than tables. A missing row is treated as all-defaults, so a fresh install
// needs no seed data to preserve existing behavior (SPEC cap6 §6, D7).
type SystemSettings struct {
	ShowUptimeDisplay bool
	// StatusDegradedMs is the admin-set "Slow" threshold (migration 0014); nil
	// means "not set in the UI" — the server default / GATUS_DEGRADED_MS applies.
	StatusDegradedMs *int
	// StatusDegradedUpdatedBy is who saved StatusDegradedMs ("" = unknown or
	// gone; migration 0025). On a write it is the saver, recorded only when
	// the value changes. StatusDegradedUpdatedByName and
	// StatusDegradedUpdatedAt are read-only: the saver's display name (else
	// email) and when it was saved; nil when nothing is saved.
	StatusDegradedUpdatedBy     string
	StatusDegradedUpdatedByName string
	StatusDegradedUpdatedAt     *time.Time
}

// degradedMetaSet is the ON CONFLICT tail that records who saved
// status_degraded_ms and when. It keeps the old record when the value
// doesn't change. The INSERT must give those columns degradedMetaValues.
const degradedMetaSet = `
		       status_degraded_updated_by = CASE WHEN system_settings.status_degraded_ms IS NOT DISTINCT FROM EXCLUDED.status_degraded_ms
		         THEN system_settings.status_degraded_updated_by ELSE EXCLUDED.status_degraded_updated_by END,
		       status_degraded_updated_at = CASE WHEN system_settings.status_degraded_ms IS NOT DISTINCT FROM EXCLUDED.status_degraded_ms
		         THEN system_settings.status_degraded_updated_at ELSE EXCLUDED.status_degraded_updated_at END`

// degradedMetaValues is the INSERT side, for the placeholders holding the
// new value (ms) and the saver (by): no value saved, no record.
func degradedMetaValues(ms, by string) string {
	return `CASE WHEN ` + ms + `::int IS NULL THEN NULL ELSE ` + by + `::uuid END,
		         CASE WHEN ` + ms + `::int IS NULL THEN NULL ELSE now() END`
}

// uuidOrNil turns "" into SQL NULL.
func uuidOrNil(id string) *string {
	if id == "" {
		return nil
	}
	return &id
}

// defaultSystemSettings is the safe-from-absent config: everything ON. Returned
// whenever no system_settings row exists (AC-008).
func defaultSystemSettings() SystemSettings {
	return SystemSettings{ShowUptimeDisplay: true}
}

// SystemSettings reads the singleton settings row (id = 1). When no row exists
// it returns the defaults (ShowUptimeDisplay = true) with a nil error — never
// ErrNotFound — so the caller can always serve a coherent config (AC-008).
func (s *Store) SystemSettings(ctx context.Context) (SystemSettings, error) {
	cfg := defaultSystemSettings()
	err := s.pool.QueryRow(ctx,
		`SELECT ss.show_uptime_display, ss.status_degraded_ms,
		        COALESCE(ss.status_degraded_updated_by::text, ''),
		        COALESCE(NULLIF(u.display_name, ''), u.email, ''), ss.status_degraded_updated_at
		   FROM system_settings ss LEFT JOIN users u ON u.id = ss.status_degraded_updated_by
		  WHERE ss.id = 1`).
		Scan(&cfg.ShowUptimeDisplay, &cfg.StatusDegradedMs,
			&cfg.StatusDegradedUpdatedBy, &cfg.StatusDegradedUpdatedByName, &cfg.StatusDegradedUpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return defaultSystemSettings(), nil
	}
	if err != nil {
		return SystemSettings{}, err
	}
	return cfg, nil
}

// UpsertSystemSettings writes the singleton row (id = 1) with the given values
// and returns the persisted state. It is a full upsert of the row's columns; the
// handler layer merges a partial PATCH over the current values before calling
// this, so an omitted field keeps its prior value (SPEC cap6 §7, D5).
func (s *Store) UpsertSystemSettings(ctx context.Context, in SystemSettings) (SystemSettings, error) {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO system_settings (id, show_uptime_display, status_degraded_ms,
		   status_degraded_updated_by, status_degraded_updated_at, updated_at)
		 VALUES (1, $1, $2, `+degradedMetaValues("$2", "$3")+`, now())
		 ON CONFLICT (id) DO UPDATE
		   SET show_uptime_display = EXCLUDED.show_uptime_display,
		       status_degraded_ms = EXCLUDED.status_degraded_ms,
		       updated_at = now(),`+degradedMetaSet,
		in.ShowUptimeDisplay, in.StatusDegradedMs, uuidOrNil(in.StatusDegradedUpdatedBy))
	if err != nil {
		return SystemSettings{}, err
	}
	return s.SystemSettings(ctx)
}
