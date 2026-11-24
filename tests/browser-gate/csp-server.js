// SPEC-cleanup-18.6.0 AC-003 (#529) — serves the BUILT app the way the image's
// nginx does, security headers included, for csp.spec.ts.
//
// `vite preview` (the rest of the gate) sends no CSP, so a page that breaks
// under the real policy would pass there. This server reads every `add_header`
// line from nginx-security-headers.conf, the snippet the image includes at
// server level and in every location, and sends them on every response. The
// policy under test is the file that ships, not a copy.
//
// It mirrors nginx.conf's routing: a real file is served as is, any other path
// gets index.html (the SPA fallback), and the manifest is
// application/manifest+json. /api/* is mocked in the browser by each test.
//
//   node tests/browser-gate/csp-server.js        # port 4175, ./dist
//   CSP_GATE_PORT=4180 CSP_GATE_DIST=out node tests/browser-gate/csp-server.js
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const dist = resolve(root, process.env.CSP_GATE_DIST ?? 'dist');
const port = Number(process.env.CSP_GATE_PORT ?? 4175);

// `add_header Name "value" always;` → [Name, value]. Comments are skipped.
function parseHeaders(conf) {
  const out = [];
  for (const raw of conf.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    const m = line.match(/^add_header\s+(\S+)\s+"([^"]*)"(?:\s+always)?;$/);
    if (m) out.push([m[1], m[2]]);
  }
  return out;
}

const headers = parseHeaders(readFileSync(resolve(root, 'nginx-security-headers.conf'), 'utf8'));
if (!headers.some(([name]) => name === 'Content-Security-Policy')) {
  throw new Error('nginx-security-headers.conf has no Content-Security-Policy line to serve');
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

function fileFor(urlPath) {
  const rel = normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, '');
  const abs = join(dist, rel);
  if (!abs.startsWith(dist)) return null;
  try {
    return statSync(abs).isFile() ? abs : null;
  } catch {
    return null;
  }
}

createServer((req, res) => {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  const file = fileFor(path) ?? join(dist, 'index.html');
  for (const [name, value] of headers) res.setHeader(name, value);
  try {
    const body = readFileSync(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found (run npm run build first)');
  }
}).listen(port, () => {
  console.log(`csp-server: ${dist} on http://localhost:${port} with ${headers.length} headers`);
});
