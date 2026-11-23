package gatus_test

import (
	"reflect"
	"testing"

	"github.com/finish06/homepad/api/internal/gatus"
)

// SPEC-api-cleanup-18.2.0 AC-006 (#668) — the threshold and the base URL are
// changed while the poller runs, so they are guarded by the client's lock.
// They must not be exported fields: an exported field lets a caller skip the
// lock (main.go did, for DegradedAfter). The setters are the only way in.
func TestClient_LockedFieldsAreUnexported(t *testing.T) {
	typ := reflect.TypeOf(gatus.Client{})
	for _, name := range []string{"DegradedAfter", "BaseURL"} {
		if f, ok := typ.FieldByName(name); ok && f.IsExported() {
			t.Errorf("gatus.Client.%s is an exported field; use the locked setter instead", name)
		}
	}
}
