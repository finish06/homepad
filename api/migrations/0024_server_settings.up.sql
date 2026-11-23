-- 0024_server_settings.up.sql — SPEC-admin-server-settings §3.
-- One row per server setting saved in the UI. No row = not set in the UI:
-- the env var, then the built-in default, applies. Idempotent.
--
-- GATUS_DEGRADED_MS is not here: it stays in system_settings.status_degraded_ms
-- (migration 0014), where backups and GET /api/system/config already read it.
-- PORT is not here either: it can't be saved. The Go allowlist
-- (api.StoredServerSettingKeys) and this CHECK must list the same keys; a
-- test compares them (AC-002).
CREATE TABLE IF NOT EXISTS server_settings (
    key         TEXT PRIMARY KEY CHECK (key IN (
                  'COOKIE_SECURE', 'HOMEPAD_TRUSTED_PROXIES',
                  'GATUS_BASE_URL',
                  'HOMEPAD_REGISTRATION', 'HOMEPAD_MAX_ACCOUNTS',
                  'OIDC_ENABLED', 'OIDC_ISSUER', 'OIDC_DISCOVERY_URL',
                  'OIDC_REDIRECT_URL', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET',
                  'OIDC_ADMIN_GROUP', 'OIDC_MEMBER_GROUP')),
    value       TEXT,           -- NULL only for OIDC_CLIENT_SECRET
    sealed      BYTEA,          -- OIDC_CLIENT_SECRET only (Q1 A)
    nonce       BYTEA,
    updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((key = 'OIDC_CLIENT_SECRET') = (sealed IS NOT NULL AND value IS NULL))
);
