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
- **Remove *name*…**, to take their account away.

Each one asks before it does anything.

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
