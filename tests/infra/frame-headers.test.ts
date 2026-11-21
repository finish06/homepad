import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

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

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

const XFO = `add_header X-Frame-Options "DENY" always;`;
const CSP = `add_header Content-Security-Policy "frame-ancestors 'none'" always;`;

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
  for (const ch of text) {
    if (ch === '{') {
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
  });

  it.each(CONFIGS)('%s: every response carries both headers', (_label, load) => {
    const conf = load();
    expect(blocks(conf).filter((b) => b.name.startsWith('location')).length).toBeGreaterThan(2);
    expect(missing(conf)).toEqual([]);
  });

  it.each(CONFIGS)('%s: no SAMEORIGIN is left anywhere', (_label, load) => {
    expect(load()).not.toMatch(/SAMEORIGIN/);
  });

  it.each(CONFIGS)('%s: the CSP has the one directive (the inline anti-flash script stays allowed)', (_label, load) => {
    for (const line of load().split('\n').filter((l) => /Content-Security-Policy/.test(l) && !/^\s*#/.test(l))) {
      expect(line.trim()).toBe(CSP);
    }
  });

  it('the image build refuses a snippet without the frame headers', () => {
    const docker = read('Dockerfile');
    expect(docker).toContain(`grep -q 'X-Frame-Options "DENY"' /etc/nginx/snippets/security-headers.conf`);
    expect(docker).toContain(`grep -q "frame-ancestors 'none'" /etc/nginx/snippets/security-headers.conf`);
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
