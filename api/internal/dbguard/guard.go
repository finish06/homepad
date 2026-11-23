package dbguard

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

// CheckTestDatabase is the single safety guard protecting every destructive
// integration-test operation in this repo (Migrate, TRUNCATE, DROP DATABASE).
// It returns a non-nil error unless dsn points at a throwaway test database:
//
//   - the DSN host must NOT be the production CNPG cluster
//     (homepad-pg-rw.homepad[.svc…]). This check is independent of the name, so
//     a prod database mislabelled "homepad_test" is still refused.
//   - the database name must end in "_test" or equal "homepad_test".
//
// On 2026-09-13 the integration harness, pointed at the prod DSN from
// homepad-api#59, truncated Caleb's entire Homepad catalog. #67 added this guard
// to internal/testsupport, but internal/storage (and internal/api) reached a
// database WITHOUT it — the gap #72 closes. The guard lives here, in a package
// every destructive test imports, so there is ONE copy that cannot drift. There
// is deliberately NO override env var: a copy-pasteable bypass is exactly how
// the accident happened.
func CheckTestDatabase(dsn string) error {
	u, err := url.Parse(dsn)
	if err != nil {
		return fmt.Errorf("refusing destructive test setup: cannot parse DATABASE_URL: %w", err)
	}
	host := u.Hostname()
	// Hard-refuse the production cluster host, regardless of db name.
	for _, prod := range []string{"homepad-pg-rw.homepad.svc", "homepad-pg-rw.homepad"} {
		if strings.Contains(host, prod) {
			return fmt.Errorf("refusing destructive test setup: DSN host %q is the production cluster (matches %q); integration tests truncate every table and must never run against prod", host, prod)
		}
	}
	// Only a throwaway test database may be migrated/truncated/dropped.
	name := strings.TrimPrefix(u.Path, "/")
	if name == "homepad_test" || strings.HasSuffix(name, "_test") {
		return nil
	}
	return fmt.Errorf("refusing destructive test setup: database %q is not a test database (name must end in \"_test\" or equal \"homepad_test\") — integration tests truncate every table", name)
}

// RequireTestDatabase is the single accessor every destructive integration test
// uses to obtain DATABASE_URL. It skips the test when DATABASE_URL is unset
// (so the unit-only path stays runnable without Postgres), and FATALS — never
// skips (#67 AC2: a skip is how a dangerous run stays invisible) — when the DSN
// is not a throwaway test database, BEFORE the caller can Open, Migrate, or run
// any SQL. Routing every caller through this one function, rather than trusting
// each test to remember a guard, is the point of #72: the 2026-09-13 incident
// recurred because one package reached the database by a path the guard did not
// cover.
func RequireTestDatabase(t testing.TB) string {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set — skipping Postgres-backed integration test (needs Postgres)")
	}
	if err := CheckTestDatabase(dsn); err != nil {
		t.Fatalf("%v", err)
	}
	if err := confirmOnce(dsn); err != nil {
		t.Fatalf("%v", err)
	}
	return dsn
}

// Marker is the comment that marks a database as a throwaway test database.
// ConfirmThrowaway writes it on a fresh database and requires it on any
// database that already holds homepad tables.
const Marker = "homepad-throwaway-test"

// confirmed caches ConfirmThrowaway per DSN for the life of the test binary,
// so the hundreds of tests in one package connect once, not once each.
var confirmed sync.Map // dsn → error (nil = confirmed)

func confirmOnce(dsn string) error {
	if v, ok := confirmed.Load(dsn); ok {
		if v == nil {
			return nil
		}
		return v.(error)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	err := ConfirmThrowaway(ctx, dsn)
	if err == nil {
		confirmed.Store(dsn, nil)
	} else {
		confirmed.Store(dsn, err)
	}
	return err
}

// ConfirmThrowaway checks the server behind dsn, not just the string (#69).
// CheckTestDatabase reads the DSN; a DSN like localhost:5432/homepad_test can
// still reach some other Postgres that holds real data. So, connected:
//
//   - the database the server says we are in must pass the same name rule;
//   - if the database carries Marker as its comment, it is ours;
//   - if it has no homepad tables yet, it is fresh: we write Marker and use it;
//   - otherwise (homepad tables, no marker) it is refused, with the one line
//     of SQL that marks it, for a developer whose test database predates this.
func ConfirmThrowaway(ctx context.Context, dsn string) error {
	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		return fmt.Errorf("refusing destructive test setup: cannot connect to check the database: %w", err)
	}
	defer conn.Close(ctx)

	var name, comment string
	var hasTables bool
	err = conn.QueryRow(ctx, `
		SELECT current_database(),
		       COALESCE(shobj_description(d.oid, 'pg_database'), ''),
		       to_regclass('public.users') IS NOT NULL OR to_regclass('public.schema_migrations') IS NOT NULL
		  FROM pg_database d WHERE d.datname = current_database()`).Scan(&name, &comment, &hasTables)
	if err != nil {
		return fmt.Errorf("refusing destructive test setup: cannot read the database's identity: %w", err)
	}
	if name != "homepad_test" && !strings.HasSuffix(name, "_test") {
		return fmt.Errorf("refusing destructive test setup: the server reports database %q, which is not a test database", name)
	}
	if comment == Marker {
		return nil
	}
	mark := fmt.Sprintf("COMMENT ON DATABASE %s IS '%s'", pgx.Identifier{name}.Sanitize(), Marker)
	if hasTables {
		return fmt.Errorf("refusing destructive test setup: database %q already has homepad tables but is not marked as a throwaway test database. "+
			"If it really is one, mark it once and re-run: %s", name, mark)
	}
	if _, err := conn.Exec(ctx, mark); err != nil {
		return fmt.Errorf("refusing destructive test setup: cannot mark fresh database %q: %w", name, err)
	}
	return nil
}
