import { execSync } from 'node:child_process';

// Whether the gate runs against the QA pod's Chromium CDP sidecar is decided ONCE,
// in the main Playwright process, and handed to every worker through the
// environment (#524).
//
// It used to be decided per worker, in fixtures.ts, with a single 2s curl. On a
// QA pod running 3 workers against one sidecar, that probe sometimes missed
// under load. The worker then quietly launched Playwright's bundled browser,
// which the pod can't run, and died with `libglib-2.0.so.0` missing (#507). The
// failure named the wrong cause, and it hit at random depending on which
// worker's probe lost the race.
//
// Now: probe with retries, once. If a sidecar is found, every worker attaches to
// it and NEVER falls back. If the sidecar can't be reached later, that's a loud
// error that says so, not a crash in a browser nobody meant to launch.

/** Env var carrying the decision to workers: a CDP endpoint, or 'off'. */
export const GATE_CDP_ENV = 'HOMEPAD_GATE_CDP';

const DEFAULT_ENDPOINT = 'http://127.0.0.1:9222';

export type Probe = (endpoint: string) => boolean;

export const curlProbe: Probe = (endpoint) => {
  try {
    execSync(`curl -sf --max-time 5 ${endpoint.replace(/\/+$/, '')}/json/version`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

/**
 * Decide, once, which browser the gate uses. Returns the CDP endpoint to attach
 * to, or 'off' for Playwright's normal launch.
 * - An existing decision in `env` is reused, because workers re-load the config.
 * - PW_CDP_ENDPOINT=off forces a normal launch. PW_CDP_ENDPOINT=<url> picks the
 *   endpoint to probe.
 */
export function decideGateCdp(
  env: Record<string, string | undefined>,
  probe: Probe = curlProbe,
  attempts = 3,
): string {
  const decided = env[GATE_CDP_ENV];
  if (decided) return decided;
  if (env.PW_CDP_ENDPOINT === 'off') return 'off';
  const endpoint = env.PW_CDP_ENDPOINT ?? DEFAULT_ENDPOINT;
  for (let i = 0; i < attempts; i++) {
    if (probe(endpoint)) return endpoint;
  }
  return 'off';
}
