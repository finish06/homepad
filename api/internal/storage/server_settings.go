package storage

import (
	"context"
	"fmt"
	"time"
)

// SPEC-admin-server-settings §3 — server settings saved in the UI. One row
// per key in server_settings (migration 0024); no row means "not set in the
// UI". The "Slow" threshold (GATUS_DEGRADED_MS) stays in
// system_settings.status_degraded_ms, with its saver and time beside it
// (migration 0025), and a change writes both in one transaction.

// ServerSettingRow is one saved server setting. Value is nil only for
// OIDC_CLIENT_SECRET, which is Sealed with Nonce instead.
type ServerSettingRow struct {
	Key    string
	Value  *string
	Sealed []byte
	Nonce  []byte
	// UpdatedBy is the admin who saved it ("" once that account is gone);
	// UpdatedByName is their display name, else their email.
	UpdatedBy     string
	UpdatedByName string
	UpdatedAt     time.Time
}

// DegradedChange sets system_settings.status_degraded_ms; Ms nil is NULL
// (use GATUS_DEGRADED_MS, else the default).
type DegradedChange struct{ Ms *int }

// ServerSettingsChange is one save or reset: every part commits together or
// not at all (AC-008).
type ServerSettingsChange struct {
	Upserts  []ServerSettingRow
	Deletes  []string
	Degraded *DegradedChange
}

// ServerSettings reads every saved server setting, in key order.
func (s *Store) ServerSettings(ctx context.Context) ([]ServerSettingRow, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT ss.key, ss.value, ss.sealed, ss.nonce, COALESCE(ss.updated_by::text, ''),
		        COALESCE(NULLIF(u.display_name, ''), u.email, ''), ss.updated_at
		   FROM server_settings ss LEFT JOIN users u ON u.id = ss.updated_by
		  ORDER BY ss.key`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ServerSettingRow
	for rows.Next() {
		var r ServerSettingRow
		if err := rows.Scan(&r.Key, &r.Value, &r.Sealed, &r.Nonce, &r.UpdatedBy, &r.UpdatedByName, &r.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// ApplyServerSettings writes ch in one transaction, as actorID ("" for no
// actor). A key the table's CHECK refuses fails the whole change.
func (s *Store) ApplyServerSettings(ctx context.Context, actorID string, ch ServerSettingsChange) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var actor *string
	if actorID != "" {
		actor = &actorID
	}
	for _, r := range ch.Upserts {
		if _, err := tx.Exec(ctx,
			`INSERT INTO server_settings (key, value, sealed, nonce, updated_by, updated_at)
			 VALUES ($1, $2, $3, $4, $5, now())
			 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, sealed = EXCLUDED.sealed,
			   nonce = EXCLUDED.nonce, updated_by = EXCLUDED.updated_by, updated_at = now()`,
			r.Key, r.Value, r.Sealed, r.Nonce, actor); err != nil {
			return fmt.Errorf("storage: save %s: %w", r.Key, err)
		}
	}
	for _, k := range ch.Deletes {
		if _, err := tx.Exec(ctx, `DELETE FROM server_settings WHERE key = $1`, k); err != nil {
			return fmt.Errorf("storage: reset %s: %w", k, err)
		}
	}
	if ch.Degraded != nil {
		if _, err := tx.Exec(ctx,
			`INSERT INTO system_settings (id, status_degraded_ms,
			   status_degraded_updated_by, status_degraded_updated_at, updated_at)
			 VALUES (1, $1, `+degradedMetaValues("$1", "$2")+`, now())
			 ON CONFLICT (id) DO UPDATE SET status_degraded_ms = EXCLUDED.status_degraded_ms,
			   updated_at = now(),`+degradedMetaSet,
			ch.Degraded.Ms, actor); err != nil {
			return fmt.Errorf("storage: save status_degraded_ms: %w", err)
		}
	}
	return tx.Commit(ctx)
}

// AdminHasLocalPassword reports whether any admin can sign in with a local
// password (SPEC-admin-server-settings Q2 A): then a single sign-on change
// can't lock everyone out.
func (s *Store) AdminHasLocalPassword(ctx context.Context) (bool, error) {
	var ok bool
	err := s.pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM users u WHERE u.role = 'admin' AND `+hasLocalPasswordSQL+`)`).Scan(&ok)
	return ok, err
}

// AccountCounts splits CountAccounts: accounts (kids included) and pending,
// unexpired invites, for the account-limit warning (§2.5).
func (s *Store) AccountCounts(ctx context.Context) (accounts, invites int, err error) {
	err = s.pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM users),
		(SELECT count(*) FROM invites WHERE used_at IS NULL AND revoked_at IS NULL AND expires_at > now())`).
		Scan(&accounts, &invites)
	return accounts, invites, err
}
