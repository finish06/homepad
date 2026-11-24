package storage_test

import (
	"os"
	"os/exec"
	"strings"
	"testing"
)

// Issue #72: the internal/storage integration tests obtain DATABASE_URL through
// requireDatabaseURL and then TRUNCATE users/categories (migration_0013/0016),
// DROP DATABASE (migration_0007) and run Migrate. #67's guard lives only in
// internal/testsupport, so requireDatabaseURL accepted ANY DATABASE_URL
// unchecked — meaning `go test ./internal/storage/...` with the prod DSN would
// empty the catalog again, the same mechanism as the 2026-09-13 data-loss
// incident, through the one package the guard did not cover.
//
// requireDatabaseURL must REFUSE a non-test or prod-host DSN with t.Fatalf —
// never t.Skip (a skip is how this stayed invisible, #67 AC2) — BEFORE the test
// can Migrate or run any SQL.
//
// requireDatabaseURL fails via t.Fatalf, which unwinds the goroutine with
// runtime.Goexit; we cannot observe that from the same process. So we re-exec
// this test binary as a child with a dangerous DATABASE_URL and assert the
// child process FAILS (nonzero exit) carrying the guard's refusal message. The
// child only calls requireDatabaseURL and returns — it never connects, so a
// pre-fix run touches no database. Tests are named for the observed symptom
// ("refuses …"), not a theorized cause.

const guardChildEnv = "HOMEPAD_GUARD_SUBPROCESS"

// runGuardChild re-runs THIS test in a child process with DATABASE_URL forced to
// dsn and the subprocess marker set, returning the child's combined output and
// exit error.
func runGuardChild(t *testing.T, dsn string) (string, error) {
	t.Helper()
	cmd := exec.Command(os.Args[0], "-test.run=^"+t.Name()+"$", "-test.v")
	env := make([]string, 0, len(os.Environ())+2)
	for _, kv := range os.Environ() {
		if strings.HasPrefix(kv, "DATABASE_URL=") || strings.HasPrefix(kv, guardChildEnv+"=") {
			continue
		}
		env = append(env, kv)
	}
	env = append(env, guardChildEnv+"=1", "DATABASE_URL="+dsn)
	cmd.Env = env
	out, err := cmd.CombinedOutput()
	return string(out), err
}

func TestRequireDatabaseURL_RefusesProdHostDSN(t *testing.T) {
	// The exact production DSN from homepad-api#59 that caused the 2026-09-13 wipe.
	const dsn = "postgres://homepad:homepad@homepad-pg-rw.homepad.svc.cluster.local:5432/homepad"
	if os.Getenv(guardChildEnv) == "1" {
		// Child: requireDatabaseURL must NOT return here — it must Fatalf.
		requireDatabaseURL(t)
		return
	}
	out, err := runGuardChild(t, dsn)
	if err == nil {
		t.Fatalf("requireDatabaseURL accepted (returned or skipped) the prod-host DSN %q; it must FATAL. Child output:\n%s", dsn, out)
	}
	if !strings.Contains(out, "refusing destructive test setup") {
		t.Fatalf("child failed but not with the guard's refusal message; got:\n%s", out)
	}
}

func TestRequireDatabaseURL_RefusesNonTestDatabaseName(t *testing.T) {
	// A safe host, but a database that is NOT a throwaway _test database.
	const dsn = "postgres://homepad:homepad@localhost:5432/homepad?sslmode=disable"
	if os.Getenv(guardChildEnv) == "1" {
		requireDatabaseURL(t)
		return
	}
	out, err := runGuardChild(t, dsn)
	if err == nil {
		t.Fatalf("requireDatabaseURL accepted (returned or skipped) the non-test DB name %q; it must FATAL. Child output:\n%s", dsn, out)
	}
	if !strings.Contains(out, "refusing destructive test setup") {
		t.Fatalf("child failed but not with the guard's refusal message; got:\n%s", out)
	}
}

// #256 — freshDB (and freshStore and adultsStore on top of it) runs
// `DROP DATABASE IF EXISTS <name> WITH (FORCE)` on the base server, so the
// scratch name is checked too. Before 18.6.0 two migration tests used names
// without "_test" (homepad_mig0007_pop, homepad_mig0007_empty); a base server
// that also held a real database of that name would have lost it.
//
// The child's DATABASE_URL is a valid test DSN on a port nothing listens on.
// If freshDB read or connected to it before checking the name, the child would
// fail with "cannot connect" instead; the test requires the name refusal.
func TestFreshDB_RefusesNonTestScratchName(t *testing.T) {
	const dsn = "postgres://homepad:homepad@127.0.0.1:1/homepad_test?sslmode=disable&connect_timeout=1"
	if os.Getenv(guardChildEnv) == "1" {
		freshDB(t, "homepad_scratch")
		return
	}
	out, err := runGuardChild(t, dsn)
	if err == nil {
		t.Fatalf("freshDB accepted the scratch name %q; it must FATAL. Child output:\n%s", "homepad_scratch", out)
	}
	if !strings.Contains(out, `database "homepad_scratch" is not a test database`) {
		t.Fatalf("child failed but not with the scratch-name refusal; got:\n%s", out)
	}
	if strings.Contains(out, "cannot connect") {
		t.Fatalf("freshDB connected before checking the scratch name; got:\n%s", out)
	}
}

// The same check lets a "_test" scratch name through to the base DSN guard.
// With the unreachable base DSN above, the child must get past the name check
// and stop at the server check, which proves the name check is not simply
// refusing everything.
func TestFreshDB_AcceptsTestScratchNameThenGuardsTheBase(t *testing.T) {
	const dsn = "postgres://homepad:homepad@127.0.0.1:1/homepad_test?sslmode=disable&connect_timeout=1"
	if os.Getenv(guardChildEnv) == "1" {
		freshDB(t, "homepad_scratch_test")
		return
	}
	out, err := runGuardChild(t, dsn)
	if err == nil {
		t.Fatalf("freshDB succeeded against an unreachable server; child output:\n%s", out)
	}
	if strings.Contains(out, "is not a test database") {
		t.Fatalf("freshDB refused a _test scratch name; got:\n%s", out)
	}
	if !strings.Contains(out, "cannot connect to check the database") {
		t.Fatalf("expected the base DSN's server check to stop it; got:\n%s", out)
	}
}
