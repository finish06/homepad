// qa-kit/demo-gridscan.js — runnable proof that cdp.js detects occlusion.
// Drives staging, logs into homepad via the API, opens a fresh touch-enabled
// context, and grid-scans a tile-menu (⋯) button — printing per-point
// elementFromPoint so a stacking occlusion is visible. Also fires a realTap.
//
//   node qa-kit/demo-gridscan.js
//
// Env: BASE (default staging), CDP_URL (default http://127.0.0.1:9222),
//      QA_EMAIL / QA_PASSWORD (default qa@test.local / Test12345!).

const { connect, gridScan, realTap, recordEvents, readEvents, clearEvents } = require("./cdp.js");

const BASE = process.env.BASE || "http://homepad-staging.10.17.2.213.nip.io";
const EMAIL = process.env.QA_EMAIL || "qa@test.local";
const PASSWORD = process.env.QA_PASSWORD || "Test12345!";

async function loginCookie() {
  const res = await fetch(BASE + "/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const setCookie = res.headers.get("set-cookie");
  if (!res.ok || !setCookie) throw new Error("login failed " + res.status);
  const m = setCookie.match(/^([^=]+)=([^;]+)/);
  return { name: m[1], value: m[2], domain: new URL(BASE).hostname, path: "/" };
}

(async () => {
  const cookie = await loginCookie();
  // Fresh, touch-enabled context so realTap() works (sidecar default may not be).
  const { browser } = await connect({ fresh: true, cookies: [cookie] });
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 1280, height: 900 } });
  await context.addCookies([cookie]);
  const page = await context.newPage();

  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  const SEL = '[data-testid="tile-menu"]';
  const n = await page.locator(SEL).count();
  console.log("tile-menu (⋯) buttons found:", n);
  if (!n) { console.log("no tile-menu buttons — cannot demo"); await browser.close(); process.exit(2); }

  // Scan a few tiles; report occlusion per tile.
  let anyOccluded = false;
  for (const i of [0, 4, 8].filter((x) => x < n)) {
    const scan = await gridScan(page, SEL, { index: i, cols: 3, rows: 3 });
    if (!scan.ok) { console.log(`tile ${i}: gridScan error: ${scan.error}`); continue; }
    console.log(`\n=== tile ${i} — target ${scan.target.desc} (z-index:${scan.target.zIndex}, ${scan.target.position}) ===`);
    console.log("  " + scan.summary);
    // ASCII grid: T = hits target, X = occluded by something else.
    for (let r = 0; r < scan.rows; r++) {
      const row = scan.points
        .filter((p) => p.row === r)
        .map((p) => `${p.isTarget ? "T" : "X"}${p.isCenter ? "*" : " "}`)
        .join(" ");
      console.log("  " + row);
    }
    // Per-point detail for the center + any occluded cells.
    scan.points
      .filter((p) => p.isCenter || !p.isTarget)
      .forEach((p) =>
        console.log(`    (${p.x},${p.y})${p.isCenter ? " CENTER" : ""} → ${p.hit.desc}  [z:${p.hit.zIndex} pe:${p.hit.pointerEvents}]`)
      );
    if (scan.occluded) anyOccluded = true;
  }

  // realTap demo on tile 0 with event recording (proves which element the tap hits).
  await recordEvents(page);
  await clearEvents(page);
  const tap = await realTap(page, SEL, { index: 0 });
  await page.waitForTimeout(350);
  const ev = await readEvents(page);
  console.log("\n=== realTap on tile 0 ===");
  console.log("  tap:", JSON.stringify(tap));
  console.log("  events fired:", JSON.stringify(ev.map((e) => `${e.type}>${e.target}`)));
  const menuVisible = await page.locator('[role="menu"]').first().isVisible().catch(() => false);
  console.log("  [role=menu] visible after tap:", menuVisible);

  // --- Occlusion-detection proof ---------------------------------------
  // Staging currently serves the FIXED #35 bundle (button is topmost), so the
  // live scans above show no occlusion. To prove gridScan actually DETECTS the
  // #35-class stacking bug, synthetically reproduce it: paint a link-like
  // overlay over tile 0's ⋯ button center (exactly what the un-fixed tile <a>
  // did) and re-scan. The center cell must flip to OCCLUDED.
  console.log("\n=== occlusion-detection proof (synthetic #35 overlay) ===");
  await page.evaluate((sel) => {
    const btn = document.querySelectorAll(sel)[0];
    const r = btn.getBoundingClientRect();
    const a = document.createElement("a");
    a.href = "#";
    a.setAttribute("data-testid", "synthetic-occluder");
    // Cover the center but leave a left strip of the button exposed — the exact
    // signature of #35 (center eats the click, edge strip still hits button).
    Object.assign(a.style, {
      position: "fixed",
      left: r.left + r.width * 0.33 + "px",
      top: r.top + "px",
      width: r.width * 0.8 + "px",
      height: r.height + "px",
      zIndex: "9999",
      background: "transparent",
    });
    document.body.appendChild(a);
  }, SEL);
  const occScan = await gridScan(page, SEL, { index: 0, cols: 3, rows: 3 });
  console.log("  " + occScan.summary);
  for (let r = 0; r < occScan.rows; r++) {
    const row = occScan.points.filter((p) => p.row === r)
      .map((p) => `${p.isTarget ? "T" : "X"}${p.isCenter ? "*" : " "}`).join(" ");
    console.log("  " + row);
  }
  occScan.points.filter((p) => p.isCenter || !p.isTarget).forEach((p) =>
    console.log(`    (${p.x},${p.y})${p.isCenter ? " CENTER" : ""} → ${p.hit.desc}  [z:${p.hit.zIndex}]`));
  console.log(`  DETECTED occlusion: ${occScan.occluded}  | centerOccluded: ${occScan.centerOccluded}`);
  // Clean up the overlay so we leave the page as we found it.
  await page.evaluate(() => document.querySelector('[data-testid="synthetic-occluder"]')?.remove());

  const proofOk = occScan.occluded === true && occScan.centerOccluded === true;
  console.log("\n@@DEMO@@", JSON.stringify({ tiles: n, liveOccluded: anyOccluded, tapTarget: ev[0] && ev[0].target, menuVisible, occlusionDetectionProofPassed: proofOk }));
  await browser.close();
  if (!proofOk) process.exit(3);
})().catch((e) => { console.error("FATAL", e.stack); process.exit(1); });
