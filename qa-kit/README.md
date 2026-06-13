# qa-kit — real-browser UI-QA helpers

Small, reusable [`playwright-core`](https://playwright.dev) helpers for driving a
headless Chromium sidecar over the DevTools Protocol (CDP) and doing **real**
UI QA — hit-testing, real touch taps, real event ordering — the things
jsdom/vitest physically cannot model.

## Why this exists (the #35 lesson)

Bug **#35** (the per-tile `⋯` overflow menu was unreachable by mouse *and*
touch) shipped past green vitest **twice**. jsdom has no layout, no paint, no
hit-testing, and no real synthetic-event sequence — and both root causes of #35
lived *exactly* in that blind spot:

- **mouse:** the `⋯` trigger and the tile `<a>` overlapped, both
  `position:static`/`z-auto`, so the link painted on top **at the button's
  center** and ate the click. A unit test can't see paint order.
- **touch:** the menu opened on `pointerup`, but the trailing *synthetic*
  `mousedown` of the same physical tap fired the outside-dismiss handler and
  self-closed the menu. A unit test can't reproduce the browser's event order.

You only catch those by driving a real browser and asking it **what it actually
hit** and **what events actually fired**. That's what `cdp.js` is for.

## Setup

`playwright-core` is baked into the friend image; a Chromium sidecar exposes CDP
at `http://127.0.0.1:9222`. No install needed. This directory is scoped to
CommonJS (`qa-kit/package.json`), so `require()` works even though the parent app
is an ES module — use `require("./cdp.js")`, not `import`.

## API — `cdp.js`

```js
const { connect, gridScan, realTap, recordEvents, readEvents, clearEvents } = require("./cdp.js");
```

### `connect(opts?) → { browser, context }`

`connectOverCDP` to the sidecar and reuse its existing context (so you inherit
sign-in state). You own `browser.close()`.

```js
const { browser, context } = await connect({ cookies: [authCookie] });
// opts: { cdpUrl, cookies, fresh }  — fresh:true forces a brand-new context
```

Auth the reliable way — POST `/api/login`, grab the `Set-Cookie`, pass it as a
cookie (selectors drift, cookies don't):

```js
const res = await fetch(BASE + "/api/login", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const sc = res.headers.get("set-cookie");
const m = sc.match(/^([^=]+)=([^;]+)/);
const authCookie = { name: m[1], value: m[2], domain: new URL(BASE).hostname, path: "/" };
```

### `gridScan(page, selector, opts?) → result`

For a target element, scan a grid of points across its bounding box and report
what `document.elementFromPoint(x, y)` **actually returns** at each point. This
makes a z-index/stacking occlusion (the #35 mouse bug) directly visible.

```js
const scan = await gridScan(page, '[data-testid="tile-menu"]', { index: 0, cols: 3, rows: 3 });
console.log(scan.summary);        // "center→a[...] (OCCLUDED); 3/9 cells hit target"
scan.occluded                     // true if ANY cell hits something outside the target
scan.centerOccluded               // true if the CENTER point specifically is occluded
scan.points                       // [{ col,row,x,y,isCenter, hit:{desc,zIndex,...}, isTarget }]
```

`opts`: `{ cols=3, rows=3, inset=0.12, index=0 }`. Pass a CSS selector (so the
target can be resolved in-page for the `isTarget`/`occluded` flags) — a `Locator`
also works but can't compute `occluded`.

A classic occluded result — the left strip still hits the button (`T`), but the
center and right hit the overlapping link (`X`), so a real click at center dies:

```
center→a[synthetic-occluder] (OCCLUDED); 3/9 cells hit target
  T  X  X
  T  X* X      (* = center cell)
  T  X  X
```

### `realTap(page, selector, opts?) → { ok, tapped, x, y }`

Dispatch a **real** touch tap via `page.touchscreen.tap()` — goes through the
browser's real hit-test and emits the real `touch → pointer → (synthetic mouse)`
sequence, the exact ordering the #35 touch bug lived in. **Not**
`el.dispatchEvent(new TouchEvent(...))` fakery.

> The context must be **touch-enabled**. Create one with `hasTouch: true`
> (`browser.newContext({ hasTouch: true })`), then `addCookies`, or the tap
> silently does nothing.

```js
const tap = await realTap(page, '[data-testid="tile-menu"]', { index: 0 }); // opts: { index, dx, dy }
```

### `recordEvents(page, types?)` / `readEvents(page)` / `clearEvents(page)`

Capture-phase recorder of real pointer/mouse/touch/click events and the actual
`event.target` each landed on — proves **which element** received a gesture
instead of guessing.

```js
await recordEvents(page);
await clearEvents(page);
await realTap(page, sel);
const ev = await readEvents(page);
// [{ type:"pointerdown", target:"button[tile-menu]...", x, y }, ...]
```

## Runnable demo

```bash
node qa-kit/demo-gridscan.js
```

Logs into staging, grid-scans live tile-menu buttons, fires a `realTap`, then
**injects a synthetic #35-style overlay and proves `gridScan` flags it**
(`occlusionDetectionProofPassed:true`). Env overrides: `BASE`, `CDP_URL`,
`QA_EMAIL`, `QA_PASSWORD`.

## Preflight first

Before trusting any UI-QA result, run the sidecar preflight — it catches a broken
browser environment (inotify/ENOSPC/fontconfig starvation, blank paint) so a
false-FAIL isn't mistaken for a real bug:

```bash
node qa-kit/preflight.js   # exits non-zero + prints why if the sidecar is untrustworthy
```
