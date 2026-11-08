import { useEffect, useId, useState } from 'react';
import type { Service } from '../api';
import { fieldText } from './format';
import {
  deleteWidget,
  getWidget,
  putWidget,
  testWidget,
  widgetKinds,
  type AuthType,
  type KindsResponse,
  type TestResult,
  type WidgetConfig,
  type WidgetInput,
  type WidgetKind,
} from './widgetAdminApi';
import './widget-admin.css';

// SPEC-status-widgets AC-024 / UX §6 — the tile editor's Widget section. It
// lives in the lazy TileEditModal chunk (AC-033) and its styles in the lazy
// widget-admin.css chunk (AC-032). The editor owns one Save: useWidgetEditor
// hands TileEditModal `dirty` and `save()`, and save() runs before the tile
// PATCH, so a widget error stops the whole Save (UX §6.2).

export const WIDGETS_DOC = 'https://github.com/finish06/homepad/blob/main/docs/widgets.md';

const INTERVALS: [number, string][] = [
  [60, 'Every minute'],
  [300, 'Every 5 minutes'],
  [900, 'Every 15 minutes'],
];

const KEY_LABEL: Record<AuthType, string> = {
  none: '',
  api_key: 'API key',
  password: 'Password',
  user_password: 'Password',
  token: 'Token secret',
};

const AUTH_COPY: Record<AuthType, string> = {
  none: '{App} didn’t accept the request.',
  api_key: '{App} didn’t accept the API key.',
  password: '{App} didn’t accept the password.',
  user_password: '{App} didn’t accept the username or password.',
  token: 'Proxmox didn’t accept the token. Check the token ID and secret.',
};

// UX §6.4 — fixed copy per code. It never includes the address, an upstream
// message, or a status number.
const ERROR_COPY: Record<string, string> = {
  unreachable: 'Can’t reach {App} at this address.',
  timeout: '{App} took too long to answer.',
  tls: '{App}’s certificate isn’t trusted. If it uses a self-signed certificate, tick Allow self-signed certificate.',
  redirect: 'That address sends Homepad somewhere else, often a login page. Use the app’s internal address.',
  blocked_address: 'Homepad doesn’t fetch from this address.',
  bad_response: '{App} answered, but not in a way Homepad understands. Check that the address points at {App}.',
  unsupported_version: 'Homepad needs Pi-hole 6 or newer.',
  secret_unreadable: 'Homepad can’t read the saved key. Enter it again.',
  no_secret_key: 'To save keys, set HOMEPAD_SECRET_KEY on the server.',
  request_failed: 'Couldn’t run the test. Try again.',
};

export function errorCopy(code: string, kind?: WidgetKind): string {
  const raw = code === 'auth' ? AUTH_COPY[kind?.auth ?? 'api_key'] : (ERROR_COPY[code] ?? ERROR_COPY.request_failed);
  return raw.replace(/\{App\}/g, kind?.label ?? 'The app');
}

// Scheme + host + port; a key only goes to the origin it was entered for
// (AC-023). "" when the address doesn't parse.
function originOf(address: string): string {
  try {
    const u = new URL(address);
    return `${u.protocol}//${u.host}`;
  } catch {
    return '';
  }
}

function isHttpUrl(address: string): boolean {
  try {
    return /^https?:$/.test(new URL(address).protocol);
  } catch {
    return false;
  }
}

function suggest(kinds: WidgetKind[], service: Service): WidgetKind | undefined {
  const hay = `${service.name} ${service.slug}`.toLowerCase();
  return kinds.find((k) => k.match.some((m) => hay.includes(m.toLowerCase())));
}

const defaultsOf = (k?: WidgetKind) => (k ? k.fields.filter((f) => f.default).map((f) => f.key).slice(0, 3) : []);

type Draft = {
  kind: string;
  address: string;
  username: string;
  secret: string;
  // keep = use the saved key; replace = the field is open; remove = clear on Save.
  keyAction: 'keep' | 'replace' | 'remove';
  fields: string[];
  intervalS: number;
  insecureTls: boolean;
};

type SaveOutcome = { ok: true; removed: boolean } | { ok: false; message: string };

export type WidgetEditor = ReturnType<typeof useWidgetEditor>;

export function useWidgetEditor(service: Service) {
  const [kinds, setKinds] = useState<KindsResponse | null>(null);
  const [saved, setSaved] = useState<WidgetConfig | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [draft, setDraftState] = useState<Draft | null>(null);
  const [suggested, setSuggested] = useState(false);
  const [touched, setTouched] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  useEffect(() => {
    let live = true;
    void Promise.all([widgetKinds(), getWidget(service.id)]).then(([k, w]) => {
      if (!live) return;
      if (!k || w.status === 'error') {
        setStatus('error');
        return;
      }
      setKinds(k);
      if (w.status === 'ok') {
        const c = w.config;
        setSaved(c);
        setDraftState({
          kind: c.kind,
          address: c.address,
          username: c.username,
          secret: '',
          keyAction: 'keep',
          fields: c.fields,
          intervalS: c.intervalS,
          insecureTls: c.insecureTls,
        });
      } else {
        const s = suggest(k.kinds, service);
        setSuggested(!!s);
        setDraftState({
          kind: s?.kind ?? '',
          address: '',
          username: '',
          secret: '',
          keyAction: 'keep',
          fields: defaultsOf(s),
          intervalS: 60,
          insecureTls: false,
        });
      }
      setStatus('ready');
    });
    return () => {
      live = false;
    };
    // The editor reads the service once, when the modal opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const kind = kinds?.kinds.find((k) => k.kind === draft?.kind);
  const secretKeySet = kinds?.secretKeySet ?? false;
  const effective = (a: string) => a.trim() || service.url;
  const keyDropped =
    !!saved?.hasSecret &&
    !!draft &&
    (draft.kind !== saved.kind || originOf(effective(draft.address)) !== originOf(effective(saved.address)));
  const keyUnreadable = saved?.error === 'secret_unreadable';
  const keyOpen = !saved?.hasSecret || keyDropped || keyUnreadable || draft?.keyAction === 'replace';
  const https = !!draft && /^https:\/\//i.test(effective(draft.address));

  // What Save would do: delete, write, or nothing. A suggested type the admin
  // never touched saves nothing (AC-025: the admin still chooses).
  const intent: 'none' | 'delete' | 'put' = !draft
    ? 'none'
    : removed || (draft.kind === '' && saved)
      ? 'delete'
      : draft.kind === '' || (suggested && !touched && !saved)
        ? 'none'
        : 'put';

  function body(forTest: boolean): WidgetInput {
    const d = draft!;
    const b: WidgetInput = {
      kind: d.kind,
      address: d.address.trim(),
      username: d.username.trim(),
      fields: kind ? kind.fields.filter((f) => d.fields.includes(f.key)).map((f) => f.key) : d.fields,
      intervalS: d.intervalS,
      insecureTls: https && d.insecureTls,
      enabled: saved?.enabled ?? true,
    };
    // Write-only key (§6.4): sent only when typed; "" only to remove it. A
    // test with a blank field uses the saved key.
    if (secretKeySet || forTest) {
      if (keyOpen && d.secret !== '') b.secret = d.secret;
      else if (!forTest && d.keyAction === 'remove' && !keyDropped) b.secret = '';
    }
    return b;
  }

  const dirty =
    intent === 'delete' ||
    (intent === 'put' &&
      (!saved ||
        draft!.kind !== saved.kind ||
        draft!.address.trim() !== saved.address ||
        draft!.username.trim() !== saved.username ||
        draft!.intervalS !== saved.intervalS ||
        (https && draft!.insecureTls) !== saved.insecureTls ||
        body(false).fields.join() !== saved.fields.join() ||
        draft!.keyAction === 'remove' ||
        (keyOpen && draft!.secret !== '')));

  function setDraft(patch: Partial<Draft>) {
    setTouched(true);
    setFieldError(null);
    setDraftState((d) => (d ? { ...d, ...patch } : d));
  }

  function chooseKind(next: string) {
    const k = kinds?.kinds.find((x) => x.kind === next);
    setDraft({ kind: next, fields: defaultsOf(k), keyAction: 'keep', secret: '' });
  }

  async function runTest() {
    if (!draft || draft.kind === '' || testing) return;
    setTesting(true);
    setTestResult(null);
    const r = await testWidget(service.id, body(true));
    setTesting(false);
    setTestResult(r);
  }

  // Runs before the tile PATCH. A 422 lands under its field; anything else is
  // returned for the modal's own error line.
  async function save(): Promise<SaveOutcome> {
    if (intent === 'none' || !dirty) return { ok: true, removed: false };
    if (intent === 'delete') {
      return (await deleteWidget(service.id))
        ? { ok: true, removed: true }
        : { ok: false, message: 'Couldn’t save the widget. Try again.' };
    }
    const b = body(false);
    if (b.address !== '' && !isHttpUrl(b.address)) {
      setFieldError({ field: 'address', message: 'Use an address that starts with http:// or https://.' });
      return { ok: false, message: '' };
    }
    const r = await putWidget(service.id, b);
    if (r.ok) return { ok: true, removed: false };
    if (r.status === 422 && r.message) {
      setFieldError({ field: r.field ?? '', message: r.message });
      return { ok: false, message: '' };
    }
    return { ok: false, message: 'Couldn’t save the widget. Try again.' };
  }

  return {
    status,
    kinds,
    saved,
    draft,
    kind,
    suggested: suggested && !touched && !saved,
    secretKeySet,
    keyDropped,
    keyUnreadable,
    keyOpen,
    https,
    removed,
    setRemoved: (v: boolean) => {
      setTouched(true);
      setRemoved(v);
    },
    fieldError,
    testing,
    testResult,
    dirty,
    setDraft,
    chooseKind,
    runTest,
    save,
  };
}

function ago(iso: string | null): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return '';
  const m = Math.floor((Date.now() - t) / 60_000);
  return m < 1 ? ', just now' : `, ${m} min ago`;
}

export default function WidgetSection({ editor, tileUrl }: { editor: WidgetEditor; tileUrl: string }) {
  const id = useId();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const { draft, kind, saved, fieldError } = editor;
  const errorFor = (f: string) =>
    fieldError && fieldError.field === f ? (
      <p className="tile-edit-error" role="alert">
        {fieldError.message}
      </p>
    ) : null;

  let body: React.ReactNode;
  if (editor.status === 'loading') {
    body = <p className="tile-edit-help">Loading…</p>;
  } else if (editor.status === 'error' || !draft || !editor.kinds) {
    body = <p className="tile-edit-error">Couldn’t load the widget settings.</p>;
  } else if (confirmRemove) {
    body = (
      <div className="widget-confirm" role="alert">
        <p className="tile-edit-help">Remove the {kind?.label ?? saved?.kind} widget? Its saved key is deleted.</p>
        <button type="button" className="tile-edit-btn-text" onClick={() => setConfirmRemove(false)}>
          Keep
        </button>
        <button
          type="button"
          className="tile-edit-btn-text is-danger"
          onClick={() => {
            setConfirmRemove(false);
            editor.setRemoved(true);
          }}
        >
          Remove
        </button>
      </div>
    );
  } else if (editor.removed) {
    body = (
      <div className="widget-confirm">
        <p className="tile-edit-help">The widget is removed when you save.</p>
        <button type="button" className="tile-edit-btn-text" onClick={() => editor.setRemoved(false)}>
          Undo
        </button>
      </div>
    );
  } else {
    const auth = kind?.auth ?? 'none';
    const max = draft.fields.length >= 3;
    const result = editor.testResult;
    body = (
      <>
        {saved && saved.error && (saved.state === 'error' || saved.state === 'stale') && (
          <p className="widget-last-error" data-testid="widget-last-error">
            Last check{ago(saved.lastCheckAt)}: {errorCopy(saved.error, kind)}
          </p>
        )}
        <div className="tile-edit-field">
          <div className="widget-labelrow">
            <label className="tile-edit-label" htmlFor={`${id}-type`}>
              Type
            </label>
            {editor.suggested && <span className="widget-suggested">Suggested</span>}
          </div>
          <select
            id={`${id}-type`}
            className="tile-edit-input tile-edit-select"
            value={draft.kind}
            onChange={(e) => editor.chooseKind(e.target.value)}
          >
            <option value="">None</option>
            {editor.kinds.kinds.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.label}
              </option>
            ))}
          </select>
          {errorFor('kind')}
        </div>

        {kind && (
          <>
            <div className="tile-edit-field">
              <label className="tile-edit-label" htmlFor={`${id}-addr`}>
                Address
              </label>
              <input
                id={`${id}-addr`}
                className="tile-edit-input"
                type="url"
                value={draft.address}
                placeholder={tileUrl}
                onChange={(e) => editor.setDraft({ address: e.target.value })}
              />
              <p className="tile-edit-help">
                Leave blank to use the tile’s link. If the link goes through a login page, use the app’s own
                address.
              </p>
              {editor.keyDropped && (
                <p className="widget-warn">Changing this removes the saved key. Enter it again before you save.</p>
              )}
              {errorFor('address')}
            </div>

            {(auth === 'user_password' || auth === 'token') && (
              <div className="tile-edit-field">
                <label className="tile-edit-label" htmlFor={`${id}-user`}>
                  {auth === 'token' ? 'Token ID' : 'Username'}
                </label>
                <input
                  id={`${id}-user`}
                  className="tile-edit-input"
                  type="text"
                  autoComplete="off"
                  value={draft.username}
                  onChange={(e) => editor.setDraft({ username: e.target.value })}
                />
              </div>
            )}

            {auth !== 'none' && (
              <div className="tile-edit-field">
                {editor.keyOpen || !editor.secretKeySet ? (
                  <>
                    <label className="tile-edit-label" htmlFor={`${id}-key`}>
                      {KEY_LABEL[auth]}
                    </label>
                    <div className="widget-keyrow">
                      <input
                        id={`${id}-key`}
                        className="tile-edit-input"
                        type="password"
                        autoComplete="new-password"
                        value={draft.secret}
                        disabled={!editor.secretKeySet}
                        onChange={(e) => editor.setDraft({ secret: e.target.value })}
                      />
                      {draft.keyAction === 'replace' && !editor.keyDropped && !editor.keyUnreadable && (
                        <button
                          type="button"
                          className="tile-edit-btn-text"
                          onClick={() => editor.setDraft({ keyAction: 'keep', secret: '' })}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                    {!editor.secretKeySet && (
                      <p className="tile-edit-help">
                        To save keys, set HOMEPAD_SECRET_KEY on the server.{' '}
                        <a href={WIDGETS_DOC} target="_blank" rel="noreferrer noopener">
                          How ›
                        </a>
                      </p>
                    )}
                  </>
                ) : draft.keyAction === 'remove' ? (
                  <div className="widget-keyrow">
                    <span className="tile-edit-label">{KEY_LABEL[auth]}</span>
                    <span className="tile-edit-help">The key is removed when you save.</span>
                    <button type="button" className="tile-edit-btn-text" onClick={() => editor.setDraft({ keyAction: 'keep' })}>
                      Undo
                    </button>
                  </div>
                ) : (
                  <div className="widget-keyrow">
                    <span className="tile-edit-label">{KEY_LABEL[auth]}</span>
                    <span className="widget-key-saved">Key saved</span>
                    <button type="button" className="tile-edit-btn-text" onClick={() => editor.setDraft({ keyAction: 'replace' })}>
                      Replace
                    </button>
                    <button
                      type="button"
                      className="tile-edit-btn-text is-danger"
                      onClick={() => editor.setDraft({ keyAction: 'remove' })}
                    >
                      Remove
                    </button>
                  </div>
                )}
                {kind.help && <p className="tile-edit-help">{kind.help}</p>}
                {errorFor('secret')}
              </div>
            )}

            <fieldset className="tile-edit-field widget-show">
              <legend className="tile-edit-label">Show</legend>
              <div className="widget-chips">
                {kind.fields.map((f) => {
                  const on = draft.fields.includes(f.key);
                  const off = !on && max;
                  return (
                    <label key={f.key} className={`widget-chip${on ? ' is-on' : ''}${off ? ' is-off' : ''}`}>
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={off}
                        aria-describedby={off ? `${id}-count` : undefined}
                        onChange={() =>
                          editor.setDraft({
                            fields: on ? draft.fields.filter((k) => k !== f.key) : [...draft.fields, f.key],
                          })
                        }
                      />
                      {f.label}
                    </label>
                  );
                })}
              </div>
              <p className="tile-edit-help widget-count" id={`${id}-count`}>
                {draft.fields.length} of 3
              </p>
              {errorFor('fields')}
            </fieldset>

            <div className="tile-edit-field">
              <label className="tile-edit-label" htmlFor={`${id}-every`}>
                Refresh
              </label>
              <select
                id={`${id}-every`}
                className="tile-edit-input tile-edit-select"
                value={draft.intervalS}
                onChange={(e) => editor.setDraft({ intervalS: Number(e.target.value) })}
              >
                {INTERVALS.map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
              {errorFor('intervalS')}
            </div>

            {editor.https && (
              <label className="widget-check">
                <input
                  type="checkbox"
                  checked={draft.insecureTls}
                  onChange={(e) => editor.setDraft({ insecureTls: e.target.checked })}
                />
                Allow self-signed certificate
              </label>
            )}

            <div className="widget-test">
              <button
                type="button"
                className="tile-edit-btn tile-edit-btn-secondary"
                disabled={editor.testing}
                onClick={() => void editor.runTest()}
              >
                {editor.testing ? 'Testing…' : 'Test connection'}
              </button>
              <div aria-live="polite">
                {result && (
                  <p
                    data-testid="widget-test-result"
                    className={result.ok ? 'widget-result-ok' : result.error === 'rate_limited' ? 'tile-edit-help' : 'tile-edit-error'}
                  >
                    {result.ok ? (
                      <>
                        ✓ Connected to {kind.label}
                        {result.version ? ` ${result.version}` : ''}.
                        {result.fields.length > 0 && (
                          <span className="widget-result-values">{result.fields.map(fieldText).join(' · ')}</span>
                        )}
                      </>
                    ) : result.error === 'rate_limited' ? (
                      'Wait a moment, then test again.'
                    ) : (
                      `✕ ${result.error === 'invalid' && result.message ? result.message : errorCopy(result.error, kind)}`
                    )}
                  </p>
                )}
              </div>
            </div>
          </>
        )}
        {errorFor('')}

        {saved && (
          <button type="button" className="tile-edit-btn-text is-danger widget-remove" onClick={() => setConfirmRemove(true)}>
            Remove widget
          </button>
        )}
      </>
    );
  }

  return (
    <section className="widget-config" data-testid="widget-section" aria-labelledby={`${id}-h`}>
      <h3 id={`${id}-h`} className="widget-heading">
        Widget
      </h3>
      {body}
    </section>
  );
}
