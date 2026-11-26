package dbguard

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
)

// #730 — one database per test package.
//
// `go test ./...` runs test binaries in parallel (-p defaults to GOMAXPROCS).
// When every package used DATABASE_URL directly they shared one set of tables:
// storage truncated rows that api had just seeded, two TRUNCATE ... CASCADE
// runs deadlocked (SQLSTATE 40P01), and inserts hit foreign keys whose parent
// row another package had wiped. `-p 1` hid it.
//
// Now RequireTestDatabase hands each test binary its own database on the
// DATABASE_URL server, named after the package plus a short hash of the base
// database and package path: homepad_test plus internal/storage gives
// homepad_internal_storage_<hash>_test. It is dropped and created fresh, with
// Marker, the first time the binary asks for it. The hash means two different
// (base, package) pairs never share a name, so the lock below, which lives in
// the base database, always guards the right runs.
//
// The guard rules still hold. DATABASE_URL itself is checked first, by name
// and on the server, exactly as before. The derived name ends in "_test" and
// goes through CheckTestDatabaseName. An existing database of that name is
// dropped only if it carries Marker; otherwise the run stops.
//
// A session advisory lock on the base server, held until the binary exits,
// keeps two runs of the same package (two QA runs sharing one server, say)
// from dropping each other's database. Different packages take different
// locks, so they still run in parallel.

// packageLockWait bounds how long a binary waits for another run of the same
// package to finish with its database.
const packageLockWait = 10 * time.Minute

type packageDB struct {
	dsn string
	err error
}

var (
	packageMu  sync.Mutex
	packageDBs = map[string]packageDB{} // base dsn → result, once per binary
	// lockConns keeps each advisory-lock connection reachable for the life of
	// the binary; the lock is released when the process exits.
	lockConns []*pgx.Conn
)

// packageDatabaseOnce returns the DSN of this binary's own database on the
// base server, creating it on the first call.
func packageDatabaseOnce(base string) (string, error) {
	packageMu.Lock()
	defer packageMu.Unlock()
	p, ok := packageDBs[base]
	if !ok {
		p.dsn, p.err = setUpPackageDatabase(base)
		packageDBs[base] = p
	}
	return p.dsn, p.err
}

func setUpPackageDatabase(base string) (string, error) {
	u, err := url.Parse(base)
	if err != nil {
		return "", fmt.Errorf("refusing destructive test setup: cannot parse DATABASE_URL: %w", err)
	}
	pkg, err := testPackagePath()
	if err != nil {
		return "", fmt.Errorf("refusing destructive test setup: cannot tell which package is testing: %w", err)
	}
	name := PackageDatabaseName(strings.TrimPrefix(u.Path, "/"), pkg)

	ctx, cancel := context.WithTimeout(context.Background(), packageLockWait)
	defer cancel()
	lock, err := pgx.Connect(ctx, base)
	if err != nil {
		return "", fmt.Errorf("refusing destructive test setup: cannot connect to create %s: %w", name, err)
	}
	if _, err := lock.Exec(ctx, `SELECT pg_advisory_lock($1)`, lockKey(name)); err != nil {
		lock.Close(context.Background())
		return "", fmt.Errorf("refusing destructive test setup: waiting for another test run of %s to release database %s: %w", pkg, name, err)
	}
	lockConns = append(lockConns, lock) // held until the binary exits

	if err := RecreateDatabase(ctx, lock, name); err != nil {
		return "", err
	}
	u.Path = "/" + name
	own := u.String()
	// Same server-side check as DATABASE_URL gets: the new database must
	// report a test name and carry Marker.
	if err := ConfirmThrowaway(ctx, own); err != nil {
		return "", err
	}
	return own, nil
}

// RecreateDatabase drops the scratch database name (only if it carries Marker)
// and creates it fresh with Marker, using admin, a connection to the base
// server. A database of that name without Marker is refused, never dropped.
func RecreateDatabase(ctx context.Context, admin *pgx.Conn, name string) error {
	if err := CheckTestDatabaseName(name); err != nil {
		return err
	}
	ident := pgx.Identifier{name}.Sanitize()
	var comment string
	err := admin.QueryRow(ctx,
		`SELECT COALESCE(shobj_description(oid, 'pg_database'), '') FROM pg_database WHERE datname = $1`, name).Scan(&comment)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
	case err != nil:
		return fmt.Errorf("refusing destructive test setup: cannot look up database %q: %w", name, err)
	case comment != Marker:
		return fmt.Errorf("refusing destructive test setup: database %q exists but is not marked as a throwaway test database, so it will not be dropped. "+
			"Drop it yourself if it is a leftover: DROP DATABASE %s", name, ident)
	default:
		if _, err := admin.Exec(ctx, "DROP DATABASE IF EXISTS "+ident+" WITH (FORCE)"); err != nil {
			return fmt.Errorf("refusing destructive test setup: cannot drop old %q: %w", name, err)
		}
	}
	if _, err := admin.Exec(ctx, "CREATE DATABASE "+ident); err != nil {
		return fmt.Errorf("refusing destructive test setup: cannot create %q (the DATABASE_URL role needs CREATEDB): %w", name, err)
	}
	if _, err := admin.Exec(ctx, fmt.Sprintf("COMMENT ON DATABASE %s IS '%s'", ident, Marker)); err != nil {
		return fmt.Errorf("refusing destructive test setup: cannot mark %q: %w", name, err)
	}
	return nil
}

// maxIdent is Postgres's identifier limit (NAMEDATALEN - 1).
const maxIdent = 63

// PackageDatabaseName derives a package's database name from the base
// database name and the package's path inside the module:
// ("homepad_test", "internal/api") → "homepad_internal_api_<hash>_test". The
// readable part is lower-case ASCII; the hash covers the exact base name and
// package path, so inputs that slugify alike (cmd/homepad-api and
// cmd/homepad_api) still get different names. The result always ends in
// "_test" and fits in a Postgres identifier.
func PackageDatabaseName(baseName, pkg string) string {
	sum := sha256.Sum256([]byte(baseName + "\x00" + pkg))
	tail := "_" + hex.EncodeToString(sum[:4]) + "_test"
	readable := slugify(strings.TrimSuffix(baseName, "_test") + "_" + pkg)
	if readable == "" {
		readable = "pkg"
	}
	if len(readable) > maxIdent-len(tail) {
		readable = readable[:maxIdent-len(tail)]
	}
	return readable + tail
}

// lockKey is a 64-bit advisory-lock key for a package database name, so two
// packages never wait on each other through a hash collision.
func lockKey(name string) int64 {
	sum := sha256.Sum256([]byte("homepad-test-db:" + name))
	return int64(binary.BigEndian.Uint64(sum[:8]))
}

func slugify(s string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(s) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		} else {
			b.WriteRune('_')
		}
	}
	return strings.Trim(b.String(), "_")
}

// testPackagePath is the running test binary's package directory relative to
// the module root (go test runs each binary in its package's directory).
func testPackagePath() (string, error) {
	wd, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for dir := wd; ; dir = filepath.Dir(dir) {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			rel, err := filepath.Rel(dir, wd)
			if err != nil {
				return "", err
			}
			return filepath.ToSlash(rel), nil
		}
		if filepath.Dir(dir) == dir {
			// No go.mod (a binary built with go test -c and run elsewhere):
			// the full directory keeps two same-named packages apart.
			return filepath.ToSlash(wd), nil
		}
	}
}
