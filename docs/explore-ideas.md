# Homepad — Explore Ideas

Dated product ideas for future consideration. Not specs — just prompts for later discussion.

---

- **2026-06-14 — Idea #2:** Mini uptime sparkline on each tile, showing the last N check results as a compact dot-strip (green/red), plus a rolling uptime percentage (e.g. "98% / 20 checks"). *Prompted by: `homepad-api/internal/gatus/poller.go` `FetchAll()` already receives Gatus's full `results[]` array (20 historical checks per endpoint) on every poll but only reads the last result and discards the rest — the history is free to use.* The sparkline would make the status badge far more informative (is a DOWN blip one flap or a multi-hour outage?) at zero extra network cost, since the data is already in each poll response.
