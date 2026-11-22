#!/usr/bin/env node
/* global AbortSignal */
// QA seed (#623): turn a fresh, empty Homepad into the known QA starting
// state described in docs/qa-seed.md, through the public HTTP API only.
//
//   QA_EMAIL=… QA_PASSWORD=… node scripts/seed-qa.js <homepad-url>
//   (CI calls the wrapper: bash scripts/seed-qa.sh <homepad-url>)
//
// <homepad-url> is the address the web app is served on; the API is at
// <homepad-url>/api/…. The fixture itself is scripts/qa-fixture.json.
//
// - The first adult to register on an empty install becomes admin, so the QA
//   admin is registered first, then signed in. No SQL, no dump: the seed stays
//   valid across migrations.
// - Idempotent and converging: sections and the kid match by name, apps by
//   slug (the catalog's unique key). Missing items are created; items that
//   drifted from the fixture are put back; a second run writes nothing.
//   Anything else on the install is left alone.
// - Fails loudly: any unexpected HTTP status, a non-JSON answer, a QA admin
//   that can't sign in or isn't admin, or a fixture that doesn't read back
//   exactly after seeding exits 1 with the reason. Usage errors exit 2.
// - Never prints QA_EMAIL or QA_PASSWORD, and never sends them anywhere but
//   POST /api/register and POST /api/login.
//
// Plain Node (>= 20, built-in fetch), no dependencies, so it runs on any CI
// runner that has node without an `npm ci` first.

import { readFileSync } from 'node:fs';

const FIXTURE = JSON.parse(readFileSync(new URL('./qa-fixture.json', import.meta.url), 'utf8'));
const REQUEST_TIMEOUT_MS = 15000;
const SESSION_COOKIE = 'homepad_session';

class SeedError extends Error {}
class UsageError extends Error {}

const log = (msg) => console.log(`seed-qa: ${msg}`);

// --- HTTP -------------------------------------------------------------------

function client(base) {
  let cookie = '';

  async function call(method, path, { body, expect, auth = true, quiet = false } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth) {
      if (!cookie) throw new SeedError(`${method} ${path}: no session (sign-in did not happen)`);
      headers.Cookie = `${SESSION_COOKIE}=${cookie}`;
    }
    let res;
    try {
      res = await fetch(base + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'manual',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      const why = err?.cause?.code || err?.cause?.message || err?.message || String(err);
      const e = new SeedError(`${method} ${path}: request failed (${why})`);
      e.network = true;
      throw e;
    }
    // The API re-issues the session cookie when its expiry slides; keep up.
    for (const sc of res.headers.getSetCookie()) {
      const m = sc.match(new RegExp(`^${SESSION_COOKIE}=([^;]*)`));
      if (m) cookie = m[1];
    }
    const text = await res.text();
    if (!expect.includes(res.status)) {
      const e = new SeedError(
        `${method} ${path}: expected HTTP ${expect.join(' or ')}, got ${res.status}` +
          (quiet ? '' : `: ${text.trim().slice(0, 200) || '(empty body)'}`),
      );
      e.status = res.status;
      throw e;
    }
    let json = null;
    if (text.trim() !== '') {
      try {
        json = JSON.parse(text);
      } catch {
        throw new SeedError(
          `${method} ${path}: HTTP ${res.status} but the body is not JSON — is ${base} a Homepad address?`,
        );
      }
    }
    return { status: res.status, json };
  }

  return { call, hasSession: () => cookie !== '' };
}

// The preview's pods can report ready a moment before the web proxy reaches
// the API. Wait for GET /api/auth/config, retrying only "not up yet" answers.
async function waitForApi(http, waitSeconds) {
  const deadline = Date.now() + waitSeconds * 1000;
  for (;;) {
    try {
      return (await http.call('GET', '/api/auth/config', { expect: [200], auth: false })).json;
    } catch (err) {
      const notUp = err.network || [502, 503, 504].includes(err.status);
      if (!notUp || Date.now() >= deadline) throw err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

// --- sign-in ----------------------------------------------------------------

async function signIn(http, email, password, waitSeconds) {
  const config = await waitForApi(http, waitSeconds);
  if (typeof config?.setupNeeded !== 'boolean') {
    throw new SeedError('GET /api/auth/config: no setupNeeded field — is this a Homepad API?');
  }

  let how;
  if (config.setupNeeded) {
    // Empty install: the first adult registered becomes admin, in every mode.
    // 409 = this email won a race to register; 403 = another account won it
    // (invite_only). Either way, the sign-in below decides.
    const r = await http.call('POST', '/api/register', {
      body: { email, password },
      expect: [201, 403, 409],
      auth: false,
    });
    if (r.status === 201 && r.json?.role !== 'admin') {
      throw new SeedError(
        `registered QA_EMAIL but it got role "${r.json?.role}", not admin: another account was created first. ` +
          'This install is not in the QA starting state; start from an empty database.',
      );
    }
    how = r.status === 201 ? 'registered as the first account (admin)' : 'already registered';
  } else {
    how = 'install already set up';
  }

  let login;
  try {
    login = await http.call('POST', '/api/login', { body: { email, password }, expect: [200], auth: false, quiet: true });
  } catch (err) {
    if (err.status === 401) {
      throw new SeedError(
        'QA_EMAIL could not sign in (HTTP 401). The install already has accounts and this email/password is not ' +
          'one of them: someone else registered first, or QA_PASSWORD is not the password it was created with.',
      );
    }
    throw err;
  }
  if (!http.hasSession()) throw new SeedError(`POST /api/login: 200 but no ${SESSION_COOKIE} cookie was set`);
  if (login.json?.role !== 'admin') {
    throw new SeedError(
      `QA_EMAIL signed in but is role "${login.json?.role}", not admin: another account was created first.`,
    );
  }
  const me = await http.call('GET', '/api/me', { expect: [200] });
  if (me.json?.role !== 'admin') throw new SeedError(`GET /api/me: role "${me.json?.role}", expected admin`);
  log(`QA admin: ${how}; signed in as admin`);
}

// --- reading the current state ----------------------------------------------

async function readState(http) {
  const categories = (await http.call('GET', '/api/categories', { expect: [200] })).json?.categories;
  const services = (await http.call('GET', '/api/services', { expect: [200] })).json?.services;
  const info = (await http.call('GET', '/api/widgets/info', { expect: [200] })).json;
  const accounts = (await http.call('GET', '/api/admin/accounts', { expect: [200] })).json;
  if (!Array.isArray(categories)) throw new SeedError('GET /api/categories: no categories array');
  if (!Array.isArray(services)) throw new SeedError('GET /api/services: no services array');
  if (!info?.clock || !info?.weather) throw new SeedError('GET /api/widgets/info: no clock/weather block');
  if (!Array.isArray(accounts)) throw new SeedError('GET /api/admin/accounts: not an array');
  const kids = accounts.filter((a) => a.role === 'kid');
  const kidApps = {};
  for (const fk of FIXTURE.kids) {
    const kid = kids.find((k) => k.name === fk.name);
    if (kid) {
      const ids = (await http.call('GET', `/api/admin/kids/${kid.id}/services`, { expect: [200] })).json?.serviceIds;
      if (!Array.isArray(ids)) throw new SeedError(`GET /api/admin/kids/{id}/services: no serviceIds array`);
      kidApps[fk.name] = ids;
    }
  }
  return { categories, services, info, kids, kidApps };
}

// --- what the fixture wants, compared with what is there --------------------

function sectionDiff(fs, cat) {
  return cat.gridWidth === fs.gridWidth ? {} : { gridWidth: fs.gridWidth };
}

function appWanted(fa, state) {
  const cat = fa.section === null ? null : state.categories.find((c) => c.name === fa.section);
  return {
    name: fa.name,
    description: fa.description,
    url: fa.url,
    icon: '',
    gatus_key: '',
    clickAction: fa.clickAction,
    iframeSameOrigin: fa.iframeSameOrigin,
    categoryId: cat ? cat.id : null,
  };
}

function appDiff(fa, sv, state) {
  const want = appWanted(fa, state);
  const patch = {};
  for (const [k, v] of Object.entries(want)) {
    if ((sv[k] ?? null) !== v) patch[k] = v;
  }
  return patch;
}

function glanceDiff(info) {
  const g = FIXTURE.glance;
  const patch = {};
  if (info.clock.enabled !== g.clockEnabled) patch.clockEnabled = g.clockEnabled;
  if ((info.clock.hour12 ?? null) !== g.clockHour12) patch.clockHour12 = g.clockHour12;
  if (info.weather.enabled !== g.weatherEnabled) patch.weatherEnabled = g.weatherEnabled;
  return patch;
}

function sectionOrder(state) {
  const fixtureIds = FIXTURE.sections.map((fs) => state.categories.find((c) => c.name === fs.name)?.id);
  const others = state.categories.map((c) => c.id).filter((id) => !fixtureIds.includes(id));
  return [...fixtureIds, ...others];
}

const sameSet = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

function kidAppIds(fk, state) {
  return fk.apps.map((slug) => state.services.find((s) => s.slug === slug)?.id);
}

// Every way the install differs from the fixture; [] means it matches.
function mismatches(state) {
  const out = [];
  for (const fs of FIXTURE.sections) {
    const cat = state.categories.find((c) => c.name === fs.name);
    if (!cat) out.push(`section "${fs.name}" is missing`);
    else if (Object.keys(sectionDiff(fs, cat)).length) out.push(`section "${fs.name}" differs: ${Object.keys(sectionDiff(fs, cat))}`);
  }
  const order = state.categories.map((c) => c.id);
  if (order.join() !== sectionOrder(state).join()) out.push('the fixture sections are not first, in fixture order');
  for (const fa of FIXTURE.apps) {
    const sv = state.services.find((s) => s.slug === fa.slug);
    if (!sv) out.push(`app "${fa.slug}" is missing`);
    else if (Object.keys(appDiff(fa, sv, state)).length) out.push(`app "${fa.slug}" differs: ${Object.keys(appDiff(fa, sv, state))}`);
  }
  if (Object.keys(glanceDiff(state.info)).length) out.push(`clock/weather differ: ${Object.keys(glanceDiff(state.info))}`);
  for (const fk of FIXTURE.kids) {
    const kid = state.kids.find((k) => k.name === fk.name);
    if (!kid) out.push(`kid "${fk.name}" is missing`);
    else {
      if (kid.avatarColor !== fk.avatarColor) out.push(`kid "${fk.name}" avatarColor differs`);
      if (!sameSet(state.kidApps[fk.name] ?? [], kidAppIds(fk, state))) out.push(`kid "${fk.name}" allowed apps differ`);
    }
  }
  return out;
}

// --- applying the fixture ---------------------------------------------------

async function apply(http) {
  const tally = { created: 0, updated: 0, unchanged: 0 };
  const note = (kind, what, detail = '') => {
    tally[kind]++;
    log(`${kind.padEnd(9)} ${what}${detail ? ` (${detail})` : ''}`);
  };
  let state = await readState(http);

  // Sections, then their order.
  for (const fs of FIXTURE.sections) {
    let cat = state.categories.find((c) => c.name === fs.name);
    if (!cat) {
      cat = (await http.call('POST', '/api/categories', { body: { name: fs.name }, expect: [201] })).json;
      state.categories.push(cat);
      const patch = sectionDiff(fs, cat);
      if (Object.keys(patch).length) {
        Object.assign(cat, (await http.call('PATCH', `/api/categories/${cat.id}`, { body: patch, expect: [200] })).json);
      }
      note('created', `section "${fs.name}"`);
      continue;
    }
    const patch = sectionDiff(fs, cat);
    if (Object.keys(patch).length) {
      Object.assign(cat, (await http.call('PATCH', `/api/categories/${cat.id}`, { body: patch, expect: [200] })).json);
      note('updated', `section "${fs.name}"`, Object.keys(patch).join(', '));
    } else note('unchanged', `section "${fs.name}"`);
  }
  state = await readState(http);
  const order = sectionOrder(state);
  if (state.categories.map((c) => c.id).join() !== order.join()) {
    await http.call('PUT', '/api/categories/order', { body: { order }, expect: [204] });
    note('updated', 'section order');
    state = await readState(http);
  } else note('unchanged', 'section order');

  // Apps. POST /api/services takes no section, so a new app gets it by PATCH.
  for (const fa of FIXTURE.apps) {
    const sv = state.services.find((s) => s.slug === fa.slug);
    if (!sv) {
      const want = appWanted(fa, state);
      const { categoryId, ...createBody } = want;
      const created = (
        await http.call('POST', '/api/services', { body: { slug: fa.slug, ...createBody }, expect: [201] })
      ).json;
      if (categoryId !== null) {
        await http.call('PATCH', `/api/services/${created.id}`, { body: { categoryId }, expect: [200] });
      }
      note('created', `app "${fa.name}"`, fa.slug);
      continue;
    }
    const patch = appDiff(fa, sv, state);
    if (Object.keys(patch).length) {
      await http.call('PATCH', `/api/services/${sv.id}`, { body: patch, expect: [200] });
      note('updated', `app "${fa.name}"`, Object.keys(patch).join(', '));
    } else note('unchanged', `app "${fa.name}"`);
  }

  // The glance strip: the clock, which needs no outside service.
  const glance = glanceDiff(state.info);
  if (Object.keys(glance).length) {
    await http.call('PATCH', '/api/admin/settings', { body: glance, expect: [200] });
    note('updated', 'clock widget', Object.keys(glance).join(', '));
  } else note('unchanged', 'clock widget');

  // Kids and their allowed apps (needs the apps' ids, so re-read).
  state = await readState(http);
  for (const fk of FIXTURE.kids) {
    let kid = state.kids.find((k) => k.name === fk.name);
    let kind = 'unchanged';
    const changed = [];
    if (!kid) {
      kid = (
        await http.call('POST', '/api/admin/kids', { body: { name: fk.name, avatarColor: fk.avatarColor }, expect: [201] })
      ).json;
      kind = 'created';
    } else if (kid.avatarColor !== fk.avatarColor) {
      await http.call('PATCH', `/api/admin/kids/${kid.id}`, { body: { avatarColor: fk.avatarColor }, expect: [200] });
      kind = 'updated';
      changed.push('avatarColor');
    }
    const want = kidAppIds(fk, state);
    if (want.includes(undefined)) throw new SeedError(`kid "${fk.name}": an allowed app is missing from the catalog`);
    if (kind === 'created' || !sameSet(state.kidApps[fk.name] ?? [], want)) {
      await http.call('PUT', `/api/admin/kids/${kid.id}/services`, { body: { serviceIds: want }, expect: [204] });
      if (kind === 'unchanged') kind = 'updated';
      if (kind === 'updated') changed.push('allowed apps');
    }
    note(kind, `kid "${fk.name}"`, kind === 'created' ? `${fk.apps.length} allowed apps` : changed.join(', '));
  }

  return tally;
}

// --- main -------------------------------------------------------------------

function parseArgs(argv, env) {
  const raw = argv[0];
  if (!raw || argv.length !== 1) throw new UsageError('usage: seed-qa.sh <homepad-url>   (QA_EMAIL and QA_PASSWORD in the environment)');
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new UsageError(`not a URL: ${raw}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new UsageError(`the URL must be http:// or https://: ${raw}`);
  if (url.search || url.hash || url.username || url.password) throw new UsageError('the URL must have no query, fragment or user:password');
  if (!env.QA_EMAIL) throw new UsageError('QA_EMAIL is not set');
  if (!env.QA_PASSWORD) throw new UsageError('QA_PASSWORD is not set');
  const wait = env.SEED_WAIT_SECONDS === undefined ? 60 : Number(env.SEED_WAIT_SECONDS);
  if (!Number.isFinite(wait) || wait < 0) throw new UsageError('SEED_WAIT_SECONDS must be a number of seconds');
  return { base: url.href.replace(/\/+$/, ''), email: env.QA_EMAIL, password: env.QA_PASSWORD, wait };
}

async function main() {
  const { base, email, password, wait } = parseArgs(process.argv.slice(2), process.env);
  const http = client(base);
  log(`seeding ${base}`);
  await signIn(http, email, password, wait);
  const tally = await apply(http);

  // A seed that "succeeded" must leave the fixture readable, exactly.
  const left = mismatches(await readState(http));
  if (left.length) throw new SeedError(`after seeding, the install still differs from the fixture:\n  - ${left.join('\n  - ')}`);

  await http.call('POST', '/api/logout', { expect: [204] });
  const changes = tally.created + tally.updated;
  log(
    `done: ${tally.created} created, ${tally.updated} updated, ${tally.unchanged} unchanged` +
      (changes === 0 ? ' — already in the QA starting state' : ''),
  );
}

main().catch((err) => {
  if (err instanceof UsageError) {
    console.error(`seed-qa: ${err.message}`);
    process.exit(2);
  }
  console.error(`seed-qa: FAILED: ${err instanceof SeedError ? err.message : err?.stack || err}`);
  process.exit(1);
});
