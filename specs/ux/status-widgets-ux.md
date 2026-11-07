# UX: Status Widgets

**Spec:** [`SPEC-status-widgets.md`](../SPEC-status-widgets.md) §14 (v0.1.0, Draft)
**Author:** Kare (design), drafted 2026-11-07
**Status:** Draft — awaiting Caleb (spec §0 Q1…Q12) and the W-1…W-4 calls in §12.

This doc designs the six surfaces in spec §14. It assumes the recommended answers in spec §0. Where another answer would change a surface, the section says so.

Everything else reuses what exists:
- the tile and its three densities (SPEC-tile-density);
- the tile editor `Modal` (v21);
- the Admin Panel shell (`SettingsPanel`);
- the ⌘K launcher (v8);
- the My settings rows.

---

## 1. Where it lives

```
Page, top to bottom (adult)              Kid
  Header (wordmark · ⌘K pill · menus)      Header
  Glance strip      ← NEW (Q7)             Glance strip  ← NEW
  Health bar (if on)                       (health bar off by default)
  Your dashboard · density switch          Tiles
  Tiles             ← widget line NEW (Q2)

Account menu (admin)
  └─ Administration
       └─ Admin settings → Admin Panel
            Accounts · System · Widgets ← NEW · Library
Tile editor (Arrange → ✎)
  … existing fields … · Widget ← NEW section
My settings
  … Show health bar · Show widgets ← NEW (Q11)
```

- **The glance strip** shows only when the admin has turned on the clock or the weather. With both off (the default), the page is unchanged (AC-035).
- **The widget line** lives inside the tile. It adds no new buttons and no new tap targets.

## 2. The widget line on a tile

The line is the tile's existing status line in Compact and List, and one new line in Large. The status dot never changes.

### 2.1 Large (190px wide)

```
Without widget              With widget (ok)            With widget, app offline
┌──────────────────┐        ┌──────────────────┐        ┌──────────────────┐
│●              ★  │        │●              ★  │        │●              ★  │
│      ┌────┐      │        │      ┌────┐      │        │      ┌────┐      │
│      │icon│      │        │      │icon│      │        │      │icon│      │
│      └────┘      │        │      └────┘      │        │      └────┘      │
│     Sonarr       │        │     Sonarr       │        │     Sonarr       │
│                  │        │ 3 this week · 1 i…│        │                  │
└──────────────────┘        └──────────────────┘        └──────────────────┘
                              (row grows ~16px)            (empty reserved line)
```

- The line is one line, centred, using the status-line type (mono, 10.5px, the existing muted colour), with an ellipsis.
- Large shows at most **2 fields**.
- **Height.** A row that contains any widget tile grows by one line, and every tile in that row matches it (grid stretch). Rows with no widget tile stay at 120px (AC-008). The line is reserved on widget tiles in every state, so a tile never jumps when data arrives or goes away.

### 2.2 Compact (236 × 68px) — the default

```
Ok                                           Offline
┌──────────────────────────────────┐        ┌──────────────────────────────────┐
│ ┌────┐  Sonarr                 ● │        │▌┌────┐  Sonarr                 ● │
│ │icon│  3 this week · 1 in queue │        │▌│icon│  Offline · 6 min          │
│ └────┘                           │        │▌└────┘                           │
└──────────────────────────────────┘        └──────────────────────────────────┘
```

- The widget values take the status line's place. The tile height doesn't change.
- Compact shows at most **2 fields**.
- When the app is DOWN, the line goes back to "Offline · 6 min" with today's red tint and accent bar. The widget line returns when the app is back.
- Slow (DEGRADED) keeps the widget line. The dot already shows amber.

### 2.3 List (44px rows)

```
│ ┌──┐ Sonarr ·························· 3 this week · 1 in queue · 12 missing  ● │
│ ┌──┐ Jellyfin ··························· 2 playing · 1,204 movies · 86 shows  ● │
│ ┌──┐ Gitea ············································· Online · 41 ms  ● │
```

- List shows up to **3 fields**, right-aligned before the dot, as the status line is today.
- Tiles without a widget keep "Online · 41 ms".

### 2.4 Phone (<640px)

The phone uses the active density: Compact in one full-width column, or List. The line truncates from the right, so the **first field always shows** (AC-009). The admin's field order is the priority order.

```
320px, Compact                         320px, List
┌────────────────────────────────┐    │ ┌──┐ Sonarr ····· 3 this week · 1… ● │
│ ┌────┐ Sonarr                ● │    │ ┌──┐ Jellyfin ···· 2 playing · 1,2… ● │
│ │icon│ 3 this week · 1 in que… │
│ └────┘                         │
└────────────────────────────────┘
```

### 2.5 Kid dashboard

With Q3 (a), a kid's tiles look exactly as today ("Online"). The glance strip shows the time and weather (§4). There is no "Show widgets" switch in the kid's menu.

## 3. States

| State | Large | Compact / List | Description (screen readers) |
|---|---|---|---|
| **ok** | values | values | "3 this week, 1 in queue" |
| **stale** | `◷ 3 this week · 1 in queue` | same | "3 this week, 1 in queue. Updated 12 min ago" |
| **loading** | empty reserved line | status line as today | none |
| **error** | empty reserved line | status line as today | none |
| **app offline** | empty reserved line | "Offline · 6 min" | as today |
| **Show widgets off** | as if no widget | as if no widget | as today |

- **Stale is marked, not faded.** A leading ◷ plus the description says the numbers are old. Fading 10.5px mono text would drop it below AA contrast.
- **No loading shimmer.** The server fetches every widget seconds after it starts, so a viewer almost never sees `loading`. A shimmer would mostly flash. Showing the status line instead means there's nothing to animate and nothing to jump.
- **No error state on the dashboard.** Viewers can't fix a key, so the tile quietly falls back to being a launcher. The admin sees the error in the editor (§6.4).

## 4. Glance strip

```
Desktop / iPad landscape (≥1024px)
┌──────────────────────────────────────────────────────────────────────────────┐
│ 14:32   Saturday 7 November                ☁  8°   Rotterdam · H 9°  L 3°   Open-Meteo │
└──────────────────────────────────────────────────────────────────────────────┘

iPad portrait (820px)
┌──────────────────────────────────────────────────────┐
│ 14:32   Sat 7 Nov                  ☁ 8°  H 9° L 3°  Open-Meteo │
└──────────────────────────────────────────────────────┘

Phone (<640px)
┌────────────────────────────────┐
│ 14:32              ☁ 8°  Open-Meteo │
└────────────────────────────────┘
```

**Layout**
- One row, at least 44px tall, on the page surface. It has no card, so it reads as part of the page, not as another panel.
- The clock is on the left and the weather on the right. With only one of them on, it sits on the left.

**Clock**
- The time is 22px semibold with tabular figures (18px on a phone). The date is 13px muted.
- It uses the device's 12/24-hour choice unless the admin set one. It updates on the minute, with no seconds.

**Weather**
- A 22px icon (7 conditions, day and night versions of clear and partly cloudy), the temperature in 18px semibold, then the place and today's high and low in 13px muted.
- The place and range drop first on narrow screens.

**Credit**
- "Open-Meteo" is an 11px muted link to open-meteo.com. It's always visible, because the data licence (CC BY 4.0) asks for it.

**States**
- Stale weather (no good fetch in 30 min) keeps the last reading with a ◷ mark.
- With no reading at all, the weather half is empty. The strip never shows an error to viewers.

## 5. ⌘K web search row

```
┌ Search apps and the web ─────────────────────────────┐
│ ⌕  jellyfin subtitles                                 │
│ ─────────────────────────────────────────────────── │
│ ▌ ┌──┐ Jellyfin                                Media │
│   ⌕   Search the web for "jellyfin subtitles"   DuckDuckGo ↗ │
└──────────────────────────────────────────────────────┘
```

- **Rows**
  - The web row is always last when the query isn't empty. It uses the existing launcher row, the ⌕ glyph in the icon slot, and the provider name as the trailing tag.
  - With no app matches, it's the only row and starts selected, so Enter searches.
  - It opens in a new tab.
- **The pill and box text** becomes "Search apps and the web" while web search is on. With web search off it stays as today.
- **Kids:** the row is hidden unless the admin ticks "Kids can search the web" (§7).

## 6. Tile editor — the Widget section

### 6.1 Layout

It sits below the existing fields, under a "Widget" heading, inside the same modal and the same Save.

```
┌ Edit Jellyfin ──────────────────────────────────────────── ✕ ┐
│ … Name · Link · Icon · Opens in · Gatus key (existing) …       │
│                                                                │
│ WIDGET                                                         │
│ Type       [ Jellyfin                         ▾ ]  Suggested   │
│                                                                │
│ Address    [ http://jellyfin:8096                         ]    │
│            Leave blank to use the tile's link. If the link     │
│            goes through a login page, use the app's own        │
│            address.                                            │
│                                                                │
│ API key    [ ••••••••••••••••••••••••                     ]    │
│            In Jellyfin: Dashboard → API Keys → +.              │
│                                                                │
│ Show       (☑ playing) (☑ movies) (☑ shows)                    │
│            (☐ episodes) (☐ songs) (☐ books)          3 of 3    │
│                                                                │
│ Refresh    [ Every minute ▾ ]                                  │
│                                                                │
│ [ Test connection ]                                            │
│   ✓ Connected to Jellyfin 10.10.3.                             │
│     0 playing · 1,204 movies · 86 shows                        │
│                                                                │
│ [ Remove widget ]                                              │
│                                              [Cancel] [Save]   │
└────────────────────────────────────────────────────────────────┘
```

**Type**
- "None" plus every provider, by name. When the tile's name or library source matches one, it's preselected with a muted "Suggested" tag (AC-025). Nothing is saved until Save.
- Choosing a type reveals the rest; with "None", the section is just the Type row.

**Address**
- The placeholder is the tile's link.
- The help line exists because the most common failure is a link behind SSO. It reports as `redirect` (§6.4).

**Credentials**, by auth type:

| Auth | Fields |
|---|---|
| `api_key` | API key |
| `password` | Password, help "Use an app password: Settings → Web interface / API → App password." |
| `user_password` | Username, Password, help "Leave both blank if qBittorrent skips login for this network." |
| `token` | Token ID (`user@realm!tokenid`), Token secret, help "Make a token with the PVEAuditor role." |

**Show**
- Checkbox chips, at least 44px tall, in the provider's order. The defaults are ticked.
- At 3 ticked, the rest are disabled, and "3 of 3" explains why.
- The order on the tile is the order shown here (W-2).

**Refresh**
- Every minute (default), every 5 minutes, every 15 minutes.

**Allow self-signed certificate**
- A checkbox that appears only when the address starts with `https://`.
- For Proxmox on port 8006 it carries the hint "Proxmox uses a self-signed certificate unless you've added your own."

**Remove widget**
- A low-emphasis text button. It asks "Remove the Jellyfin widget? Its saved key is deleted." It's applied on Save, with the rest of the form.

**Last error**
- When the saved widget is in `error` or `stale`, a line sits under the heading, before Type: "Last check, 3 min ago: Jellyfin didn't accept the API key."

### 6.2 Saving

- Save writes the tile and the widget together. If the widget part fails validation, the modal stays open with the error under the field, and the tile part isn't saved either. One Save never half-applies.
- Unsaved changes get the existing "Discard changes?" confirm.

### 6.3 A key that is already saved

```
API key    Key saved                         [ Replace ]  [ Remove ]
```

- The key is never shown or prefilled. **Replace** swaps the row for an empty field, and Cancel there restores "Key saved". **Remove** clears the key on Save.
- **Changing the type or the address host** shows, under Address:
  "Changing this removes the saved key. Enter it again before you save."
  The key field opens empty. This is AC-023: a key only goes to the host it was entered for.

**No server key** (`secretKeySet: false`):

```
API key    [ (disabled)                                      ]
           To save keys, set HOMEPAD_SECRET_KEY on the server.  How ›
```

"How ›" links to `docs/widgets.md`. Test connection still works with a typed key, so the admin can check the address first; only saving the key is blocked.

### 6.4 Test connection results

The result appears inline under the button. While it runs, the button reads "Testing…" and is disabled. Success is green with ✓; failure is the existing error red with ✕. Copy, by code ({App} is the type's name):

| Code | Copy |
|---|---|
| ok | ✓ Connected to {App} {version}. *(next line: the values, as the tile will show them)* |
| `auth` (api_key) | ✕ {App} didn't accept the API key. |
| `auth` (password) | ✕ {App} didn't accept the password. |
| `auth` (user_password) | ✕ {App} didn't accept the username or password. |
| `auth` (token) | ✕ Proxmox didn't accept the token. Check the token ID and secret. |
| `unreachable` | ✕ Can't reach {App} at this address. |
| `timeout` | ✕ {App} took too long to answer. |
| `tls` | ✕ {App}'s certificate isn't trusted. If it uses a self-signed certificate, tick Allow self-signed certificate. |
| `redirect` | ✕ That address sends Homepad somewhere else, often a login page. Use the app's internal address. |
| `blocked_address` | ✕ Homepad doesn't fetch from this address. |
| `bad_response` | ✕ {App} answered, but not in a way Homepad understands. Check that the address points at {App}. |
| `unsupported_version` | ✕ Homepad needs Pi-hole 6 or newer. |
| `secret_unreadable` | ✕ Homepad can't read the saved key. Enter it again. |
| `no_secret_key` | ✕ To save keys, set HOMEPAD_SECRET_KEY on the server. |
| 429 | Wait a moment, then test again. |

The copy never includes the address, an upstream message, or a status code number. The admin typed the address and can see it.

## 7. Admin Panel → Widgets

A new section after System, under the amber "Administration" scope like the rest of the panel.

```
WIDGETS
Shown at the top of everyone's dashboard.

Clock         [● On ]    Time   (•) Device's choice  ( ) 12-hour  ( ) 24-hour

Weather       [● On ]    Place  [ Rotter                      ] [ Find ]
                                 ┌──────────────────────────────────────┐
                                 │ Rotterdam, South Holland, Netherlands│
                                 │ Rotterdam, New York, United States   │
                                 └──────────────────────────────────────┘
                         Units  (•) °C  ( ) °F
                         Weather data by Open-Meteo.com.

Web search    [● On ]    [ DuckDuckGo ▾ ]   Google · Bing · Kagi · Startpage · Custom
                         Custom address [ https://search.example/?q={query} ]
                         ☐ Kids can search the web
```

**Clock and Weather switches**
- Each saves on change, like the other System switches.
- Weather can't be turned on until a place is chosen. The switch is disabled with the hint "Choose a place first."

**Place search**
- Find or Enter runs the server's place search. Results are a list of up to 5 rows, each 44px tall. Picking one saves it and shows "Rotterdam, Netherlands ✓" in the field.
- No results: "No places found. Try a nearby town."
- Search failed: "Can't reach the weather service from the server." This also tells the admin their server has no internet access.

**Web search**
- The provider select saves on change. "Custom" reveals the address field. It needs `https://` and `{query}`, with an inline error that says which one is missing.

## 8. My settings → Show widgets

```
Show health bar      [● On ]
Show widgets         [● On ]   Numbers on tiles, and the clock and weather.
```

- It's a personal setting that saves on change (AC-031). It isn't shown to kids.

## 9. Field labels on tiles

Plain words, lower case, the number first. Fields are joined with " · ".

| Type | Fields (defaults in bold) | Example line |
|---|---|---|
| Jellyfin | **playing**, **movies**, **shows**, episodes, songs, books | 2 playing · 1,204 movies · 86 shows |
| Sonarr | **this week**, **in queue**, **missing** | 3 this week · 1 in queue · 12 missing |
| Radarr | **this week**, **in queue**, **missing** | 1 this week · 0 in queue · 4 missing |
| Pi-hole | **queries**, blocked, **% blocked**, on blocklist, **clients** | 48k queries · 12% blocked · 9 clients |
| qBittorrent | **↓**, **↑**, downloading, seeding | ↓ 4.2 MB/s · ↑ 310 kB/s |
| Proxmox VE | **VMs**, **CTs**, **CPU**, RAM, nodes | VMs 5/7 · CTs 9/9 · CPU 12% |

**Formatting**
- "VMs", "CTs", "CPU", "RAM", "↓" and "↑" go before the number, because they read as names. The others go after.
- Zero is shown as "0 playing". It's a real reading, and hiding it would look like an error.

## 10. Accessibility and copy

**Tile line**
- The line has an id, and the tile link points at it with `aria-describedby`. The link's name stays the service name, so screen-reader users hear "Sonarr, link, 3 this week, 1 in queue".
- Stale adds ". Updated 12 min ago".
- Arrows are spoken as words ("down 4.2 megabytes per second"), via a visually hidden text alternative.

**Clock and weather**
- The clock is a `<time datetime>` and is **not** a live region: announcing every minute would be noise.
- The weather group has a text alternative ("Cloudy, 8 degrees. High 9, low 3. Rotterdam."). Its icon is `aria-hidden`.

**Admin controls**
- Every new control is reachable by keyboard. Chips are real checkboxes with visible labels. A disabled chip's reason ("3 of 3") is associated through `aria-describedby`.
- The test result is a polite live region, so it's announced when it arrives.

**Motion and contrast**
- No new motion anywhere, so there's nothing for reduced motion to turn off.
- The tile line uses the status-line colours already measured AA in SPEC-tile-density. Stale doesn't fade them (§3).

**Copy rules**
- Say "widget" only in admin surfaces. Viewers just see numbers.
- Say "key", not "token" or "secret", except for Proxmox, which calls it a token.
- Never "integration", "connector" or "plugin".

## 11. Screenshot checkpoints (for TC-001…TC-011)

1. One Sonarr tile with a widget among plain tiles in Large, Compact and List, at 1440, light and dark.
2. The same at 820 (iPad portrait) and 390 (phone), Compact.
3. Compact: a widget tile offline next to one ok, and one stale.
4. The glance strip at 1440, 820 and 390, with clock and weather; and with only the clock.
5. ⌘K with an app match plus the web row; and with only the web row.
6. Tile editor Widget section: a new Jellyfin widget after a successful test; a saved key; the address-change warning; the no-server-key state; and a `redirect` error. All at 820.
7. Admin Panel → Widgets with place results open, at 820.
8. Kid dashboard at 1180×820 with the strip and plain tiles.

## 12. Decisions for Caleb

These are design calls inside the spec's §0 answers.

- **W-1: Clock size.** A calm 22px time in a slim strip. The alternative is a big wall-clock mode for a kitchen iPad, which is better as a later "Display" setting. **Recommended: 22px now.**
- **W-2: Field order.** The provider's fixed order, with checkboxes and no drag. The alternative is drag to reorder, which is more CSS and one more interaction to test, for three items. **Recommended: fixed order.**
- **W-3: Where the Widgets section sits.** After System in the Admin Panel. The alternative is a separate menu item. **Recommended: after System.**
- **W-4: Telling the admin about a broken widget on the dashboard.** Editor only in v1. The alternative is a small "!" on the tile in Arrange mode, which adds a fifth corner affordance to a crowded tile. **Recommended: editor only.**

## Sign-off

| Role | Name | Status |
|---|---|---|
| Design | Kare | Drafted 2026-11-07 |
| Product | Caleb | Pending (W-1…W-4) |
