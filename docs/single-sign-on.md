# Single sign-on

Homepad works with local accounts out of the box. Single sign-on (OIDC) is optional. It works with PocketID, Authelia, Authentik, Keycloak or any OIDC provider. This page uses PocketID for the steps.

## Turn it on

Set these in `.env`, then run `docker compose up -d`:

```dotenv
OIDC_ENABLED=true
OIDC_ISSUER=https://auth.example.com
OIDC_CLIENT_ID=homepad
OIDC_CLIENT_SECRET=...
OIDC_REDIRECT_URL=https://homepad.example.com/api/auth/oidc/callback
OIDC_ADMIN_GROUP=homepad-admins   # people in this group become admins
OIDC_MEMBER_GROUP=homepad         # people in this group become members
```

Register the redirect URL with your provider. On plain `http://`, single sign-on also needs `COOKIE_SECURE=false`, the same as password sign-in.

## Single sign-on needs verified emails

Homepad signs you in with single sign-on only when your identity provider says your email is verified. Without that, anyone who could change their email at the provider could sign in as someone else here.

**PocketID 2.2 and newer**

1. For people who already have a PocketID account: open **Settings → Users** and open each person. Next to **Email**, turn on the toggle ("Mark as verified"). Save.
2. For people you add later: open **Settings → Application Configuration → Email** and turn on **Emails verified by default**. This does not change people who already exist.
3. Or set **Email Verification** to **Optional** or **Required**, and set up email in PocketID. Then people verify their own address.

If you run PocketID with `UI_CONFIG_DISABLED=true`, set `EMAILS_VERIFIED=true` in its environment instead of step 2.

**PocketID 2.1 and older:** turn on **Emails Verified** in Application Configuration. This marks every user's email as verified.

**Other providers:** make sure the ID token or the userinfo answer has `"email_verified": true`. Homepad asks for the `openid profile email groups` scopes.

If the email isn't verified, the sign-in screen says: "Your identity provider hasn't confirmed your email. Ask your admin to mark it as verified." Fix it at the provider and try again.

## Who gets an account

With `HOMEPAD_REGISTRATION=invite_only` (the default), single sign-on creates an account only for people in `OIDC_ADMIN_GROUP` (they become admins) or `OIDC_MEMBER_GROUP` (they become members). Anyone else needs an invite first. After they accept it, they can sign in with single sign-on if their email matches.

- Someone who already has a Homepad account with the same verified email always signs in, whatever their groups.
- On a new install with no accounts yet, only `OIDC_ADMIN_GROUP` can make the first account, so the first account is always an admin.
- Anyone else sees: "You don't have a Homepad account yet. Ask your admin for an invite."
- With `HOMEPAD_REGISTRATION=open`, anyone your provider signs in gets an account. People in `OIDC_ADMIN_GROUP` become admins; everyone else becomes a member.
- `HOMEPAD_MAX_ACCOUNTS` still applies.

### Set up the groups in PocketID (the default path)

This is the usual way to let your household in with PocketID.

1. In PocketID, open **Settings → User Groups** and tap **Add Group**.
2. Make the admin group. **Friendly Name** is what PocketID shows, for example "Homepad admins". **Name** is what goes in the `groups` claim, for example `homepad-admins`. Save.
3. Make the member group the same way, for example **Name** `homepad`.
4. Open each group and assign its people under **Users**.
5. In Homepad's `.env`, set the two group names, then run `docker compose up -d`:

   ```dotenv
   OIDC_ADMIN_GROUP=homepad-admins
   OIDC_MEMBER_GROUP=homepad
   ```

Use the group's **Name**, not its Friendly Name. Names must match exactly, including case. You can check both values in Homepad under **Admin Panel → System**.

To add someone later, add them to the member group in PocketID. Their next sign-in makes their account. Removing someone from a group doesn't remove their Homepad account; do that in **Administration → Accounts**.

## Sign-in limits

Homepad limits how fast sign-in can be tried. If another proxy sits in front of Homepad, set `HOMEPAD_TRUSTED_PROXIES` to its address so Homepad can tell people apart. Without it, everyone shares one limit.

In the quickstart, Homepad's own `web` container is the first proxy, so list it too:

```dotenv
HOMEPAD_TRUSTED_PROXIES=web                  # the quickstart alone
HOMEPAD_TRUSTED_PROXIES=web,192.0.2.10       # with a reverse proxy in front
```

The value is a comma-separated list of addresses, ranges like `10.0.0.0/8`, or hostnames. Hostnames are looked up at start and every 5 minutes. A value Homepad can't read stops the API at start, with a message that names the setting. **Admin Panel → System → Trusted proxies** shows the current value.

What the limits are:

- **Sign in:** 10 tries a minute from one place.
- **One email:** after 10 wrong passwords in 15 minutes, that email can't sign in with a password for 15 minutes, even with the right one. Single sign-on and devices that are already signed in keep working. Someone who knows an email can keep it locked this way. The lock lasts 15 minutes.
- **Create account:** 5 a minute. **Invite and reset links:** 30 a minute.
- **Single sign-on button:** 20 a minute.

Over a limit, the sign-in screen says "Too many tries. Wait N minutes and try again." The limits live in memory: a restart clears them, and each API replica keeps its own.
