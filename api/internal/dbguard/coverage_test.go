package dbguard

import (
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// #256 — every Go test that reaches a database goes through this package.
//
// The rule is enforced on the source instead of asserted in a comment, because
// "every caller does X" is how the gap #72 closed stayed open: one package
// read DATABASE_URL by a path the guard did not cover.
//
//  1. Only internal/dbguard reads DATABASE_URL in test code (internal/
//     testsupport, the shared harness, included). Every other test gets its DSN
//     from RequireTestDatabase, directly or through requireDatabaseURL,
//     testsupport.NewServer/NewEnv, or a scratch database built off one.
//  2. A file that runs CREATE DATABASE or DROP DATABASE checks the scratch
//     name with CheckTestDatabaseName.
//
// The paths this covers, as of 18.6.0 (SPEC-cleanup-18.6.0 §6):
//   - internal/testsupport: NewServer, NewEnv, NewOIDCServer and their *With
//     forms call RequireTestDatabase; truncate() re-checks (guardDestructive).
//   - internal/storage: requireDatabaseURL → RequireTestDatabase; freshDB,
//     freshStore and adultsStore check the scratch name, then the base.
//   - internal/api: registration, register_validation, sessions, icons and
//     cookie_secure tests call RequireTestDatabase; the rest use testsupport.
//   - internal/session: pgstore tests call RequireTestDatabase.
//   - internal/dbguard: scratchDB checks the scratch name and the base DSN.
//   - cmd/homepad-api: main_test uses testsupport.NewEnv.

var readsDatabaseURL = regexp.MustCompile(`os\.(Getenv|LookupEnv)\("DATABASE_URL"\)`)
var createsOrDrops = regexp.MustCompile(`(?i)\b(CREATE|DROP)\s+DATABASE\b`)

// apiRoot is the module root (api/), two levels above this package.
func apiRoot(t *testing.T) string {
	t.Helper()
	wd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	return filepath.Clean(filepath.Join(wd, "..", ".."))
}

// testCode is every _test.go file, plus internal/testsupport (a test-only
// helper package that is not named _test).
func testCode(t *testing.T) map[string]string {
	t.Helper()
	root := apiRoot(t)
	out := map[string]string{}
	err := filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || !strings.HasSuffix(p, ".go") {
			return nil
		}
		rel, _ := filepath.Rel(root, p)
		rel = filepath.ToSlash(rel)
		if !strings.HasSuffix(p, "_test.go") && !strings.HasPrefix(rel, "internal/testsupport/") {
			return nil
		}
		b, err := os.ReadFile(p)
		if err != nil {
			return err
		}
		out[rel] = stripLineComments(string(b))
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(out) < 50 {
		t.Fatalf("found only %d test files under %s; the walk is broken", len(out), root)
	}
	return out
}

// stripLineComments drops // comment lines, so a comment that mentions DROP
// DATABASE or DATABASE_URL is not code that does it.
func stripLineComments(src string) string {
	lines := strings.Split(src, "\n")
	for i, l := range lines {
		if strings.HasPrefix(strings.TrimSpace(l), "//") {
			lines[i] = ""
		}
	}
	return strings.Join(lines, "\n")
}

func TestOnlyDbguardReadsDatabaseURLInTests(t *testing.T) {
	for rel, src := range testCode(t) {
		if strings.HasPrefix(rel, "internal/dbguard/") {
			continue
		}
		if readsDatabaseURL.MatchString(src) {
			t.Errorf("%s reads DATABASE_URL itself; get the DSN from dbguard.RequireTestDatabase (or requireDatabaseURL / testsupport) so the test-database guard runs first", rel)
		}
	}
}

func TestEveryScratchDatabaseNameIsChecked(t *testing.T) {
	for rel, src := range testCode(t) {
		if rel == "internal/dbguard/coverage_test.go" {
			continue
		}
		if createsOrDrops.MatchString(src) && !strings.Contains(src, "CheckTestDatabaseName(") {
			t.Errorf("%s creates or drops a database but never calls CheckTestDatabaseName on the name", rel)
		}
	}
}

// Negative controls: the two patterns see what they are meant to.
func TestCoverageRulesSeeAViolation(t *testing.T) {
	if !readsDatabaseURL.MatchString(`dsn := os.Getenv("DATABASE_URL")`) {
		t.Error("readsDatabaseURL misses a plain Getenv")
	}
	if !readsDatabaseURL.MatchString(`dsn, ok := os.LookupEnv("DATABASE_URL")`) {
		t.Error("readsDatabaseURL misses LookupEnv")
	}
	if !createsOrDrops.MatchString(`admin.Exec(ctx, "DROP DATABASE IF EXISTS "+name)`) {
		t.Error("createsOrDrops misses DROP DATABASE")
	}
	if !createsOrDrops.MatchString(`"create database " + name`) {
		t.Error("createsOrDrops misses lower-case create database")
	}
}

func TestCheckTestDatabaseName(t *testing.T) {
	for _, ok := range []string{"homepad_test", "homepad_mig0007_pop_test", "x_test"} {
		if err := CheckTestDatabaseName(ok); err != nil {
			t.Errorf("%q refused: %v", ok, err)
		}
	}
	for _, bad := range []string{"homepad", "homepad_mig0007_pop", "postgres", "", "test", "homepad_test_old"} {
		if err := CheckTestDatabaseName(bad); err == nil {
			t.Errorf("%q accepted; it is not a _test name", bad)
		}
	}
}
