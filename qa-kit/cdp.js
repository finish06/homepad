// qa-kit/cdp.js — reusable CDP/playwright-core helpers for real-browser UI QA.
//
// Why this exists: bug #35 (the ⋯ overflow menu unreachable by mouse + touch)
// was invisible to jsdom/vitest because jsdom has no layout, no paint, no
// hit-testing, and no real synthetic-event sequence. The defect lived *exactly*
// in that blind spot: a z-index/paint-order hit-test (an <a> painted over the
// trigger center and ate the click) plus a real-browser pointer/mouse event
// ordering quirk. You can only catch those by driving a real Chromium and
// asking the browser what it actually hit.
//
// These helpers make the two checks that would have caught #35 in one shot:
//   - gridScan(): per-point document.elementFromPoint over an element's box, so
//     "center hits the <a>, only the left strip hits the button" is visible.
//   - realTap(): a REAL touch tap (touch-enabled context + pointerType:'touch'),
//     not dispatchEvent fakery that bypasses the browser's hit-test/event-order.
//
// Requires: playwright-core (baked into the friend image) + a Chromium sidecar
// exposing the DevTools Protocol at http://127.0.0.1:9222.

const { chromium } = require("playwright-core");

const CDP_URL = process.env.CDP_URL || "http://127.0.0.1:9222";

/**
 * Resolve a CDP endpoint to a raw ws:// debugger URL, bypassing playwright's own
 * http→ws auto-resolution. Issue #344: chromium.connectOverCDP(<http url>) makes
 * playwright do its own GET /json/version discovery + websocket upgrade, and that
 * path intermittently times out (30s) against the Chrome 148 sidecar
 * (148.0.7778.97) even though a raw ws:// connect works. So we fetch
 * /json/version ourselves, read `webSocketDebuggerUrl`, and hand connectOverCDP
 * the ws:// URL directly.
 *
 * Defensive: a ws:// / wss:// URL is passed straight through, and any discovery
 * failure (unreachable, non-JSON, missing field) falls back to the original URL
 * so behaviour is never worse than handing playwright the http endpoint.
 *
 * @param {string} cdpUrl  the CDP endpoint (http:// for discovery, or ws:// direct).
 * @param {object} [opts]
 * @param {typeof fetch} [opts.fetchImpl]  injectable fetch (defaults to global fetch); for tests.
 * @returns {Promise<string>} a ws:// debugger URL, or cdpUrl unchanged on fallback.
 */
async function resolveWsEndpoint(cdpUrl, opts = {}) {
  if (/^wss?:\/\//i.test(cdpUrl)) return cdpUrl;
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  try {
    const res = await fetchImpl(cdpUrl.replace(/\/+$/, "") + "/json/version");
    if (!res || !res.ok) return cdpUrl;
    const info = await res.json();
    return info && info.webSocketDebuggerUrl ? info.webSocketDebuggerUrl : cdpUrl;
  } catch {
    return cdpUrl;
  }
}

/**
 * Connect to the Chromium sidecar over CDP and reuse its existing context.
 * Returns { browser, context }. The caller owns browser.close().
 *
 * @param {object} [opts]
 * @param {string} [opts.cdpUrl]  CDP endpoint (default http://127.0.0.1:9222 / $CDP_URL).
 * @param {Array}  [opts.cookies] cookies to addCookies() onto the context (auth-via-API).
 * @param {boolean}[opts.fresh]   force a brand-new context instead of reusing contexts()[0].
 * @param {Function}[opts.connectImpl] connector fn (default chromium.connectOverCDP); for tests.
 * @param {typeof fetch}[opts.fetchImpl] injectable fetch for ws discovery; for tests.
 */
async function connect(opts = {}) {
  const cdpUrl = opts.cdpUrl || CDP_URL;
  const connectImpl = opts.connectImpl || chromium.connectOverCDP.bind(chromium);
  // #344: connect via the resolved ws:// URL, not the bare http endpoint.
  const wsUrl = await resolveWsEndpoint(cdpUrl, { fetchImpl: opts.fetchImpl });
  const browser = await connectImpl(wsUrl);
  const context =
    opts.fresh ? await browser.newContext() : browser.contexts()[0] || (await browser.newContext());
  if (opts.cookies && opts.cookies.length) await context.addCookies(opts.cookies);
  return { browser, context };
}

// Compact, human-readable description of a DOM element for occlusion reports.
// Runs in-page (stringified), so keep it self-contained — no closures.
const DESCRIBE_FN = `(el) => {
  if (!el) return { tag: null, desc: "null" };
  const tag = el.tagName ? el.tagName.toLowerCase() : "?";
  const testid = el.getAttribute && el.getAttribute("data-testid");
  const aria = el.getAttribute && el.getAttribute("aria-label");
  const cls = (el.className && typeof el.className === "string")
    ? "." + el.className.trim().split(/\\s+/).slice(0, 2).join(".") : "";
  const cs = getComputedStyle(el);
  return {
    tag,
    testid: testid || null,
    aria: aria || null,
    desc: tag + (testid ? "[" + testid + "]" : "") + cls,
    zIndex: cs.zIndex,
    position: cs.position,
    pointerEvents: cs.pointerEvents,
  };
}`;

/**
 * Scan a grid of points across a target element's bounding box and report, per
 * point, what document.elementFromPoint(x, y) actually returns. This makes a
 * z-index/stacking occlusion (the #35 mouse bug) directly visible: if the
 * center cell reports an <a> while only edge cells report the button, the
 * trigger is occluded at the very spot a click lands.
 *
 * @param {import('playwright-core').Page} page
 * @param {string|Locator} selector  CSS selector OR a playwright Locator for the target.
 * @param {object} [opts]
 * @param {number} [opts.cols=3]   grid columns.
 * @param {number} [opts.rows=3]   grid rows.
 * @param {number} [opts.inset=0.12] fractional inset from each edge (0..0.49) so
 *                                    corner points stay inside the box.
 * @param {number} [opts.index=0]  which match to use when selector matches many.
 * @returns {Promise<object>} {
 *   ok, target:{desc,box}, cols, rows,
 *   points: [{ col,row, x,y, isCenter, hit:{...describe}, isTarget }],
 *   occluded: boolean,        // any point hits something that is NOT the target subtree
 *   centerOccluded: boolean,  // the center point specifically is occluded
 *   summary: string,          // one-line "center hits X; N/M cells hit target"
 * }
 */
async function gridScan(page, selector, opts = {}) {
  const cols = opts.cols || 3;
  const rows = opts.rows || 3;
  const inset = opts.inset == null ? 0.12 : opts.inset;
  const index = opts.index || 0;

  const locator = typeof selector === "string" ? page.locator(selector).nth(index) : selector;
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  const box = await locator.boundingBox();
  if (!box) return { ok: false, error: "target has no bounding box (not visible/attached)" };

  // Build grid points (viewport coords) with an inset so corners stay inside.
  const points = [];
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const fx = cols === 1 ? 0.5 : inset + (c / (cols - 1)) * (1 - 2 * inset);
      const fy = rows === 1 ? 0.5 : inset + (r / (rows - 1)) * (1 - 2 * inset);
      const x = Math.round(box.x + fx * box.width);
      const y = Math.round(box.y + fy * box.height);
      points.push({ col: c, row: r, x, y, isCenter: false });
    }
  }
  // Mark the geometric-center cell (or nearest) for the centerOccluded flag.
  let centerIdx = 0;
  let bestD = Infinity;
  points.forEach((p, i) => {
    const d = Math.hypot(p.x - cx, p.y - cy);
    if (d < bestD) { bestD = d; centerIdx = i; }
  });
  points[centerIdx].isCenter = true;

  // In one page.evaluate: describe the target, then hit-test every point and
  // record whether the hit element is inside the target subtree.
  const scan = await page.evaluate(
    ([coords, sel, idx, useLocatorBox, describeSrc]) => {
      const describe = eval("(" + describeSrc + ")");
      // Resolve the target element. When a Locator was passed we can't re-query
      // it in-page, so fall back to elementFromPoint at the box center and walk
      // up — but the common path passes a CSS selector.
      let targetEl = null;
      if (typeof sel === "string") targetEl = document.querySelectorAll(sel)[idx] || null;
      const targetDesc = describe(targetEl);
      const out = coords.map((pt) => {
        const hitEl = document.elementFromPoint(pt.x, pt.y);
        const hit = describe(hitEl);
        const isTarget = !!(targetEl && hitEl && (hitEl === targetEl || targetEl.contains(hitEl) || hitEl.contains(targetEl)));
        return { ...pt, hit, isTarget };
      });
      return { targetDesc, points: out, hadTargetEl: !!targetEl };
    },
    [points, typeof selector === "string" ? selector : null, index, false, DESCRIBE_FN]
  );

  const scanned = scan.points;
  const targetHits = scanned.filter((p) => p.isTarget).length;
  const centerPoint = scanned[centerIdx];
  // If we resolved the target element in-page, "occluded" = a cell hit something
  // outside the target subtree. If we couldn't (Locator passed), report the
  // distinct elements per cell so the caller can still eyeball occlusion.
  const occluded = scan.hadTargetEl ? scanned.some((p) => !p.isTarget) : false;
  const centerOccluded = scan.hadTargetEl ? !centerPoint.isTarget : false;

  const summary = scan.hadTargetEl
    ? `center→${centerPoint.hit.desc}${centerOccluded ? " (OCCLUDED)" : " (target)"}; ${targetHits}/${scanned.length} cells hit target`
    : `target not resolvable in-page (Locator); distinct hits: ${[...new Set(scanned.map((p) => p.hit.desc))].join(", ")}`;

  return {
    ok: true,
    target: { desc: scan.targetDesc.desc, zIndex: scan.targetDesc.zIndex, position: scan.targetDesc.position, box },
    cols, rows,
    points: scanned,
    occluded,
    centerOccluded,
    summary,
  };
}

/**
 * Dispatch a REAL touch tap at the center of an element: a touch-enabled context
 * driving pointerType:'touch' through page.touchscreen.tap(). This goes through
 * the browser's real hit-test and emits the real touch→pointer→(synthetic mouse)
 * event sequence — the exact ordering that the #35 touch bug lived in. It is NOT
 * el.dispatchEvent(new TouchEvent(...)) fakery, which bypasses hit-testing and
 * fabricates an event order no real device produces.
 *
 * NOTE: the page's BrowserContext must be touch-enabled (hasTouch:true) for
 * touchscreen.tap to work. When reusing the sidecar's default context you may
 * need connect({fresh:true}) on a context created with hasTouch — see README.
 *
 * @param {import('playwright-core').Page} page
 * @param {string|Locator} selector  target CSS selector or Locator.
 * @param {object} [opts] { index=0, dx=0, dy=0 } — offset from center in px.
 * @returns {Promise<object>} { ok, x, y, tapped:boolean, error? }
 */
async function realTap(page, selector, opts = {}) {
  const index = opts.index || 0;
  const locator = typeof selector === "string" ? page.locator(selector).nth(index) : selector;
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  const box = await locator.boundingBox();
  if (!box) return { ok: false, tapped: false, error: "target has no bounding box" };
  const x = Math.round(box.x + box.width / 2 + (opts.dx || 0));
  const y = Math.round(box.y + box.height / 2 + (opts.dy || 0));
  try {
    await page.touchscreen.tap(x, y);
    return { ok: true, tapped: true, x, y };
  } catch (e) {
    return { ok: false, tapped: false, x, y, error: e.message.split("\n")[0] };
  }
}

/**
 * Install a capture-phase recorder of real pointer/mouse/touch/click events and
 * the actual event.target each landed on. Read them back with readEvents(page).
 * This is how you prove WHICH element received a gesture (e.g. "pointerdown hit
 * the icon, the button got nothing") instead of guessing.
 */
async function recordEvents(page, types) {
  const evTypes = types || ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "touchstart", "touchend"];
  await page.evaluate(
    ([evTypes, describeSrc]) => {
      const describe = eval("(" + describeSrc + ")");
      window.__qaEv = [];
      evTypes.forEach((t) =>
        document.addEventListener(
          t,
          (e) => window.__qaEv.push({ type: t, target: describe(e.target).desc, x: Math.round(e.clientX || 0), y: Math.round(e.clientY || 0) }),
          true
        )
      );
    },
    [evTypes, DESCRIBE_FN]
  );
}

async function readEvents(page) {
  return page.evaluate(() => window.__qaEv || []);
}

async function clearEvents(page) {
  await page.evaluate(() => { window.__qaEv = []; });
}

module.exports = { connect, resolveWsEndpoint, gridScan, realTap, recordEvents, readEvents, clearEvents, CDP_URL };
