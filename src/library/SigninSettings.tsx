import { useEffect, useRef, useState } from 'react';
import ServerSettingRow from './ServerSettingRow';
import SettingsDialog from './SettingsDialog';
import { failureMessage, noteText, sortRows, toOutcome, type RunSave } from './serverSettingsRun';
import {
  oidcTestStatus,
  resetServerSetting,
  saveServerSettings,
  startOidcTest,
  type ServerSetting,
  type SettingValue,
} from './serverSettingsApi';
import { formatValue, specFor } from './serverSettingsCatalog';

// SPEC-admin-server-settings UX §7 — the Sign-in group. The OIDC values only
// work together, so rows edit in place but their Save reads "Done": the change
// is held here, and one "Review and save" sends them all in one PATCH (A-5).
// With no admin who has a password, the server needs a passed test sign-in
// with exactly these values first (Q2 A): "Test sign-in" opens the provider in
// a new tab and polls until it passes or fails. A pass is good for 10 minutes,
// and changing a value again needs a new test.

export const POLL_MS = 2000;
const MAX_POLLS = 150; // 5 minutes
export const TEST_TTL_MS = 10 * 60 * 1000;

type Test =
  | { state: 'idle' }
  | { state: 'starting' }
  | { state: 'waiting'; id: string; url: string }
  | { state: 'passed'; token: string; expires: number }
  | { state: 'failed'; message: string };

// lockout: the server's would_lock_out line; offerTest: a test sign-in can help
// (not when turning single sign-on off, which is always refused, 0.2.1).
type Review = { busy: boolean; error: string | null; lockout: string | null; offerTest?: boolean };
const OPEN: Review = { busy: false, error: null, lockout: null };


const plural = (n: number) => `${n} ${n === 1 ? 'change' : 'changes'}`;

export default function SigninSettings({
  settings,
  envOnly,
  run,
  onDirty,
}: {
  settings: ServerSetting[];
  envOnly: boolean;
  run: RunSave;
  onDirty?: (count: number) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, SettingValue>>({});
  const [test, setTest] = useState<Test>({ state: 'idle' });
  const [review, setReview] = useState<Review | null>(null);
  const [saved, setSaved] = useState(false);
  const [savedNote, setSavedNote] = useState<string | undefined>(undefined);
  // A refusal that belongs to the group, not the dialog: a bad value (400 with
  // a key), and for OIDC_ENABLED the keys it still needs (`missing`).
  const [groupError, setGroupError] = useState<{ message: string; keys: string[]; missing: boolean } | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const count = Object.keys(drafts).length;
  const dirtyRef = useRef(onDirty);
  dirtyRef.current = onDirty;

  useEffect(() => dirtyRef.current?.(count), [count]);
  useEffect(
    () => () => {
      dirtyRef.current?.(0);
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  // Poll the test while its tab is open.
  const waitingId = test.state === 'waiting' ? test.id : null;
  useEffect(() => {
    if (!waitingId) return;
    let live = true;
    let polls = 0;
    const timer = setInterval(() => {
      polls += 1;
      void oidcTestStatus(waitingId).then((r) => {
        if (!live) return;
        if (r.state === 'passed' && r.token) setTest({ state: 'passed', token: r.token, expires: Date.now() + TEST_TTL_MS });
        else if (r.state === 'failed')
          setTest({ state: 'failed', message: r.message ?? 'The test sign-in failed. Check the values and try again.' });
        else if (polls >= MAX_POLLS) setTest({ state: 'failed', message: 'The test sign-in timed out. Try again.' });
      });
    }, POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [waitingId]);

  // A pass is good for 10 minutes.
  const passedUntil = test.state === 'passed' ? test.expires : null;
  useEffect(() => {
    if (passedUntil === null) return;
    const t = setTimeout(
      () => setTest({ state: 'failed', message: 'The test ran out after 10 minutes. Test sign-in again.' }),
      Math.max(0, passedUntil - Date.now()),
    );
    return () => clearTimeout(t);
  }, [passedUntil]);

  function stage(s: ServerSetting, value: SettingValue) {
    setDrafts((d) => {
      const next = { ...d };
      if (!s.secret && value === s.value) delete next[s.key];
      else next[s.key] = value;
      return next;
    });
    setTest({ state: 'idle' });
    setSaved(false);
    setGroupError(null);
  }

  function discard() {
    setDrafts({});
    setTest({ state: 'idle' });
    setGroupError(null);
  }

  async function runTest() {
    setReview(null);
    // Opened now, inside the click, so a popup blocker lets it through; it
    // gets its address once the server answers.
    const tab = window.open('', '_blank');
    setTest({ state: 'starting' });
    const r = await startOidcTest(drafts);
    if (!r.ok) {
      tab?.close();
      setTest({ state: 'failed', message: failureMessage(r.failure) });
      return;
    }
    if (tab) {
      try {
        tab.opener = null;
        tab.location.href = r.authorizeUrl;
      } catch {
        // The link in the footer still works.
      }
    }
    setTest({ state: 'waiting', id: r.id, url: r.authorizeUrl });
  }

  const token = test.state === 'passed' && Date.now() < test.expires ? test.token : undefined;

  async function saveGroup() {
    setReview({ ...OPEN, busy: true });
    setGroupError(null);
    const set = drafts;
    const r = await run((confirm) => saveServerSettings(set, { confirm, oidcTest: token }), set);
    if (r.ok) {
      setDrafts({});
      setTest({ state: 'idle' });
      setReview(null);
      setSaved(true);
      const note = noteText(r.notes);
      setSavedNote(note);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      // A note stays until the next change; the plain "saved" flag goes in 1.6 s.
      if (!note) savedTimer.current = setTimeout(() => setSaved(false), 1600);
      return;
    }
    if (r.cancelled) {
      setReview(OPEN);
      return;
    }
    const f = r.failure;
    if (f?.error === 'invalid' && f.key) {
      setReview(null);
      const missing = !!f.missing?.length;
      setGroupError({ message: failureMessage(f), keys: missing ? f.missing! : [f.key], missing });
      return;
    }
    if (f?.error === 'would_lock_out') {
      setReview({ ...OPEN, lockout: failureMessage(f), offerTest: set.OIDC_ENABLED !== false });
      return;
    }
    setReview({ ...OPEN, error: failureMessage(f) });
  }

  const byKey = new Map(settings.map((s) => [s.key, s]));
  const clientIdStaged = 'OIDC_CLIENT_ID' in drafts && !('OIDC_CLIENT_SECRET' in drafts);

  const changes = Object.entries(drafts).map(([key, v]) => {
    const s = byKey.get(key);
    const spec = specFor(s ?? { key, group: 'signin' });
    if (spec.kind === 'secret') return { key, label: spec.label, from: s?.isSet ? 'Set' : 'Not set', to: 'Replaced' };
    return { key, label: spec.label, from: formatValue(spec, s?.value) || '—', to: formatValue(spec, v) || '—' };
  });

  const paragraphs = ['The redirect URL must be registered with your provider first.'];
  if (drafts.OIDC_ENABLED === false) {
    paragraphs.push("People who only use single sign-on can't sign in until it's back on. Admins with a password still can.");
  }
  if (review?.lockout) paragraphs.unshift(review.lockout);

  const testLine =
    test.state === 'starting'
      ? 'Starting the test sign-in…'
      : test.state === 'waiting'
        ? 'Waiting for the test sign-in…'
        : test.state === 'passed'
          ? 'Test passed ✓'
          : test.state === 'failed'
            ? test.message
            : '';
  const showFoot = count > 0 || test.state !== 'idle' || saved || groupError !== null;

  return (
    <>
      <dl className="settings-kv">
        {sortRows(settings).map((s) => {
          const spec = specFor(s);
          return (
            <ServerSettingRow
              key={s.key}
              spec={spec}
              setting={s}
              envOnly={envOnly}
              grouped
              staged={drafts[s.key]}
              hint={
                groupError?.keys.includes(s.key) && s.key !== 'OIDC_ENABLED'
                  ? groupError.missing
                    ? 'Needed to turn on single sign-on.'
                    : groupError.message
                  : s.secret && clientIdStaged
                    ? 'Replace the secret too if the provider gave you a new one.'
                    : undefined
              }
              onCommit={async (value) => {
                stage(s, value);
                return { ok: true };
              }}
              onReset={async () => {
                const r = toOutcome(
                  await run((confirm) => resetServerSetting(s.key, { confirm, oidcTest: token }), {}),
                );
                if (r.ok) {
                  setDrafts((d) => {
                    const next = { ...d };
                    delete next[s.key];
                    return next;
                  });
                }
                return r;
              }}
            />
          );
        })}
      </dl>
      {showFoot && (
        <div className="settings-signin-foot" data-testid="signin-footer">
          <p className="settings-signin-status" role="status" aria-live="polite">
            {saved ? (
              <>
                <span>Sign-in settings saved ✓</span>
                {savedNote && <span className="settings-setting-detail settings-setting-detail--warn">{savedNote}</span>}
              </>
            ) : (
              <>
                {count > 0 && <span>{`${plural(count)} not saved.`}</span>}
                {testLine && (
                  <span className={test.state === 'failed' ? 'settings-error settings-signin-test' : 'settings-signin-test'}>
                    {testLine}
                  </span>
                )}
              </>
            )}
          </p>
          {groupError && (
            <p role="alert" className="settings-error settings-signin-error">
              {groupError.message}
            </p>
          )}
          {test.state === 'waiting' && (
            <a className="settings-signin-link" href={test.url} target="_blank" rel="noopener noreferrer">
              Open the test sign-in page
            </a>
          )}
          {count > 0 && (
            <span className="settings-setting-actions">
              <button type="button" className="settings-ghost-btn settings-setting-btn" onClick={discard}>
                Discard
              </button>
              <button
                type="button"
                className="settings-ghost-btn settings-setting-btn"
                disabled={envOnly || test.state === 'starting'}
                onClick={() => void runTest()}
              >
                Test sign-in
              </button>
              <button
                type="button"
                className="library-add settings-setting-btn"
                disabled={envOnly}
                onClick={() => setReview(OPEN)}
              >
                Review and save
              </button>
            </span>
          )}
        </div>
      )}
      {review && (
        <SettingsDialog
          testId="signin-review"
          title="Save sign-in settings?"
          paragraphs={paragraphs}
          primary="Save"
          busy={review.busy}
          error={review.error}
          onCancel={() => setReview(null)}
          onConfirm={() => void saveGroup()}
        >
          <ul className="server-setting-changes">
            {changes.map((c) => (
              <li key={c.key}>
                <strong>{c.label}</strong>: {c.from} → {c.to}
              </li>
            ))}
          </ul>
          {review.lockout && review.offerTest && (
            <button type="button" className="settings-ghost-btn kid-btn" onClick={() => void runTest()}>
              Test sign-in
            </button>
          )}
        </SettingsDialog>
      )}
    </>
  );
}
