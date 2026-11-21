# Accounts

Homepad has three kinds of account. An **admin** can change apps, settings and
accounts. A **member** uses the dashboard and keeps their own favorites and
settings. A **kid** sees only the apps an admin picks. Kids are covered in
[Kid accounts](kid-accounts.md).

You manage accounts in **Administration → Accounts**.

## Adults

To add an adult, use **+ Add an adult**. It makes a one-time invite link.

In **Administration → Accounts**, every other adult's row has a **Manage**
menu. It holds:

- **Make admin** or **Make member**, to change their role.
- **Make a reset link**, when they have a password. See
  [Forgotten passwords](#forgotten-passwords).
- **Remove *name*…**, to take their account away.

The role change and Remove ask before they do anything.

**Who can do this.** Only admins. Your own row has no menu: you can't remove
or change your own account. Another admin does that.

**Homepad keeps at least one admin.** You can't remove the last admin or make
them a member. If two admins try to change each other at the same moment,
one change goes through and the other is refused.

**Changing a role.** That person is signed out on every device. The next time
they sign in, they see the screens for their new role.

**Removing an adult.** They are signed out everywhere. Their favorites, their
app order and their settings are deleted. Any invites they made and nobody has
used yet stop working. The apps everyone shares stay as they are, and kids
don't change. Removing someone frees their place if you set
`HOMEPAD_MAX_ACCOUNTS`.

To bring a removed adult back, send them a new invite.

**Single sign-on.** If an adult signs in with single sign-on, removing them
here doesn't stop that. They can sign in again and get a new account. To stop
it, remove them in your identity provider too. While single sign-on is on,
the Remove confirm says so for every adult, because Homepad can't tell who
uses it.

## Forgotten passwords

Homepad doesn't send email. To reset a forgotten password, an admin makes a
link and sends it.

1. An admin opens **Administration → Accounts**, opens the **Manage** menu on
   the adult's row and picks **Make a reset link**.
2. They copy the link and send it to the adult however they like.
3. The adult opens it, types a new password twice and taps **Save password**.
   They are signed in, and every other device of theirs is signed out.

The link works once, for 24 hours. Making a new link stops the old one.
Making a link changes nothing until it's used. The old password keeps working
until then.

Kids have no password, so they get no reset link. Accounts that only sign in
with single sign-on get none either. An admin can't make one for themselves.

**Change your own password** in **My settings → Password → Change password**.
You need your current password. Your other devices are signed out, and this
one stays signed in. After 5 wrong current passwords in 15 minutes, Homepad
makes you wait 15 minutes.

**If you are the only admin and forget your password,** run this on the
server:

```sh
docker compose exec api /homepad-api reset-link you@example.com
```

It prints a path that starts with `/#reset=` and when it ends. Put your
Homepad address in front of it, for example
`https://homepad.example.com/#reset=…`, and open it. The link is printed once
and isn't logged.
