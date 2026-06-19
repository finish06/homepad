// qa-kit/cdp-smoke.js — the #56 regression smoke: prove connectOverCDP to the
// Chrome 148 sidecar actually completes its protocol handshake (no timeout).
//
// #56's symptom: playwright-core too old for the sidecar's Chrome → the CDP
// WebSocket opens but connectOverCDP hangs on the handshake until it times out,
// so `qa-kit/preflight.js` falsely reports the sidecar down. Unlike preflight,
// this smoke needs NO staging app and NO auth — it only checks the connect path
// and the browser version, so it isolates the playwright↔Chrome compatibility
// that #56 is about.
//
//   node qa-kit/cdp-smoke.js
//
// Exit 0 + "@@CDP-SMOKE@@ {ok:true,...}" on success; non-zero on timeout/mismatch.
// Env: CDP_URL (default http://127.0.0.1:9222).

const { connect, CDP_URL } = require("./cdp.js");

// The sidecar runs Chrome 148; 1.60 is the first Playwright bundling Chromium
// 148. A connect that succeeds against a major >= this proves the fix.
const MIN_CHROME_MAJOR = 148;
const CONNECT_TIMEOUT_MS = 15000;

function fail(reason) {
  console.error("CDP-SMOKE FAIL:", reason);
  console.log("@@CDP-SMOKE@@", JSON.stringify({ ok: false, reason }));
  process.exit(1);
}

(async () => {
  const t0 = Date.now();
  let browser;

  // The handshake hang #56 describes manifests as connectOverCDP never
  // resolving — guard it with an explicit race so a regression FAILS fast and
  // loud instead of hanging the QA run.
  try {
    const connectP = connect({ fresh: false });
    const timeoutP = new Promise((_, rej) =>
      setTimeout(() => rej(new Error(`connectOverCDP did not handshake within ${CONNECT_TIMEOUT_MS}ms (the #56 timeout)`)), CONNECT_TIMEOUT_MS),
    );
    ({ browser } = await Promise.race([connectP, timeoutP]));
  } catch (e) {
    fail(`cannot connectOverCDP to sidecar at ${CDP_URL}: ${e.message.split("\n")[0]}`);
  }
  const connectMs = Date.now() - t0;

  try {
    // version() returns e.g. "148.0.7778.97" — the real proof the playwright
    // build can speak this Chrome's protocol.
    const version = browser.version();
    const major = Number(String(version).split(".")[0]);
    const pwc = require("playwright-core/package.json").version;

    if (!Number.isFinite(major)) fail(`could not parse Chrome version from "${version}"`);
    if (major < MIN_CHROME_MAJOR) {
      fail(`sidecar Chrome ${version} is below expected ${MIN_CHROME_MAJOR} — wrong sidecar?`);
    }

    console.log(`CDP-SMOKE OK — connectOverCDP handshook in ${connectMs}ms`);
    console.log(`  sidecar Chrome: ${version} (major ${major}, >= ${MIN_CHROME_MAJOR})`);
    console.log(`  playwright-core: ${pwc}`);
    console.log("@@CDP-SMOKE@@", JSON.stringify({ ok: true, connectMs, chrome: version, chromeMajor: major, playwrightCore: pwc }));
    await browser.close();
    process.exit(0);
  } catch (e) {
    try { await browser.close(); } catch {}
    fail(`(unexpected) ${e.message.split("\n")[0]}`);
  }
})();
