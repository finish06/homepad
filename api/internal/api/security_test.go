package api_test

import (
	"io"
	"net/http"
	"regexp"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/finish06/homepad/api/internal/testsupport"
)

// AC A11 — Gatus URL is never reachable from a browser session and never
// appears in any backend response payload. The frontend bundle-grep half of
// this AC lives in the homepad (web) repo.

// sentinelGatusHost matches the shape of the deployed Gatus host, a
// gatus.<IPv4>.nip.io name, without writing the internal cluster address into
// this public repo. It catches that address and any other IP-based Gatus host,
// so it is at least as strict as the literal it replaced.
var sentinelGatusHost = regexp.MustCompile(`gatus\.\d{1,3}(\.\d{1,3}){3}\.nip\.io`)

func TestNoGatusURLInAnyResponse(t *testing.T) {
	s := testsupport.NewServer(t)
	defer s.Close()

	endpoints := []string{
		"/api/services",
		"/api/status",
		"/api/me",
		"/health",
		"/live",
	}

	for _, ep := range endpoints {
		t.Run(ep, func(t *testing.T) {
			req, _ := http.NewRequest(http.MethodGet, s.URL+ep, nil)
			req.AddCookie(&http.Cookie{Name: "homepad_session", Value: "any-user"})
			resp, err := http.DefaultClient.Do(req)
			require.NoError(t, err)
			defer resp.Body.Close()

			body, err := io.ReadAll(resp.Body)
			require.NoError(t, err)

			require.Equal(t, http.StatusOK, resp.StatusCode,
				"%s must return 200 so we can inspect the response body for the AC", ep)

			assert.False(t, sentinelGatusHost.Match(body),
				"%s response body must not contain the Gatus URL — leaked %q", ep, sentinelGatusHost.Find(body))
		})
	}
}
