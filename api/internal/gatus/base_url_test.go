package gatus

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// SPEC-admin-server-settings — the Gatus address changes live: the next poll
// uses it, and the old address's statuses are dropped at once.
func TestPoller_SetBaseURL(t *testing.T) {
	stub := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/endpoints/statuses" {
			http.NotFound(w, r)
			return
		}
		_ = json.NewEncoder(w).Encode([]map[string]any{{"key": "core_a", "results": []map[string]any{{"success": true, "timestamp": time.Now()}}}})
	}))
	defer stub.Close()

	p := NewPoller(NewClient("http://127.0.0.1:1"), time.Hour)
	if _, err := p.PollNow(context.Background()); err == nil {
		t.Fatal("the black hole answers nothing")
	}
	p.SetBaseURL(stub.URL + "/")
	if p.BaseURL() != stub.URL {
		t.Fatalf("trailing slash trimmed: %q", p.BaseURL())
	}
	snap, err := p.PollNow(context.Background())
	if err != nil || snap.Statuses["core_a"].Status != StatusUp {
		t.Fatalf("the next poll uses the new address: %v %+v", err, snap)
	}
	p.SetBaseURL("")
	if len(p.Snapshot().Statuses) != 0 {
		t.Fatal("the old address's statuses are dropped")
	}
}
