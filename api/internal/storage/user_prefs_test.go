package storage_test

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/finish06/homepad/api/internal/storage"
)

func pv[T any](v T) *T { return &v }

// SPEC-api-cleanup-18.2.0 AC-005 (#665) — PATCH /api/me writes every field in
// one statement, so a failed write changes nothing. Here the density value
// breaks the column CHECK (the handler would refuse it first; this is the
// backstop), and the theme sent with it must not be saved.
func TestSetUserPrefs_IsAllOrNothing(t *testing.T) {
	store, ctx := openStore(t)
	id := seedStoreUser(t, store, ctx)
	before, err := store.UserByID(ctx, id)
	require.NoError(t, err)
	require.NotEqual(t, "dark", before.ThemePref)

	_, err = store.SetUserPrefs(ctx, id, storage.UserPrefs{ThemePref: pv("dark"), DensityPref: pv("huge")})
	require.Error(t, err, "a density outside the CHECK must fail")

	after, err := store.UserByID(ctx, id)
	require.NoError(t, err)
	assert.Equal(t, before.ThemePref, after.ThemePref, "the theme must not be saved when the density fails")
	assert.Equal(t, before.DensityPref, after.DensityPref)
}

// Only the fields given are written; the rest keep their value.
func TestSetUserPrefs_WritesOnlyGivenFields(t *testing.T) {
	store, ctx := openStore(t)
	id := seedStoreUser(t, store, ctx)
	before, err := store.UserByID(ctx, id)
	require.NoError(t, err)

	got, err := store.SetUserPrefs(ctx, id, storage.UserPrefs{
		ThemePref: pv("dark"), DensityPref: pv("list"), ShowHealthBar: pv(!before.ShowHealthBar),
	})
	require.NoError(t, err)
	assert.Equal(t, "dark", got.ThemePref)
	assert.Equal(t, "list", got.DensityPref)
	assert.Equal(t, !before.ShowHealthBar, got.ShowHealthBar)
	assert.Equal(t, before.ShowUptimeDisplay, got.ShowUptimeDisplay)
	assert.Equal(t, before.ShowWidgets, got.ShowWidgets)

	reread, err := store.UserByID(ctx, id)
	require.NoError(t, err)
	assert.Equal(t, got, reread)
}

func TestSetUserPrefs_UnknownUser(t *testing.T) {
	store, ctx := openStore(t)
	_, err := store.SetUserPrefs(ctx, "00000000-0000-0000-0000-000000000000", storage.UserPrefs{ThemePref: pv("dark")})
	assert.True(t, errors.Is(err, storage.ErrNotFound), "got %v", err)
}
