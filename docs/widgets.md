# Widgets

Widgets put a few useful numbers on your tiles, and a clock and the weather at
the top of the dashboard. Homepad's API server fetches every number. The
browser never talks to your apps, and your API keys never leave the server.

- [What you get](#what-you-get)
- [Turn on key storage: HOMEPAD_SECRET_KEY](#turn-on-key-storage-homepad_secret_key)
- [Add a widget to a tile](#add-a-widget-to-a-tile)
- [Where to find each key](#where-to-find-each-key)
- [Clock, weather and web search](#clock-weather-and-web-search)
- [What leaves your network](#what-leaves-your-network)
- [Who sees what](#who-sees-what)
- [When a widget breaks](#when-a-widget-breaks)

## What you get

| Widget | Shows | Needs |
|---|---|---|
| Jellyfin | playing, movies, shows, episodes, songs, books | an API key |
| Sonarr | this week, in queue, missing | an API key |
| Radarr | this week, in queue, missing | an API key |
| Clock | the time and date, in each viewer's time zone | nothing |
| Weather | the temperature, today's high and low | nothing (uses Open-Meteo) |
| Web search | a "Search the web" row in ⌘K | nothing |

Each tile shows up to three numbers. They replace the status line in Compact
and List, and add one line under the name in Large. When an app is offline,
the tile shows "Offline" as before. The status dot never changes.

Coming in a later release: Pi-hole, qBittorrent and Proxmox VE.

## Turn on key storage: HOMEPAD_SECRET_KEY

Homepad stores API keys encrypted (AES-256-GCM). The encryption key comes from
`HOMEPAD_SECRET_KEY`: 32 random bytes, written as 64 hex characters.

Add it to `.env` once:

```bash
echo "HOMEPAD_SECRET_KEY=$(openssl rand -hex 32)" >> .env
docker compose up -d
```

- Keep it with your other secrets, and back it up with your database. Without
  it, saved keys can't be read.
- If it changes or is lost, every saved key stops working. The tile editor
  says "Homepad can't read the saved key. Enter it again." Enter each key
  again; nothing else breaks.
- Without it, the clock, weather and web search still work. The key field in
  the tile editor is disabled and says how to turn it on.

## Add a widget to a tile

1. Open **Edit dashboard** from the gear, then the ✎ on the tile.
2. Under **Widget**, pick the **Type**. When the tile's name matches, the type
   is suggested for you.
3. **Address:** leave it blank to use the tile's link. If that link goes
   through a login page (SSO), use the app's own address, such as
   `http://jellyfin:8096`.
4. Paste the **API key**, pick up to three numbers under **Show**, and choose
   how often to refresh.
5. Press **Test connection**. You should see "Connected to …" and the numbers.
6. **Save.** The tile shows the numbers within a minute or two.

A saved key is never shown again: the editor shows "Key saved", with
**Replace** and **Remove**. If you change the type or the address host, the
saved key is removed, so a key only goes to the app it was entered for.

## Where to find each key

Give Homepad the least it needs. It only reads counts.

- **Jellyfin:** Dashboard → API Keys → **+**. Name it "Homepad".
- **Sonarr:** Settings → General → API Key.
- **Radarr:** Settings → General → API Key.

Coming in a later release:

- **Pi-hole (v6):** make an app password (Settings → Web interface / API → App
  password). It skips two-factor sign-in and can be revoked on its own.
- **Proxmox VE:** make an API token for a user with the **PVEAuditor** role
  (read-only). Proxmox uses a self-signed certificate unless you added your
  own, so tick **Allow self-signed certificate** for port 8006.

## Clock, weather and web search

All three start **off**. Turn them on in **Admin Panel → Widgets**.

- **Clock:** the device's 12/24-hour choice, or pick one.
- **Weather:** search for your town and pick it. Choose °C or °F. Homepad
  stores the place rounded to two decimals (about 1 km).
- **Web search:** DuckDuckGo by default, or Google, Bing, Kagi, Startpage, or
  your own `https://` address with `{query}` where the search words go. Kids
  get it only if you tick **Kids can search the web**.

Each viewer can hide the numbers and the strip for themselves in
**My settings → Show widgets**.

## What leaves your network

Only the weather. When it's on, the API server calls Open-Meteo:

- `https://api.open-meteo.com` for the forecast, every 15 minutes (96 calls a
  day, well under Open-Meteo's free limit of 10,000);
- `https://geocoding-api.open-meteo.com` when you search for a place.

The browser never calls Open-Meteo. Weather data is by
[Open-Meteo.com](https://open-meteo.com/), under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The strip always
shows an "Open-Meteo" credit link, as the licence asks. Open-Meteo's free tier
is for non-commercial use.

App widgets (Jellyfin, Sonarr, Radarr) talk only to the addresses you give
them. Homepad refuses link-local and cloud metadata addresses, follows no
redirects, and reads at most 1 MiB per answer.

## Who sees what

| | Numbers on tiles | Clock and weather | Address, username, key |
|---|---|---|---|
| Admin | yes | yes | address and username in the editor only; the key never |
| Adult | yes | yes | never |
| Kid | no | yes | never |

## When a widget breaks

The tile quietly goes back to its status line. If the numbers are old, they
show with a ◷ mark and "Updated N min ago" for screen readers. After 30
minutes with no good answer, the numbers go away.

The tile editor says what's wrong in plain words, for example "Jellyfin didn't
accept the API key" or "That address sends Homepad somewhere else, often a
login page. Use the app's internal address."
