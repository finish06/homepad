// @vitest-environment node
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// #623 — scripts/seed-qa.sh against a small in-memory fake of the Homepad
// API. The fake follows the real handlers' contract (homepad-api
// internal/api: auth.go, categories.go, services.go, admin_accounts.go,
// widgets.go, system.go): status codes, body shapes and the session cookie.
// It asserts the request sequence, the fixture it leaves behind,
// idempotency, drift repair and that every failure exits non-zero.

const root = process.cwd();
type Fixture = {
  sections: { name: string; gridWidth: number }[];
  apps: { slug: string; name: string }[];
  kids: { name: string; avatarColor: string; apps: string[] }[];
};
const fixture: Fixture = JSON.parse(readFileSync(resolve(root, 'scripts/qa-fixture.json'), 'utf8'));
const EMAIL = 'qa@example.test';
const PASSWORD = 'fake-password-for-tests';

type Cat = { id: string; name: string; sortIndex: number; gridWidth: number };
type Svc = {
  id: string; slug: string; name: string; description: string; url: string; icon: string; gatus_key: string;
  clickAction: string; iframeSameOrigin: boolean; categoryId: string | null;
};
type User = { id: string; email: string; password: string; role: string; name: string; avatarColor: string };

type Fake = {
  url: string;
  users: User[];
  cats: Cat[];
  svcs: Svc[];
  kidApps: Record<string, string[]>;
  settings: { clockEnabled: boolean; clockHour12: boolean | null; weatherEnabled: boolean };
  log: string[];
  // Hooks to break the fake on purpose: return true when the hook answered.
  override?: (req: IncomingMessage, res: ServerResponse, path: string, body: Record<string, unknown>) => boolean;
  // Silently drop a field on PATCH /api/services (a write that "succeeds").
  dropOnPatch?: string;
  registration: 'open' | 'invite_only';
};

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
});

async function startFake(opts: Partial<Pick<Fake, 'registration'>> = {}): Promise<Fake> {
  let n = 0;
  const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  const sessions = new Map<string, string>(); // token -> user id
  const fake: Fake = {
    url: '', users: [], cats: [], svcs: [], kidApps: {}, log: [], registration: opts.registration ?? 'open',
    settings: { clockEnabled: false, clockHour12: null, weatherEnabled: false },
  };

  const send = (res: ServerResponse, status: number, body?: unknown) => {
    if (body === undefined) {
      res.writeHead(status).end();
    } else if (typeof body === 'string') {
      res.writeHead(status, { 'Content-Type': 'text/plain' }).end(body + '\n');
    } else {
      res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
    }
  };
  const svcView = (s: Svc) => ({ ...s, categoryName: fake.cats.find((c) => c.id === s.categoryId)?.name ?? null, status: 'UNKNOWN' });
  const account = (u: User) => ({ id: u.id, name: u.name || u.email, role: u.role, avatarColor: u.avatarColor });

  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    const path = (req.url ?? '').split('?')[0];
    fake.log.push(`${req.method} ${path.replace(/[0-9a-f-]{36}/g, '{id}')}`);
    if (fake.override?.(req, res, path, body)) return;

    const token = /homepad_session=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
    const me = fake.users.find((u) => u.id === sessions.get(token ?? ''));
    const route = `${req.method} ${path}`;
    const m = (re: RegExp) => re.exec(route);
    let g: RegExpExecArray | null;

    if (route === 'GET /api/auth/config') {
      return send(res, 200, { oidcEnabled: false, registration: fake.registration, setupNeeded: fake.users.every((u) => u.role === 'kid') });
    }
    if (route === 'POST /api/register') {
      const adults = fake.users.filter((u) => u.role !== 'kid');
      if (adults.length && fake.registration !== 'open') return send(res, 403, 'registration is invite-only');
      if (adults.some((u) => u.email === body.email)) return send(res, 409, 'email already registered');
      const u = { id: id(), email: body.email, password: body.password, role: adults.length ? 'user' : 'admin', name: '', avatarColor: '' };
      fake.users.push(u);
      return send(res, 201, { id: u.id, email: u.email, role: u.role });
    }
    if (route === 'POST /api/login') {
      const u = fake.users.find((x) => x.role !== 'kid' && x.email === body.email && x.password === body.password);
      if (!u) return send(res, 401, 'invalid email or password');
      const t = `tok${id()}`;
      sessions.set(t, u.id);
      res.setHeader('Set-Cookie', `homepad_session=${t}; Path=/; HttpOnly; Secure; SameSite=Lax`);
      return send(res, 200, { id: u.id, email: u.email, role: u.role });
    }
    if (!me) return send(res, 401, 'unauthorized');
    if (route === 'GET /api/me') return send(res, 200, { id: me.id, email: me.email, role: me.role });
    if (route === 'POST /api/logout') {
      sessions.delete(token ?? '');
      return send(res, 204);
    }
    if (me.role !== 'admin') return send(res, 403, 'admin role required');

    if (route === 'GET /api/categories') {
      return send(res, 200, { categories: [...fake.cats].sort((a, b) => a.sortIndex - b.sortIndex) });
    }
    if (route === 'POST /api/categories') {
      if (fake.cats.some((c) => c.name === body.name)) return send(res, 409, 'a category with that name already exists');
      const c = { id: id(), name: body.name, sortIndex: fake.cats.length, gridWidth: 4 };
      fake.cats.push(c);
      return send(res, 201, c);
    }
    if (route === 'PUT /api/categories/order') {
      (body.order as string[]).forEach((cid, i) => {
        const c = fake.cats.find((x) => x.id === cid);
        if (c) c.sortIndex = i;
      });
      return send(res, 204);
    }
    if ((g = m(/^PATCH \/api\/categories\/(.+)$/))) {
      const c = fake.cats.find((x) => x.id === g![1]);
      if (!c) return send(res, 404, 'no such category');
      Object.assign(c, body);
      return send(res, 200, c);
    }
    if (route === 'GET /api/services') {
      return send(res, 200, { services: [...fake.svcs].sort((a, b) => a.name.localeCompare(b.name)).map(svcView) });
    }
    if (route === 'POST /api/services') {
      if (fake.svcs.some((s) => s.slug === body.slug)) return send(res, 409, 'a service with that slug already exists');
      if ('categoryId' in body) return send(res, 500, 'test: create does not take categoryId');
      const s: Svc = {
        id: id(), slug: body.slug, name: body.name, description: body.description ?? '', url: body.url, icon: body.icon ?? '',
        gatus_key: body.gatus_key ?? '', clickAction: body.clickAction || 'new_tab', iframeSameOrigin: body.iframeSameOrigin ?? false,
        categoryId: null,
      };
      fake.svcs.push(s);
      return send(res, 201, svcView(s));
    }
    if ((g = m(/^PATCH \/api\/services\/(.+)$/))) {
      const s = fake.svcs.find((x) => x.id === g![1]);
      if (!s) return send(res, 404, 'no such service');
      const { [fake.dropOnPatch ?? '']: _dropped, ...kept } = body;
      Object.assign(s, kept);
      return send(res, 200, svcView(s));
    }
    if (route === 'GET /api/widgets/info') {
      const st = fake.settings;
      return send(res, 200, {
        clock: { enabled: st.clockEnabled, hour12: st.clockHour12 },
        weather: { enabled: st.weatherEnabled, place: '', units: 'c', state: 'error', asOf: null },
        search: { enabled: false, name: 'DuckDuckGo', url: '' },
      });
    }
    if (route === 'PATCH /api/admin/settings') {
      Object.assign(fake.settings, body);
      return send(res, 200, { widgets: fake.settings });
    }
    if (route === 'GET /api/admin/accounts') return send(res, 200, fake.users.map(account));
    if (route === 'POST /api/admin/kids') {
      if (fake.users.some((u) => u.role === 'kid' && u.name.toLowerCase() === String(body.name).toLowerCase())) {
        return send(res, 409, 'a kid with that name already exists');
      }
      const k = { id: id(), email: '', password: '', role: 'kid', name: body.name, avatarColor: body.avatarColor ?? 'blue' };
      fake.users.push(k);
      fake.kidApps[k.id] = [];
      return send(res, 201, account(k));
    }
    if ((g = m(/^(GET|PUT|PATCH) \/api\/admin\/kids\/([^/]+)(\/services)?$/))) {
      const k = fake.users.find((u) => u.id === g![2] && u.role === 'kid');
      if (!k) return send(res, 404, 'no such kid account');
      if (g[1] === 'PATCH' && !g[3]) {
        Object.assign(k, body);
        return send(res, 200, account(k));
      }
      if (g[1] === 'GET' && g[3]) return send(res, 200, { serviceIds: fake.kidApps[k.id] });
      if (g[1] === 'PUT' && g[3]) {
        if ((body.serviceIds as string[]).some((sid) => !fake.svcs.some((s) => s.id === sid))) {
          return send(res, 400, 'serviceIds names a service that is not in the catalog');
        }
        fake.kidApps[k.id] = body.serviceIds;
        return send(res, 204);
      }
    }
    return send(res, 404, '404 page not found');
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  fake.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return fake;
}

type Run = { code: number | null; stdout: string; stderr: string };

function seed(args: string[], env: Record<string, string | undefined> = {}): Promise<Run> {
  return new Promise((done) => {
    const child = spawn('bash', [resolve(root, 'scripts/seed-qa.sh'), ...args], {
      env: { PATH: process.env.PATH, QA_EMAIL: EMAIL, QA_PASSWORD: PASSWORD, SEED_WAIT_SECONDS: '0', ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => done({ code, stdout, stderr }));
  });
}

const writes = (log: string[]) => log.filter((l) => !l.startsWith('GET '));

describe('seed-qa on an empty install (#623)', () => {
  it('registers the QA admin first, signs in, and creates the documented fixture', async () => {
    const fake = await startFake();
    const run = await seed([fake.url]);
    expect(run.stderr).toBe('');
    expect(run.code).toBe(0);

    // The admin is registered before anything else is written, then signs in.
    expect(writes(fake.log).slice(0, 2)).toEqual(['POST /api/register', 'POST /api/login']);
    expect(fake.users.find((u) => u.email === EMAIL)?.role).toBe('admin');
    expect(fake.log.at(-1)).toBe('POST /api/logout');

    // Sections, in order, with their widths.
    const cats = [...fake.cats].sort((a, b) => a.sortIndex - b.sortIndex);
    expect(cats.map((c) => [c.name, c.gridWidth])).toEqual([['Media', 6], ['Tools', 6], ['Kids', 12]]);

    // Every app, with its click action, overlay setting and section.
    const section = (s: Svc) => fake.cats.find((c) => c.id === s.categoryId)?.name ?? null;
    const apps = Object.fromEntries(fake.svcs.map((s) => [s.slug, [s.name, s.clickAction, s.iframeSameOrigin, section(s)]]));
    expect(apps).toEqual({
      'qa-movies': ['Movies', 'new_tab', false, 'Media'],
      'qa-music': ['Music', 'same_tab', false, 'Media'],
      'qa-overlay-keeps-signin': ['Overlay Keeps Sign-in', 'iframe', true, 'Tools'],
      'qa-overlay-strict': ['Overlay Strict', 'iframe', false, 'Tools'],
      'qa-kids-games': ['Kids Games', 'new_tab', false, 'Kids'],
      'qa-kids-videos': ['Kids Videos', 'new_tab', false, 'Kids'],
      'qa-notes': ['Notes', 'new_tab', false, null],
    });
    // One overlay app with the same-origin opt-in on, one with it off.
    const overlays = fake.svcs.filter((s) => s.clickAction === 'iframe');
    expect(overlays.map((s) => s.iframeSameOrigin).sort()).toEqual([false, true]);

    // The clock: on, 24-hour; the weather (which calls Open-Meteo) stays off.
    expect(fake.settings).toEqual({ clockEnabled: true, clockHour12: false, weatherEnabled: false });

    // One kid, with exactly its allowed apps.
    const kids = fake.users.filter((u) => u.role === 'kid');
    expect(kids.map((k) => [k.name, k.avatarColor])).toEqual([['QA Kid', 'green']]);
    const slugs = fake.kidApps[kids[0].id].map((sid) => fake.svcs.find((s) => s.id === sid)?.slug).sort();
    expect(slugs).toEqual(['qa-kids-games', 'qa-kids-videos', 'qa-overlay-strict']);

    expect(run.stdout).toMatch(/done: 11 created, 1 updated, 1 unchanged/);
  });

  it('never prints the QA email or password', async () => {
    const fake = await startFake();
    const run = await seed([fake.url]);
    expect(run.code).toBe(0);
    expect(run.stdout + run.stderr).not.toContain(PASSWORD);
    expect(run.stdout + run.stderr).not.toContain(EMAIL);
  });
});

describe('seed-qa is idempotent (#623)', () => {
  it('a second run signs in, writes nothing, and says so', async () => {
    const fake = await startFake();
    expect((await seed([fake.url])).code).toBe(0);
    const before = JSON.stringify([fake.users, fake.cats, fake.svcs, fake.kidApps, fake.settings]);
    fake.log.length = 0;

    const run = await seed([fake.url]);
    expect(run.code).toBe(0);
    expect(writes(fake.log)).toEqual(['POST /api/login', 'POST /api/logout']);
    expect(JSON.stringify([fake.users, fake.cats, fake.svcs, fake.kidApps, fake.settings])).toBe(before);
    expect(run.stdout).toMatch(/done: 0 created, 0 updated, 13 unchanged — already in the QA starting state/);
  });

  it('puts back what a QA run changed, and leaves everything else alone', async () => {
    const fake = await startFake();
    expect((await seed([fake.url])).code).toBe(0);
    const on = fake.svcs.find((s) => s.slug === 'qa-overlay-keeps-signin')!;
    on.iframeSameOrigin = false;
    on.name = 'Renamed by QA';
    fake.kidApps[fake.users.find((u) => u.role === 'kid')!.id] = [];
    fake.cats.forEach((c) => (c.sortIndex = 10 - c.sortIndex));
    fake.svcs.push({ ...on, id: 'extra', slug: 'made-by-qa', name: 'Extra' });

    const run = await seed([fake.url]);
    expect(run.code).toBe(0);
    expect(on.iframeSameOrigin).toBe(true);
    expect(on.name).toBe('Overlay Keeps Sign-in');
    expect(run.stdout).toMatch(/updated +section order/);
    expect(run.stdout).toMatch(/updated +kid "QA Kid" \(allowed apps\)/);
    expect(fake.svcs.some((s) => s.slug === 'made-by-qa')).toBe(true);
    expect(run.stdout).toMatch(/done: 0 created, 3 updated, 10 unchanged/);
  });
});

describe('seed-qa under concurrent runs (#633)', () => {
  // Two deploys of one preview can both see an empty install. The other run
  // registers the QA admin first, so this run's register gets the API's
  // plain-text 409 ("email already registered"). That is "already
  // registered", not "not a Homepad": sign in and carry on.
  it('treats a plain-text 409 on register as already registered, then signs in', async () => {
    const fake = await startFake();
    let raced = false;
    fake.override = (req, res, path) => {
      if (req.method === 'GET' && path === '/api/auth/config' && !raced) {
        // This run reads config before the other run's register lands.
        raced = true;
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(
          JSON.stringify({ oidcEnabled: false, registration: fake.registration, setupNeeded: true }),
        );
        fake.users.push({ id: 'qa', email: EMAIL, password: PASSWORD, role: 'admin', name: '', avatarColor: '' });
        return true;
      }
      return false;
    };
    const run = await seed([fake.url]);
    expect(run.stderr).toBe('');
    expect(run.code).toBe(0);
    expect(fake.log).toContain('POST /api/register');
    expect(run.stdout).toMatch(/already registered/);
    expect(run.stdout).toMatch(/done: /);
  });

  it('still fails when the 409 is followed by a failed sign-in', async () => {
    const fake = await startFake();
    fake.override = (req, res, path) => {
      if (req.method === 'POST' && path === '/api/register') {
        res.writeHead(409, { 'Content-Type': 'text/plain' }).end('email already registered\n');
        return true;
      }
      return false;
    };
    const run = await seed([fake.url]);
    expect(run.code).toBe(1);
    expect(run.stderr).toMatch(/QA_EMAIL could not sign in \(HTTP 401\)/);
  });
});

describe('seed-qa fails loudly (#623)', () => {
  const failed = (run: Run, why: RegExp) => {
    expect(run.code).toBe(1);
    expect(run.stderr).toMatch(/seed-qa: FAILED: /);
    expect(run.stderr).toMatch(why);
    expect(run.stdout).not.toMatch(/done:/);
  };

  it('on an unexpected HTTP status, naming the request and the status', async () => {
    const fake = await startFake();
    fake.override = (req, res, path) => {
      if (req.method !== 'POST' || path !== '/api/services') return false;
      res.writeHead(500).end('internal error');
      return true;
    };
    failed(await seed([fake.url]), /POST \/api\/services: expected HTTP 201, got 500: internal error/);
  });

  it('when someone else registered first (the QA account is not admin)', async () => {
    const fake = await startFake();
    fake.override = (_req, res, path) => {
      if (path !== '/api/register') return false;
      res.writeHead(201, { 'Content-Type': 'application/json' }).end(JSON.stringify({ role: 'user' }));
      return true;
    };
    failed(await seed([fake.url]), /got role "user", not admin: another account was created first/);
  });

  it('when the install is set up and QA_EMAIL cannot sign in', async () => {
    const fake = await startFake();
    fake.users.push({ id: 'other', email: 'someone@example.test', password: 'x', role: 'admin', name: '', avatarColor: '' });
    const run = await seed([fake.url]);
    failed(run, /QA_EMAIL could not sign in \(HTTP 401\)/);
    expect(fake.log).not.toContain('POST /api/register');
  });

  it('when the QA account exists but is not admin', async () => {
    const fake = await startFake();
    fake.users.push({ id: 'first', email: 'first@example.test', password: 'x', role: 'admin', name: '', avatarColor: '' });
    fake.users.push({ id: 'qa', email: EMAIL, password: PASSWORD, role: 'user', name: '', avatarColor: '' });
    failed(await seed([fake.url]), /signed in but is role "user", not admin/);
  });

  it('when a write "succeeds" but the fixture does not read back', async () => {
    const fake = await startFake();
    fake.dropOnPatch = 'iframeSameOrigin';
    // A fresh create still stores it; make the stored value drift so only the
    // (silently ignored) PATCH could put it back.
    expect((await seed([fake.url])).code).toBe(0);
    fake.svcs.find((s) => s.slug === 'qa-overlay-keeps-signin')!.iframeSameOrigin = false;
    failed(await seed([fake.url]), /still differs from the fixture:\n {2}- app "qa-overlay-keeps-signin" differs: iframeSameOrigin/);
  });

  it('when the URL answers with something that is not the API (an HTML page)', async () => {
    const fake = await startFake();
    fake.override = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>Homepad</title>');
      return true;
    };
    failed(await seed([fake.url]), /GET \/api\/auth\/config: HTTP 200 but the body is not JSON/);
  });

  it('when nothing answers at the URL', async () => {
    const fake = await startFake();
    await new Promise((r) => servers.pop()!.close(r));
    failed(await seed([fake.url]), /GET \/api\/auth\/config: request failed/);
  });

  it('with exit 2 on a missing URL or missing credentials', async () => {
    expect((await seed([])).code).toBe(2);
    expect((await seed(['not a url'])).code).toBe(2);
    const noEmail = await seed(['http://127.0.0.1:9'], { QA_EMAIL: undefined });
    expect(noEmail.code).toBe(2);
    expect(noEmail.stderr).toMatch(/QA_EMAIL is not set/);
    expect((await seed(['http://127.0.0.1:9'], { QA_PASSWORD: '' })).code).toBe(2);
  });
});

describe('docs/qa-seed.md describes the fixture the script creates (#623)', () => {
  const doc = readFileSync(resolve(root, 'docs/qa-seed.md'), 'utf8');

  it.each(fixture.sections.map((s) => s.name))('names section "%s"', (name) => {
    expect(doc).toContain(`**${name}**`);
  });

  it.each(fixture.apps.map((a): [string, string] => [a.name, a.slug]))(
    'names app "%s" and its slug %s',
    (name, slug) => {
      expect(doc).toContain(`**${name}**`);
      expect(doc).toContain(`\`${slug}\``);
    },
  );

  it('names the kid, its color and every allowed app', () => {
    for (const kid of fixture.kids) {
      expect(doc).toContain(`**${kid.name}**`);
      expect(doc).toContain(kid.avatarColor);
      for (const slug of kid.apps) expect(doc).toContain(`\`${slug}\``);
    }
  });

  it('says how CI runs it and that the credentials come from the environment', () => {
    expect(doc).toContain('bash scripts/seed-qa.sh');
    expect(doc).toContain('QA_EMAIL');
    expect(doc).toContain('QA_PASSWORD');
  });
});
