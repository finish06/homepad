package dbguard

import (
	"context"
	"net/url"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
)

// SPEC-api-cleanup-18.2.0 AC-007 (#669) — the DSN check reads a string. These
// tests check the server behind it: a database that already holds homepad
// tables is used only if it carries the throwaway marker.
func scratchDB(t *testing.T, name string) string {
	t.Helper()
	// It DROPs `name` on the base server, so `name` must be a _test name (#256).
	if err := CheckTestDatabaseName(name); err != nil {
		t.Fatalf("%v", err)
	}
	base := os.Getenv("DATABASE_URL")
	if base == "" {
		t.Skip("DATABASE_URL not set — skipping Postgres-backed guard test")
	}
	if err := CheckTestDatabase(base); err != nil {
		t.Fatalf("%v", err)
	}
	ctx := context.Background()
	admin, err := pgx.Connect(ctx, base)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer admin.Close(ctx)
	_, _ = admin.Exec(ctx, "DROP DATABASE IF EXISTS "+name+" WITH (FORCE)")
	if _, err := admin.Exec(ctx, "CREATE DATABASE "+name); err != nil {
		t.Fatalf("create %s (needs CREATEDB): %v", name, err)
	}
	t.Cleanup(func() {
		a, err := pgx.Connect(ctx, base)
		if err != nil {
			return
		}
		defer a.Close(ctx)
		_, _ = a.Exec(ctx, "DROP DATABASE IF EXISTS "+name+" WITH (FORCE)")
	})
	u, _ := url.Parse(base)
	u.Path = "/" + name
	return u.String()
}

func exec(t *testing.T, dsn, sql string) {
	t.Helper()
	ctx := context.Background()
	c, err := pgx.Connect(ctx, dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer c.Close(ctx)
	if _, err := c.Exec(ctx, sql); err != nil {
		t.Fatalf("%s: %v", sql, err)
	}
}

func TestConfirmThrowaway_FreshDatabaseIsClaimed(t *testing.T) {
	dsn := scratchDB(t, "dbguard_fresh_test")
	if err := ConfirmThrowaway(context.Background(), dsn); err != nil {
		t.Fatalf("a fresh database must be accepted: %v", err)
	}
	// Claimed: it now has tables and still passes.
	exec(t, dsn, "CREATE TABLE users (id int)")
	if err := ConfirmThrowaway(context.Background(), dsn); err != nil {
		t.Fatalf("a claimed database must stay accepted: %v", err)
	}
}

func TestConfirmThrowaway_UnmarkedDatabaseWithTablesIsRefused(t *testing.T) {
	dsn := scratchDB(t, "dbguard_used_test")
	exec(t, dsn, "CREATE TABLE users (id int)")
	err := ConfirmThrowaway(context.Background(), dsn)
	if err == nil {
		t.Fatal("a database with homepad tables and no marker must be refused")
	}
	if !strings.Contains(err.Error(), "COMMENT ON DATABASE") {
		t.Errorf("the refusal should give the SQL that marks the database: %v", err)
	}
	exec(t, dsn, "COMMENT ON DATABASE dbguard_used_test IS '"+Marker+"'")
	if err := ConfirmThrowaway(context.Background(), dsn); err != nil {
		t.Fatalf("a marked database must be accepted: %v", err)
	}
}
