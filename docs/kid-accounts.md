# Kid accounts

A kid account gives a child a Homepad dashboard with only the apps you choose,
signed in on their own device (typically the family iPad) for months at a time.
The kid needs no email and no password. You manage everything from
**Accounts** in the Admin Panel, from any device.

Kid accounts arrived in Homepad 17.0.0, together with homepad-api's kid accounts
API. Both halves are needed.

- [Before you start: close registration](#before-you-start-close-registration)
- [Set up a kid's iPad](#set-up-a-kids-ipad)
- [What a kid sees and can do](#what-a-kid-sees-and-can-do)
- [Changing a kid's apps later](#changing-a-kids-apps-later)
- [Devices, and a lost iPad](#devices-and-a-lost-ipad)
- [Getting your own session back on the iPad](#getting-your-own-session-back-on-the-ipad)
- [Homepad hides apps; it doesn't block URLs](#homepad-hides-apps-it-doesnt-block-urls)
- [Upgrading to 17.0.0: everyone is signed out once](#upgrading-to-1700-everyone-is-signed-out-once)

## Before you start: close registration

**Set `HOMEPAD_REGISTRATION=invite_only`** in `.env` and run
`docker compose up -d`.

A kid's menu has a visible **Sign out**: it's how you get the iPad back for
yourself. With registration left `open`, a kid who signs out can use **Create
account** on the login screen to register an ordinary adult account, and an
adult account sees every app in the catalog. With `invite_only`, the login
screen can't create accounts, so signing out leads nowhere.

The quickstart already tells you to do this once your own admin account exists.
If you skipped it, do it before setting up a kid.

## Set up a kid's iPad

Do this on the iPad itself, signed in as yourself (an admin).

1. Open the account menu (your avatar, top right), then **Administration →
   Accounts**. The Admin Panel opens on its Accounts section.
2. Tap **+ Add a kid**. Enter a name (1–40 characters; two kids can't share a
   name), pick a color, and tap **Save**.
3. Tap the kid's row to edit them. Under **Apps *name* can see**, tick the apps
   this kid should have:
   - apps are grouped by the same sections as your dashboard;
   - the box beside each section selects or clears the whole section;
   - **Search apps** finds an app in any section;
   - the "*N* of *M*" count shows how many are ticked.

   Tap **Save**. (Saving with no apps ticked is allowed. The kid then sees "No
   apps yet. Ask a grown-up to add some.")
4. Open the kid again and tap **Sign in this device as *name***, then confirm.
   This signs **you** out on this iPad and signs the kid in, in one step; the
   page reloads into the kid's dashboard. The button is disabled with "Save
   first" while the editor has unsaved changes.
5. In Safari, tap **Share → Add to Home Screen**. The kid's Homepad now opens
   like an app.

The kid stays signed in for 180 days, and every use pushes that out again, so a
kid who uses it at least every few months stays signed in for good. Restarts and
deploys of the API don't sign anyone out.

## What a kid sees and can do

A kid sees their apps, in their sections, as large tiles. They can:

- open an app;
- search their apps with ⌘K (or the search box);
- pick favorites, with the ☆ button next to their name;
- change the theme (light, dark or system) and the accent color;
- sign out.

That's all. There is no edit mode, no App Library, no "Add app", no tile
editing, no settings beyond appearance, and nothing from the Admin Panel. The
health panel is off for kids. The server enforces this as well: every catalog,
library, layout, settings and admin change is refused for a kid session.

## Changing a kid's apps later

Open **Administration → Accounts** from any device, tap the kid, change the
ticks and save. The kid's dashboard picks the change up on its next refresh,
within about a minute, without reloading or signing out.

Apps you add to the catalog later **stay hidden from every kid until you tick
them**. Nothing appears on a kid's dashboard unless you chose it.

Deleting a kid (**Delete *name*** in the editor) signs out all their devices and
removes their favorites and app list.

## Devices, and a lost iPad

The kid editor lists each device the kid is signed in on: what it is ("iPad ·
Safari"), when it signed in and when it was last used. **Sign out** next to a
device ends that session immediately. The device's next request fails, and it
shows the normal login screen; a kid without a password can't get back in from
there. Use this for a lost, sold or handed-down iPad.

## Getting your own session back on the iPad

Open the kid's menu (their name, top right) and tap **Sign out**, then sign in
as yourself. To hand the iPad back to the kid, use **Sign in this device as
*name*** again. Kids have no password, so this is the only way a kid is signed
in.

## Homepad hides apps; it doesn't block URLs

Homepad's server never sends a kid an app that isn't on their list: not in the
dashboard, not in search, not in the status data. A kid can't find, open or
favorite an app they can't see.

But Homepad is a launcher, not a filter. **If a kid types an app's address into
Safari, or follows a bookmark, Homepad can't stop that.** Each app's own login
still applies. If you need to block websites or keep the iPad on Homepad, use
the iPad's own controls:

- **Screen Time** (Settings → Screen Time): Content & Privacy Restrictions can
  limit Safari to websites you allow, and App Limits and Downtime limit when and
  how long the iPad is used.
- **Guided Access** (Settings → Accessibility → Guided Access): locks the iPad
  to a single app, such as the Homepad home-screen app, until you triple-click
  and enter a passcode.

## Upgrading to 17.0.0: everyone is signed out once

17.0.0 moves sign-in sessions from the API's memory into Postgres, which is what
lets a kid stay signed in and lets adults survive restarts and deploys (adult
sessions last 30 days, renewed as they're used). Sessions from before the
upgrade can't carry over, so **deploying 17.0.0 signs every account out once.**
Everyone signs in again as usual. Later deploys don't sign anyone out.
