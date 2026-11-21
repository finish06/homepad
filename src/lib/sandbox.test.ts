import { describe, expect, it } from 'vitest';
import { addressKind, sandboxFor } from './sandbox';

// SPEC-iframe-sandbox-optin §2.1, §2.3 — the overlay's sandbox. It keeps the
// app's own origin (allow-same-origin) only when an admin opted the app in AND
// the app is on another origin than this Homepad. An address that can't be
// parsed counts as Homepad's own (fail closed).

const HOME = 'https://home.example';
const STRICT = 'allow-scripts allow-forms allow-popups';
const KEEP = 'allow-scripts allow-same-origin allow-forms allow-popups';

describe('addressKind (§2.3)', () => {
  it.each([
    ['https://grafana.home.example', 'other'],
    ['https://home.example:8443/', 'other'], // another port
    ['http://home.example/', 'other'], // another scheme
    ['https://sub.home.example/x', 'other'], // a sibling subdomain is another origin
    ['https://home.example', 'same'],
    ['https://home.example/grafana/', 'same'],
    ['https://HOME.example:443/x?y#z', 'same'], // case and the default port normalize
    ['', 'unparseable'],
    ['   ', 'unparseable'],
    ['grafana', 'unparseable'],
    ['/grafana/', 'unparseable'], // a bare path is not a full address
    ['//grafana.home.example', 'unparseable'],
    ['https://', 'unparseable'],
    ['javascript:alert(1)', 'unparseable'], // safeHref turns it into '#'
    ['ftp://files.example', 'unparseable'],
  ])('%s is %s', (url, kind) => {
    expect(addressKind(url, HOME)).toBe(kind);
  });

  it("defaults to this page's origin", () => {
    expect(addressKind(window.location.origin + '/x')).toBe('same');
    expect(addressKind('https://elsewhere.example')).toBe('other');
  });
});

describe('sandboxFor (§2.1)', () => {
  it('AC-001 — off: the strict sandbox', () => {
    expect(sandboxFor({ url: 'https://grafana.example', iframeSameOrigin: false }, HOME)).toBe(STRICT);
  });

  it('AC-001 — absent (an older server) reads as off', () => {
    expect(sandboxFor({ url: 'https://grafana.example' }, HOME)).toBe(STRICT);
  });

  it('AC-002 — on, another origin: keeps the app origin', () => {
    expect(sandboxFor({ url: 'https://grafana.example', iframeSameOrigin: true }, HOME)).toBe(KEEP);
  });

  it("AC-004 — on, Homepad's own origin: the opt-in is ignored", () => {
    expect(sandboxFor({ url: 'https://home.example/grafana/', iframeSameOrigin: true }, HOME)).toBe(STRICT);
  });

  it("AC-004 — on, an address that can't be parsed: fail closed", () => {
    for (const url of ['', 'grafana', '/grafana', 'javascript:alert(1)']) {
      expect(sandboxFor({ url, iframeSameOrigin: true }, HOME), url).toBe(STRICT);
    }
  });

  it('defaults to this page origin', () => {
    expect(sandboxFor({ url: window.location.origin + '/app', iframeSameOrigin: true })).toBe(STRICT);
    expect(sandboxFor({ url: 'https://elsewhere.example', iframeSameOrigin: true })).toBe(KEEP);
  });

  // AC-003 — every combination: no sandbox may let the frame navigate the top
  // page or open popups that escape the sandbox, and nothing but the four
  // known tokens ever appears.
  it('AC-003 — no combination ever escapes the sandbox', () => {
    const urls = ['https://grafana.example', 'https://home.example/x', 'http://home.example', '', 'nope', '/p', '#'];
    const settings = [true, false, undefined];
    const allowed = new Set(['allow-scripts', 'allow-same-origin', 'allow-forms', 'allow-popups']);
    let n = 0;
    for (const url of urls) {
      for (const iframeSameOrigin of settings) {
        const tokens = sandboxFor({ url, iframeSameOrigin }, HOME).split(' ');
        for (const banned of ['allow-top-navigation', 'allow-top-navigation-by-user-activation', 'allow-popups-to-escape-sandbox']) {
          expect(tokens, `${url} ${iframeSameOrigin}`).not.toContain(banned);
        }
        for (const tok of tokens) expect(allowed.has(tok), tok).toBe(true);
        expect(tokens).toContain('allow-scripts');
        n++;
      }
    }
    expect(n).toBe(urls.length * settings.length);
  });
});
