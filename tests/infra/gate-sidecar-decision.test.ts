import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decideGateCdp, GATE_CDP_ENV } from '../browser-gate/sidecar';

// #524: the gate decides ONCE whether to attach to a QA pod's CDP sidecar, and
// never falls back per worker. See tests/browser-gate/sidecar.ts.

describe('decideGateCdp (#524)', () => {
  it('reuses a decision already in the environment, without probing (workers)', () => {
    let probed = 0;
    const d = decideGateCdp({ [GATE_CDP_ENV]: 'http://127.0.0.1:9222' }, () => (probed++, false));
    expect(d).toBe('http://127.0.0.1:9222');
    expect(probed).toBe(0);
  });

  it("an inherited 'off' stays off, even if a sidecar appears later", () => {
    expect(decideGateCdp({ [GATE_CDP_ENV]: 'off' }, () => true)).toBe('off');
  });

  it('retries the probe, so one slow answer under load does not decide it', () => {
    const answers = [false, false, true];
    expect(decideGateCdp({}, () => answers.shift()!)).toBe('http://127.0.0.1:9222');
  });

  it('turns the sidecar off only after every attempt fails', () => {
    let probed = 0;
    expect(decideGateCdp({}, () => (probed++, false))).toBe('off');
    expect(probed).toBe(3);
  });

  it('PW_CDP_ENDPOINT=off forces a normal launch without probing', () => {
    let probed = 0;
    expect(decideGateCdp({ PW_CDP_ENDPOINT: 'off' }, () => (probed++, true))).toBe('off');
    expect(probed).toBe(0);
  });

  it('PW_CDP_ENDPOINT=<url> picks the endpoint that gets probed', () => {
    const seen: string[] = [];
    expect(decideGateCdp({ PW_CDP_ENDPOINT: 'http://10.0.0.5:9333' }, (e) => (seen.push(e), true))).toBe(
      'http://10.0.0.5:9333',
    );
    expect(seen).toEqual(['http://10.0.0.5:9333']);
  });
});

describe('the fixture has no per-worker probe left to race (#524)', () => {
  const fixtures = readFileSync(join(__dirname, '..', 'browser-gate', 'fixtures.ts'), 'utf8');
  const config = readFileSync(join(__dirname, '..', '..', 'playwright.gate.config.ts'), 'utf8');

  it('fixtures.ts takes the decision from decideGateCdp, not its own reachability check', () => {
    expect(fixtures).toMatch(/decideGateCdp\(process\.env\)/);
    expect(fixtures).not.toMatch(/sidecarReachable/);
  });

  it('the gate config makes the decision once and exports it to workers', () => {
    expect(config).toMatch(/process\.env\[GATE_CDP_ENV\]\s*=\s*decideGateCdp\(process\.env\)/);
  });

  it('the gate config runs one worker when attached to the sidecar', () => {
    expect(config).toMatch(/workers:\s*GATE_CDP !== 'off' \? 1 : undefined/);
  });
});
