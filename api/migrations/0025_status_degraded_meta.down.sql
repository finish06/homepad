-- 0025_status_degraded_meta.down.sql — reverse of 0025_status_degraded_meta.up.sql.
ALTER TABLE system_settings
    DROP COLUMN IF EXISTS status_degraded_updated_at,
    DROP COLUMN IF EXISTS status_degraded_updated_by;
