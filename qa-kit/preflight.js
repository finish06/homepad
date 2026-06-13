// qa-kit/preflight.js — 10-second sidecar trust check. STEP 1 of every UI-QA run.
//
// Why: a FAIL is only trustworthy if the browser environment is trustworthy. The
// #35 detour burned time chasing a "flaky browser" that turned out to be a real
// infra bug — a 128 per-uid inotify ceiling shared between procs and the friend
// Chromium sidecars (since fixed). When the sidecar is starved (inotify/ENOSPC/
// too-many-open-files) or the fonts can't cache, the browser degrades or fails
// to paint — and a false-FAIL looks exactly like a real bug. Run this FIRST so a
// broken harness is caught up front, not mistaken for a defect.
//
// Checks (exit non-zero + print WHY on any failure):
//   (a) no ENOSPC / EMFILE "too many open files" / inotify / fontconfig
//       "no writable cache" errors degrading the browser,
//   (b) a page actually PAINTS (navigate + non-empty render),
//   (c) a KNOWN-GOOD control interaction passes (open the header user-menu —
//       proven-good — so we know the harness can dispatch a working click).
//
//   node qa-kit/preflight.js
//
// Env: BASE, CDP_URL, QA_EMAIL, QA_PASSWORD.

const { connect } = require("./cdp.js");

const BASE = process.env.BASE || "http://homepad-staging.10.17.2.213.nip.io";
const EMAIL = process.env.QA_EMAIL || "qa@test.local";
const PASSWORD = process.env.QA_PASSWORD || "Test12345!";

// Substrings that mean the browser environment is degraded, not the app.
const DEGRADE_SIGNATURES = [
  "ENOSPC",
  "EMFILE",
  "too many open files",
  "inotify",
  "No space left on device",
  "Failed to create",            // renderer/GPU process spawn failures
  "fontconfig",
  "Fontconfig error",
  "no writable cache",
  "cannot load default config file",
];

function matchDegrade(text) {
  if (!text) return null;
  const low = text.toLowerCase();
  return DEGRADE_SIGNATURES.find((s) => low.includes(s.toLowerCase())) || null;
}

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

function fail(reason) {
  console.error("PREFLIGHT FAIL:", reason);
  console.log("@@PREFLIGHT@@", JSON.stringify({ ok: false, reason }));
  process.exit(1);
}

(async () => {
  const degradeHits = [];
  let browser;

  // --- connect ----------------------------------------------------------
  try {
    ({ browser } = await connect({ fresh: true }));
  } catch (e) {
    fail(`(setup) cannot connectOverCDP to the sidecar: ${e.message.split("\n")[0]}`);
  }

  try {
    const cookie = await loginCookie();
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addCookies([cookie]);

    // Capture any browser-surfaced degradation signatures.
    const page = await context.newPage();
    page.on("console", (m) => { const s = matchDegrade(m.text()); if (s) degradeHits.push(`console: ${s} :: ${m.text().slice(0, 160)}`); });
    page.on("pageerror", (e) => { const s = matchDegrade(e.message); if (s) degradeHits.push(`pageerror: ${s} :: ${e.message.slice(0, 160)}`); });
    page.on("crash", () => degradeHits.push("page crashed (renderer died — classic resource starvation symptom)"));

    // --- (b) page actually paints ---------------------------------------
    let nav;
    try {
      nav = await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 20000 });
    } catch (e) {
      const sig = matchDegrade(e.message);
      fail(`(b) navigation failed${sig ? ` [${sig}]` : ""}: ${e.message.split("\n")[0]}`);
    }
    if (!nav || !nav.ok()) fail(`(b) navigation returned HTTP ${nav ? nav.status() : "no response"} — app not serving`);
    await page.waitForTimeout(700);

    const paint = await page.evaluate(() => {
      const b = document.body;
      return {
        bodyChildren: b ? b.children.length : 0,
        clientHeight: b ? b.clientHeight : 0,
        textLen: b ? (b.innerText || "").trim().length : 0,
      };
    });
    // A real paint has DOM children, non-zero layout height, and visible text.
    if (paint.bodyChildren < 1 || paint.clientHeight < 50 || paint.textLen < 5) {
      fail(`(b) page did not paint a real render: ${JSON.stringify(paint)}`);
    }
    // Screenshot must be non-trivial (blank/failed paint compresses to a few KB).
    const shot = await page.screenshot({ fullPage: false });
    if (shot.length < 2000) fail(`(b) screenshot is suspiciously small (${shot.length}B) — likely blank paint`);

    // --- (c) known-good control interaction -----------------------------
    // The header user-menu is proven-good. If a real click here doesn't open it,
    // the harness can't dispatch a working click — so NO ui result is trustworthy.
    const trigger = page.locator('[data-testid="user-menu-trigger"]');
    if (!(await trigger.count())) fail("(c) control missing: [data-testid=user-menu-trigger] not found (wrong page/auth?)");
    await trigger.first().click({ timeout: 5000 }).catch((e) => fail(`(c) control click threw: ${e.message.split("\n")[0]}`));
    await page.waitForTimeout(350);
    const menuOpen = await page.locator('[data-testid="user-menu"]').first().isVisible().catch(() => false);
    if (!menuOpen) fail("(c) known-good control FAILED: clicking user-menu-trigger did not open [data-testid=user-menu] — harness cannot dispatch a working click; a UI FAIL right now is NOT trustworthy");

    // --- (a) degradation signatures -------------------------------------
    if (degradeHits.length) {
      fail(`(a) browser-environment degradation detected:\n  - ${degradeHits.join("\n  - ")}`);
    }

    console.log("PREFLIGHT OK — sidecar trustworthy:");
    console.log("  (a) no degradation signatures (ENOSPC/EMFILE/inotify/fontconfig)");
    console.log(`  (b) page painted: ${JSON.stringify(paint)}, screenshot ${shot.length}B`);
    console.log("  (c) known-good control: user-menu opened on a real click");
    console.log("@@PREFLIGHT@@", JSON.stringify({ ok: true, paint, screenshotBytes: shot.length, controlOpened: true }));
    await browser.close();
    process.exit(0);
  } catch (e) {
    try { await browser.close(); } catch {}
    fail(`(unexpected) ${e.stack ? e.stack.split("\n").slice(0, 2).join(" | ") : e.message}`);
  }
})();
