import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, inject, it } from 'vitest';

// SPEC-iframe-sandbox-optin AC-006 (Q4, decided) — nothing can frame Homepad,
// not even Homepad itself. Every response from every nginx config we ship
// carries
//
//   X-Frame-Options: DENY
//   Content-Security-Policy: frame-ancestors 'none'
//
// That closes the redirect path of spec §3.1: a framed app that redirects to
// one of Homepad's own pages gets a refusal, not a same-origin Homepad.
//
// nginx's add_header does NOT cascade into a location that declares its own
// add_header: the child's set replaces the parent's. So the rule this suite
// enforces is: the server level sends both, and every location with any
// add_header (after the image's snippet is expanded) sends both too.
//
// The three configs:
//   - nginx.conf + nginx-security-headers.conf: the image's own config.
//   - compose.yaml `nginx-config`: the quickstart (it replaces the image's).
//   - deploy/compose/nginx.conf: compose.build.yaml, building from source.
//
// SPEC-cleanup-18.6.0 (#529) widened the CSP from frame-ancestors alone to a
// full policy. The snippet holds the one true line; every config, and the
// homelab ConfigMap block in the spec, must carry it word for word, and its
// script hash must match the inline script the build actually ships.

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

const XFO = `add_header X-Frame-Options "DENY" always;`;

// The canonical CSP line, read from the image's snippet.
function snippetCsp(): string {
  const lines = read('nginx-security-headers.conf')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('add_header Content-Security-Policy '));
  expect(lines, 'the snippet has exactly one CSP line').toHaveLength(1);
  return lines[0];
}
const CSP = snippetCsp();
const POLICY = CSP.match(/^add_header Content-Security-Policy "([^"]+)" always;$/)?.[1] ?? '';

// "script-src 'self' 'sha256-…'" → { 'script-src': ["'self'", "'sha256-…'"] }
function directives(policy: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const part of policy.split(';').map((p) => p.trim()).filter(Boolean)) {
    const [name, ...values] = part.split(/\s+/);
    out[name] = values;
  }
  return out;
}

// sha256 source expression of every inline (no src) <script> in an HTML file.
function inlineScriptHashes(html: string): string[] {
  return [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
    (m) => `'sha256-${createHash('sha256').update(m[1], 'utf8').digest('base64')}'`,
  );
}

type Block = { name: string; directives: string[] };

// Splits a `server { … }` config into the server level and each location,
// keeping each block's OWN directives (a nested `types { }` stays inside its
// location; comments are dropped).
function blocks(conf: string): Block[] {
  const text = conf
    .split('\n')
    .map((l) => l.replace(/#.*$/, ''))
    .join('\n');
  const out: Block[] = [];
  const stack: Block[] = [];
  let buf = '';
  let quoted = false;
  for (const ch of text) {
    // A quoted header value is one token: the CSP's own `;` separators must
    // not end the directive.
    if (ch === '"') quoted = !quoted;
    if (quoted || ch === '"') {
      buf += ch;
    } else if (ch === '{') {
      // The block's name is the last line before its brace (compose.yaml puts
      // `content: |` on the lines above `server {`).
      const head = (buf.trim().split('\n').pop() ?? '').trim();
      buf = '';
      const b: Block = { name: head, directives: [] };
      stack.push(b);
      out.push(b);
    } else if (ch === '}') {
      stack.pop();
      buf = '';
    } else if (ch === ';') {
      const d = (buf + ';').trim().replace(/\s+/g, ' ');
      buf = '';
      // A directive inside `types { }` belongs to the enclosing location.
      const owner = [...stack].reverse().find((b) => b.name.startsWith('location') || b.name === 'server');
      owner?.directives.push(d);
    } else {
      buf += ch;
    }
  }
  return out.filter((b) => b.name === 'server' || b.name.startsWith('location'));
}

const SNIPPET_INCLUDE = 'include /etc/nginx/snippets/security-headers.conf;';

function expand(conf: string): string {
  return conf.split(SNIPPET_INCLUDE).join(read('nginx-security-headers.conf'));
}

// What each block is missing, as "<block>: <header>". Empty = every response
// carries both headers.
function missing(conf: string): string[] {
  const all = blocks(conf);
  const server = all.find((b) => b.name === 'server');
  if (!server) return ['no server block'];
  const gaps: string[] = [];
  for (const b of all) {
    const own = b.directives.filter((d) => d.startsWith('add_header '));
    if (b !== server && own.length === 0) continue; // inherits the server level
    for (const want of [XFO, CSP]) if (!b.directives.includes(want)) gaps.push(`${b.name}: ${want}`);
  }
  return gaps;
}

function composeNginx(): string {
  const src = read('compose.yaml');
  const start = src.indexOf('  nginx-config:');
  const end = src.indexOf('  gatus-config:');
  expect(start, 'no nginx-config block in compose.yaml').toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  // `$$` is compose's escape for a literal `$`.
  return src.slice(start, end).replace(/\$\$/g, '$');
}

const CONFIGS: [string, () => string][] = [
  ['nginx.conf (the image, through nginx-security-headers.conf)', () => expand(read('nginx.conf'))],
  ['compose.yaml nginx-config (the quickstart)', composeNginx],
  ['deploy/compose/nginx.conf (building from source)', () => read('deploy/compose/nginx.conf')],
];

describe('nothing can frame Homepad (SPEC-iframe-sandbox-optin AC-006)', () => {
  it('the security-headers snippet sends DENY and frame-ancestors none', () => {
    const snippet = read('nginx-security-headers.conf');
    expect(snippet).toContain(XFO);
    expect(snippet).toContain(CSP);
    expect(directives(POLICY)['frame-ancestors']).toEqual(["'none'"]);
  });

  it.each(CONFIGS)('%s: every response carries both headers', (_label, load) => {
    const conf = load();
    expect(blocks(conf).filter((b) => b.name.startsWith('location')).length).toBeGreaterThan(2);
    expect(missing(conf)).toEqual([]);
  });

  it.each(CONFIGS)('%s: no SAMEORIGIN is left anywhere', (_label, load) => {
    expect(load()).not.toMatch(/SAMEORIGIN/);
  });

  it.each(CONFIGS)('%s: every CSP line is the snippet\'s line, word for word', (_label, load) => {
    const lines = load()
      .split('\n')
      .filter((l) => /Content-Security-Policy/.test(l) && !/^\s*#/.test(l));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line.trim()).toBe(CSP);
  });

  it('the homelab ConfigMap block in the spec carries the same line (§7)', () => {
    const spec = read('specs/SPEC-cleanup-18.6.0.md');
    // §7 also quotes the pre-18.6.0 line, as the one to replace.
    const legacy = `add_header Content-Security-Policy "frame-ancestors 'none'" always;`;
    const lines = spec
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('add_header Content-Security-Policy ') && l !== legacy);
    expect(lines.length, 'spec §7 has the line for Joe to paste').toBeGreaterThan(0);
    for (const line of lines) expect(line).toBe(CSP);
    expect(spec).toContain('kubectl -n homepad rollout restart deployment/homepad-web');
  });

  it('the image build refuses a snippet without the frame headers or the full policy', () => {
    const docker = read('Dockerfile');
    expect(docker).toContain(`grep -q 'X-Frame-Options "DENY"' /etc/nginx/snippets/security-headers.conf`);
    expect(docker).toContain(`grep -q "frame-ancestors 'none'" /etc/nginx/snippets/security-headers.conf`);
    expect(docker).toContain(`grep -q "default-src 'self'" /etc/nginx/snippets/security-headers.conf`);
  });

  // Negative controls: the checker can fail.
  it('the checker finds a location that drops the headers by adding its own', () => {
    const conf = `server {
      ${XFO}
      ${CSP}
      location / { try_files $uri /index.html; }
      location = /version.json { add_header Cache-Control "no-store"; }
      location = /manifest.webmanifest { types { } default_type application/manifest+json; add_header X-Content-Type-Options "nosniff" always; ${XFO} }
    }`;
    expect(missing(conf)).toEqual([
      `location = /version.json: ${XFO}`,
      `location = /version.json: ${CSP}`,
      `location = /manifest.webmanifest: ${CSP}`,
    ]);
  });

  it('the checker finds a server level without the headers', () => {
    expect(missing(`server { location / { try_files $uri /index.html; } }`)).toEqual([`server: ${XFO}`, `server: ${CSP}`]);
    expect(missing(`location / { }`)).toEqual(['no server block']);
  });
});

// SPEC-cleanup-18.6.0 AC-004 — the policy allows exactly the inline script the
// build ships, by hash, and nothing inline beyond it.
describe('the CSP matches the built app (SPEC-cleanup-18.6.0 AC-004)', () => {
  const d = directives(POLICY);

  it('scripts: same-origin plus hashes only — no unsafe-inline, unsafe-eval or wildcard', () => {
    expect(d['default-src']).toEqual(["'self'"]);
    expect(d['script-src'][0]).toBe("'self'");
    for (const v of d['script-src'].slice(1)) expect(v).toMatch(/^'sha256-[A-Za-z0-9+/]+=*'$/);
    for (const name of ['script-src', 'style-src', 'default-src']) {
      for (const bad of ["'unsafe-inline'", "'unsafe-eval'", '*', 'data:', 'http:', 'https:']) {
        expect(d[name], `${name} allows ${bad}`).not.toContain(bad);
      }
    }
    expect(d['object-src']).toEqual(["'none'"]);
  });

  it('every inline script in the BUILT index.html is hash-listed, and no stale hash is left', () => {
    const built = read(resolve(inject('builtDistDir'), 'index.html'));
    const hashes = inlineScriptHashes(built);
    expect(hashes.length, 'the anti-flash script is still inline').toBeGreaterThan(0);
    expect(d['script-src'].slice(1).sort()).toEqual([...new Set(hashes)].sort());
  });

  it('the source index.html hashes the same (vite does not rewrite the script)', () => {
    expect(inlineScriptHashes(read('index.html')).sort()).toEqual(inlineScriptHashes(read(resolve(inject('builtDistDir'), 'index.html'))).sort());
  });

  // Negative control: the hasher sees a one-character edit.
  it('the hash check fails on an edited script', () => {
    const html = read('index.html').replace("'homepad.theme'", "'homepad.theme2'");
    expect(inlineScriptHashes(html)).not.toEqual(inlineScriptHashes(read('index.html')));
  });

  it('icons from any http/https origin or data:, frames of any http/https app, everything else same-origin', () => {
    expect(d['img-src']).toEqual(["'self'", 'data:', 'http:', 'https:']);
    expect(d['frame-src']).toEqual(['http:', 'https:']);
    expect(d['connect-src']).toEqual(["'self'"]);
    expect(d['form-action']).toEqual(["'self'"]);
    expect(d['base-uri']).toEqual(["'self'"]);
  });
});
