package widgets

import (
	"context"
	"sync"
	"testing"
	"time"
)

// SPEC-api-cleanup-18.2.0 AC-008 (#651) — deleting a widget drops its lock
// too, so the map holds at most one lock per configured widget.
func TestRemove_DropsTheLock(t *testing.T) {
	m := &Manager{entries: map[string]*entry{}, locks: map[string]*sync.Mutex{}}
	_ = m.lockFor("svc-a")
	_ = m.lockFor("svc-b")
	m.Remove("svc-a")
	if _, ok := m.locks["svc-a"]; ok {
		t.Fatal("Remove left svc-a's lock in the map")
	}
	if _, ok := m.locks["svc-b"]; !ok {
		t.Fatal("Remove dropped another service's lock")
	}
}

// A widget whose row disappears (its service was deleted) loses its lock on
// the next fetch or Reload, without a Remove call.
func TestRowGone_DropsTheLock(t *testing.T) {
	ctx := context.Background()
	r := newRig(t, nil, row("s1"), row("s2"))
	r.m.RefreshDue(ctx)
	if len(r.m.locks) != 2 {
		t.Fatalf("want 2 locks after a refresh, got %d", len(r.m.locks))
	}
	r.src.del("s1")
	r.clock.Advance(time.Minute)
	r.m.RefreshDue(ctx)
	if _, ok := r.m.locks["s1"]; ok {
		t.Error("a fetch that finds the row gone must drop its lock")
	}
	r.src.del("s2")
	if err := r.m.Reload(ctx, "s2"); err != nil {
		t.Fatal(err)
	}
	if _, ok := r.m.locks["s2"]; ok {
		t.Error("Reload of a deleted row must drop its lock")
	}
}
