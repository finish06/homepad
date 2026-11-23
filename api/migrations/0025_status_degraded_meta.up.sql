-- 0025_status_degraded_meta.up.sql — SPEC-admin-server-settings AC-007.
-- The "Slow" threshold (GATUS_DEGRADED_MS) is saved in
-- system_settings.status_degraded_ms (migration 0014), not server_settings,
-- so it had no record of who saved it or when. These columns add that.
-- NULL by = the saver is unknown or that account is gone.
--
-- A value already saved before this migration keeps working unchanged. Its
-- saver was never recorded, so by stays NULL; its time is taken from the
-- row's updated_at, the best record there is.
ALTER TABLE system_settings
    ADD COLUMN IF NOT EXISTS status_degraded_updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS status_degraded_updated_at TIMESTAMPTZ;

UPDATE system_settings
   SET status_degraded_updated_at = updated_at
 WHERE status_degraded_ms IS NOT NULL AND status_degraded_updated_at IS NULL;
