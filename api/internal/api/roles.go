package api

import "net/http"

// SPEC-decisions-18.4.0 §2 (#599) — the adult non-admin role is "member" in
// the API, as in the UI and docs. The database still stores "user": the name
// is mapped here, at the edge, so the data stays readable by older images
// (a rollback) and no SQL changes. Every response that carries a role goes
// through apiRole; every request that takes one goes through parseAdultRole.

const (
	roleMember = "member"
	// roleUserAlias is the pre-18.4.0 input name. Taken until 19.0.0.
	roleUserAlias = "user"
	// storedMember is what users.role and invites.role hold for a member.
	storedMember = "user"
)

// badRoleMsg is the 400 body for a role other than admin or member.
const badRoleMsg = `role must be "admin" or "member"`

// userAliasWarning goes on a response to a request that sent "user".
const userAliasWarning = `299 homepad "role \"user\" is deprecated, use \"member\"; \"user\" stops working in 19.0.0"`

// apiRole is the role as the API sends it.
func apiRole(stored string) string {
	if stored == storedMember {
		return roleMember
	}
	return stored
}

// parseAdultRole maps an input role to the stored one. ok is false for
// anything but admin, member or the deprecated user; deprecated is true for
// user.
func parseAdultRole(in string) (stored string, deprecated, ok bool) {
	switch in {
	case "admin":
		return "admin", false, true
	case roleMember:
		return storedMember, false, true
	case roleUserAlias:
		return storedMember, true, true
	}
	return "", false, false
}

// warnUserAlias marks the response when the request used the old name.
func warnUserAlias(w http.ResponseWriter, deprecated bool) {
	if deprecated {
		w.Header().Set("Warning", userAliasWarning)
	}
}
