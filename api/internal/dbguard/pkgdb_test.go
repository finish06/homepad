package dbguard

import (
	"context"
	"net/url"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
)

// #730 — every test package gets its own database, so `go test ./...` at the
// default -p does not share tables between packages.

func TestPackageDatabaseName(t *testing.T) {
	cases := []struct{ base, pkg, want string }{
		{"homepad_test", "internal/api", "homepad_internal_api_test"},
		{"homepad_test", "internal/storage", "homepad_internal_storage_test"},
		{"homepad_test", "cmd/homepad-api", "homepad_cmd_homepad_api_test"},
		{"homepad_test", ".", "homepad_root_test"},
		{"ci_test", "internal/session", "ci_internal_session_test"},
	}
	for _, c := range cases {
		if got := PackageDatabaseName(c.base, c.pkg); got != c.want {
			t.Errorf("PackageDatabaseName(%q, %q) = %q; want %q", c.base, c.pkg, got, c.want)
		}
	}
	// Two packages never share a name, and every name passes the guard.
	if PackageDatabaseName("homepad_test", "internal/api") == PackageDatabaseName("homepad_test", "internal/storage") {
		t.Error("two packages got the same database")
	}
	long := PackageDatabaseName("homepad_test", strings.Repeat("very/long/package/", 8))
	if len(long) > maxIdent {
		t.Errorf("name %q is %d bytes; Postgres allows %d", long, len(long), maxIdent)
	}
	other := PackageDatabaseName("homepad_test", strings.Repeat("very/long/package/", 8)+"x")
	if long == other {
		t.Errorf("two long package paths collided on %q", long)
	}
	for _, n := range []string{long, PackageDatabaseName("homepad_test", "internal/api")} {
		if err := CheckTestDatabaseName(n); err != nil {
			t.Errorf("derived name %q fails the guard: %v", n, err)
		}
	}
}

func TestTestPackagePath(t *testing.T) {
	got, err := testPackagePath()
	if err != nil {
		t.Fatal(err)
	}
	if got != "internal/dbguard" {
		t.Errorf("testPackagePath() = %q; want internal/dbguard", got)
	}
}

// RequireTestDatabase returns this package's own marked database, not
// DATABASE_URL, and the same one on every call.
func TestRequireTestDatabase_ReturnsThePackagesOwnDatabase(t *testing.T) {
	base := os.Getenv("DATABASE_URL")
	if base == "" {
		t.Skip("DATABASE_URL not set — skipping Postgres-backed guard test")
	}
	own := RequireTestDatabase(t)
	if own == base {
		t.Fatal("RequireTestDatabase returned DATABASE_URL itself; packages would share tables (#730)")
	}
	if again := RequireTestDatabase(t); again != own {
		t.Errorf("second call returned %q; want %q", again, own)
	}
	bu, _ := url.Parse(base)
	ou, _ := url.Parse(own)
	if ou.Host != bu.Host || ou.User.String() != bu.User.String() || ou.RawQuery != bu.RawQuery {
		t.Errorf("own DSN %q should differ from %q only in the database", own, base)
	}
	want := PackageDatabaseName(strings.TrimPrefix(bu.Path, "/"), "internal/dbguard")
	ctx := context.Background()
	c, err := pgx.Connect(ctx, own)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer c.Close(ctx)
	var name, comment string
	if err := c.QueryRow(ctx, `SELECT current_database(), COALESCE(shobj_description(d.oid, 'pg_database'), '')
		FROM pg_database d WHERE d.datname = current_database()`).Scan(&name, &comment); err != nil {
		t.Fatal(err)
	}
	if name != want || comment != Marker {
		t.Errorf("own database is %q (comment %q); want %q marked %q", name, comment, want, Marker)
	}
}

// RecreateDatabase drops only a database carrying Marker; an unmarked one of
// the same name is refused and left alone.
func TestRecreateDatabase(t *testing.T) {
	base := os.Getenv("DATABASE_URL")
	if base == "" {
		t.Skip("DATABASE_URL not set — skipping Postgres-backed guard test")
	}
	if err := CheckTestDatabase(base); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	admin, err := pgx.Connect(ctx, base)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer admin.Close(ctx)

	if err := RecreateDatabase(ctx, admin, "homepad_pkgdb"); err == nil || !strings.Contains(err.Error(), "not a test database") {
		t.Fatalf("a non-_test name must be refused before any SQL; got %v", err)
	}

	const name = "dbguard_recreate_test"
	dsn := scratchDB(t, name) // unmarked, with a table in it
	exec(t, dsn, "CREATE TABLE users (id int)")
	err = RecreateDatabase(ctx, admin, name)
	if err == nil || !strings.Contains(err.Error(), "not marked") {
		t.Fatalf("an unmarked database must be refused, not dropped; got %v", err)
	}
	var n int
	exec(t, dsn, "SELECT 1 FROM users") // still there
	exec(t, dsn, "COMMENT ON DATABASE "+name+" IS '"+Marker+"'")

	if err := RecreateDatabase(ctx, admin, name); err != nil {
		t.Fatalf("a marked database must be recreated: %v", err)
	}
	c, err := pgx.Connect(ctx, dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer c.Close(ctx)
	if err := c.QueryRow(ctx, `SELECT count(*) FROM pg_tables WHERE schemaname = 'public'`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Errorf("recreated database still has %d tables; want a fresh one", n)
	}
	if err := ConfirmThrowaway(ctx, dsn); err != nil {
		t.Errorf("recreated database must carry Marker: %v", err)
	}
}
