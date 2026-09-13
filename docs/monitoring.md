# Connecting a status source

Homepad's tiles can show whether each service is up, slow or down. That
information comes from [Gatus](https://gatus.io), a small self-hosted uptime
checker. Homepad's backend polls Gatus every 30 seconds and the browser never
talks to Gatus directly, so nothing about your monitoring setup is exposed to
the page.

Until a status source is connected, the health panel reads **"Status is not
being checked"** and every tile shows *Not monitored*. Tiles still launch; they
just cannot report. This page is the way out of that state.

There are three steps: run Gatus, tell Homepad where it is, and give each tile
the name of its Gatus endpoint.

## 1. Run Gatus

If you started Homepad with the bundled Docker Compose stack, **Gatus is already
running** — the `gatus` service in `compose.yaml` — and its config is
`deploy/compose/gatus.yaml`. Skip to step 3.

Otherwise, run Gatus anywhere the Homepad API can reach it. A minimal config:

```yaml
# gatus.yaml
storage:
  type: memory

endpoints:
  - name: jellyfin
    group: media
    url: "http://jellyfin:8096/health"
    interval: 30s
    conditions:
      - "[STATUS] == 200"

  - name: gitea
    group: code
    url: "https://gitea.example.com/api/healthz"
    interval: 30s
    conditions:
      - "[STATUS] == 200"
      - "[RESPONSE_TIME] < 800"
```

```bash
docker run -d --name gatus -p 8081:8080 \
  -v "$PWD/gatus.yaml:/config/config.yaml" \
  ghcr.io/twin/gatus:latest
```

Each entry under `endpoints` is one check. `conditions` decide pass or fail;
`[STATUS] == 200` is enough for most services. Any failed condition — including
a `[RESPONSE_TIME]` one — makes the check fail, so the tile reads *Offline*. A
check that **passes but is slow** reads *Slow* instead: Homepad marks a
successful check slower than `GATUS_DEGRADED_MS` (default 1000 ms) as degraded.
Set it to `0` on the API to turn that off.
The full condition reference is in the
[Gatus documentation](https://gatus.io/docs).

## 2. Point Homepad at it

Set one environment variable on the **Homepad API** (not the web container):

```dotenv
GATUS_BASE_URL=http://gatus:8080
```

Use whatever address the API container can reach Gatus on — a Compose service
name, a Kubernetes service, or a plain host and port. Restart the API after
changing it. The value is never sent to the browser.

In the Compose stack this is already set in `.env.example`.

## 3. Give each tile its Gatus key

Gatus identifies every endpoint by a **key** built from its group and name:

```
<group>_<name>
```

with each part lower-cased, and `/`, `_`, `,`, `.` and `#` inside a part
replaced by `-` (a space becomes `+`). The two examples above have the keys
`media_jellyfin` and `code_gitea`. An endpoint with no group uses `_<name>`, for
example `_jellyfin`.

If you are unsure of a key, Gatus lists them all:

```bash
curl -s http://localhost:8081/api/v1/endpoints/statuses | grep -o '"key":"[^"]*"'
```

Then in Homepad, open the tile's **Edit tile** dialog (from the dashboard's
edit mode, or the entry in the Admin Panel's catalog) and paste the key into the
**Gatus key** field. Save. Within about 30 seconds the tile's status dot picks up the result
and the health panel starts reporting.

Leave the field blank for anything you do not want checked — the tile keeps
working and simply reads *Not monitored*.

## What the states mean

| Tile reads | Meaning |
|---|---|
| **Online** | The most recent Gatus check passed. |
| **Slow** | The most recent check passed but took longer than `GATUS_DEGRADED_MS` (default 1 s). |
| **Offline** | The most recent check failed. |
| **Unknown** | A key is set but Gatus has no result for it: the key is misspelt, the endpoint is not in Gatus's config, or Gatus itself is unreachable. |
| **Not monitored** | No key is set. |

If *every* tile with a key reads **Unknown**, the API cannot reach Gatus — check
`GATUS_BASE_URL` and the API logs.

## Checking it worked

The health panel at the top of the dashboard is the quickest tell: once at
least one tile has a working key, its headline changes from "Status is not
being checked" to a live verdict, and the meter strip appears with one tick per
service.

The panel also shows when the status was last read. If that label turns red
and the headline changes to "Status is N minutes old", the API has stopped
getting fresh results from Gatus — the panel keeps showing the last confirmed
state rather than pretending it is current.
