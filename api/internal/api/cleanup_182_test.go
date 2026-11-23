package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"

	"github.com/finish06/homepad/api/internal/testsupport"
)

// SPEC-api-cleanup-18.2.0 — regression tests for the 18.2.0 API cleanup.

func postLogin(t *testing.T, baseURL, email, password string) int {
	t.Helper()
	b, _ := json.Marshal(map[string]string{"email": email, "password": password})
	resp, err := http.Post(baseURL+"/api/login", "application/json", bytes.NewReader(b))
	require.NoError(t, err)
	resp.Body.Close()
	return resp.StatusCode
}

// AC-001 (#656) — the 8-character minimum is a registration rule. An account
// whose password predates it can still sign in, and a wrong short password is
// a plain 401, not a 400.
func TestLogin_ShortPasswordIsCheckedAgainstTheHash(t *testing.T) {
	env := testsupport.NewEnv(t)
	hash, err := bcrypt.GenerateFromPassword([]byte("admin"), bcrypt.MinCost)
	require.NoError(t, err)
	_, err = env.Store.CreateUser(context.Background(), "old-admin@example.com", string(hash), "admin")
	require.NoError(t, err)

	assert.Equal(t, http.StatusOK, postLogin(t, env.URL, "old-admin@example.com", "admin"),
		"a pre-#12 short password must still sign in")
	assert.Equal(t, http.StatusUnauthorized, postLogin(t, env.URL, "old-admin@example.com", "nope"),
		"a wrong short password is a 401")
	assert.Equal(t, http.StatusUnauthorized, postLogin(t, env.URL, "nobody@example.com", "short"),
		"no such account, short password: 401 like any other miss")

	// Registration still refuses it.
	b, _ := json.Marshal(map[string]string{"email": "new@example.com", "password": "short"})
	resp, err := http.Post(env.URL+"/api/register", "application/json", bytes.NewReader(b))
	require.NoError(t, err)
	resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

// AC-002 / AC-003 (#657, #658) — a favicon that is not a PNG is a 422 with a
// plain-text reason, and the icon already stored is left alone.
func TestFetchIcon_NonPNGFavicon_422_KeepsIcon(t *testing.T) {
	// An ICO header: reserved 0, type 1 (icon), one image.
	ico := append([]byte{0, 0, 1, 0, 1, 0}, bytes.Repeat([]byte{0x20}, 64)...)
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/":
			w.Header().Set("Content-Type", "text/html")
			_, _ = io.WriteString(w, `<html><head><link rel="icon" href="/favicon.ico"></head></html>`)
		case "/favicon.ico":
			w.Header().Set("Content-Type", "image/x-icon")
			_, _ = w.Write(ico)
		default:
			http.NotFound(w, r)
		}
	}))
	defer target.Close()

	s := testsupport.NewServer(t)
	defer s.Close()
	id := createServiceForFetch(t, s.URL, "admin-session", target.URL)
	existing := pngBytes(t, 32, 32)
	put := putIcon(t, s.URL, "admin-session", id, "light", existing)
	put.Body.Close()
	require.Equal(t, http.StatusNoContent, put.StatusCode)

	r := doJSON(t, http.MethodPost, s.URL+"/api/services/"+id+"/fetch-icon", "admin-session", nil)
	body, _ := io.ReadAll(r.Body)
	r.Body.Close()
	assert.Equal(t, http.StatusUnprocessableEntity, r.StatusCode)
	assert.True(t, strings.HasPrefix(r.Header.Get("Content-Type"), "text/plain"),
		"the 422 reason is plain text, shown as is by the tile editor")
	assert.Contains(t, string(body), "Could not fetch favicon: not a PNG image")

	got := doJSON(t, http.MethodGet, s.URL+"/api/services/"+id+"/icon/light", "admin-session", nil)
	stored, _ := io.ReadAll(got.Body)
	got.Body.Close()
	require.Equal(t, http.StatusOK, got.StatusCode)
	assert.Equal(t, existing, stored, "a failed fetch leaves the stored icon unchanged")
}

type createdService struct {
	ID               string `json:"id"`
	GatusKey         string `json:"gatus_key"`
	ClickAction      string `json:"clickAction"`
	IframeSameOrigin *bool  `json:"iframeSameOrigin"`
}

// AC-004 (#662) — the 201 from POST /api/services carries the saved gatus_key.
func TestCreateService_ReturnsGatusKey(t *testing.T) {
	s := testsupport.NewServer(t)
	defer s.Close()

	r := doJSON(t, http.MethodPost, s.URL+"/api/services", "admin-session", map[string]any{
		"slug": "foo", "name": "Foo", "url": "https://foo.example.com", "gatus_key": " kube_foo ",
	})
	defer r.Body.Close()
	require.Equal(t, http.StatusCreated, r.StatusCode)
	var sv createdService
	require.NoError(t, json.NewDecoder(r.Body).Decode(&sv))
	assert.Equal(t, "kube_foo", sv.GatusKey, "the create response must echo the saved (trimmed) key")
}

// AC-004 — library-add answers with the same service fields as create and
// update: clickAction, iframeSameOrigin and gatus_key.
func TestAddFromLibrary_ReturnsFullServiceView(t *testing.T) {
	s := testsupport.NewServer(t)
	defer s.Close()

	offer := createOffer(t, s.URL, "admin-session", "Plex", "https://plex.example.com")
	r := addFromLibrary(t, s.URL, "admin-session", offer.ID, nil)
	defer r.Body.Close()
	require.Equal(t, http.StatusCreated, r.StatusCode)
	var sv createdService
	require.NoError(t, json.NewDecoder(r.Body).Decode(&sv))
	assert.Equal(t, "new_tab", sv.ClickAction, "a library copy starts as new_tab, like the list shows it")
	require.NotNil(t, sv.IframeSameOrigin)
	assert.False(t, *sv.IframeSameOrigin)
}
