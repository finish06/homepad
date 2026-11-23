import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { ServerSetting, SettingValue } from './serverSettingsApi';
import {
  BADGE_TEXT,
  checkDraft,
  envIsSet,
  formatValue,
  parseDraft,
  rawValue,
  resetTarget,
  shortDate,
  type SettingSpec,
} from './serverSettingsCatalog';

// SPEC-admin-server-settings UX §2–§5 — the ONE row every server setting uses:
// label, env name, value, source badge, Edit, Reset. The few that differ
// (spec §2.3) differ through props and the spec's `kind`, not a second
// component: PORT is `readonly`, the client secret is `secret`, the Sign-in
// group passes `grouped` (Save reads "Done"; the group holds the change), and
// "Show uptime display" passes showBadge={false} and no onReset.

// `note`: a non-blocking warning a save that went through came back with
// (spec §7 0.2.1: gatus_unreachable, proxy_unresolved, oidc_issuer_http).
export type CommitOutcome = { ok: true; note?: string } | { ok: false; message?: string; cancelled?: boolean };

type Flag = 'saved' | 'reset' | null;

const SAVE_ERROR = "Couldn't save. Try again.";

export default function ServerSettingRow({
  spec,
  setting,
  envOnly = false,
  showBadge = true,
  staged,
  grouped = false,
  hint,
  onCommit,
  onReset,
  switchTestId,
}: {
  spec: SettingSpec;
  setting: ServerSetting;
  envOnly?: boolean;
  showBadge?: boolean;
  // Sign-in group: the held, not-yet-saved value (undefined: none).
  staged?: SettingValue;
  grouped?: boolean;
  hint?: string;
  onCommit: (value: SettingValue) => Promise<CommitOutcome>;
  onReset?: () => Promise<CommitOutcome>;
  switchTestId?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<'saving' | 'resetting' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [flag, setFlag] = useState<Flag>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const flagTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fieldRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const resetRef = useRef<HTMLButtonElement>(null);
  const confirmResetRef = useRef<HTMLButtonElement>(null);
  const focusEdit = useRef(false);
  const uid = useId();
  const labelId = `${uid}-label`;
  const helpId = `${uid}-help`;
  const errId = `${uid}-err`;

  const secret = spec.kind === 'secret';
  const readonly = spec.kind === 'readonly' || setting.readOnlyReason === 'restart';
  const isStaged = staged !== undefined;
  // A switch keeps the state it just saved until the setting it is given
  // changes: a caller that saves elsewhere (the uptime row) re-renders later.
  const [committed, setCommitted] = useState<SettingValue | undefined>(undefined);
  useEffect(() => setCommitted(undefined), [setting.value]);
  const current = isStaged ? staged : committed !== undefined ? committed : setting.value;
  const locked = envOnly || !setting.editable;
  const target = resetTarget(setting);
  // Reset clears a stored UI value, used or not: env-only ignores it, and a
  // value that fails today's rule is ignored too (savedInvalid).
  const canReset = !!onReset && !readonly && (setting.saved === true || setting.source === 'ui');

  useEffect(() => () => { if (flagTimer.current) clearTimeout(flagTimer.current); }, []);

  useEffect(() => {
    if (editing) {
      const form = formRef.current;
      const radio =
        form?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]') ?? form?.querySelector<HTMLElement>('[role="radio"]');
      (radio ?? fieldRef.current)?.focus();
    }
    else if (focusEdit.current) {
      focusEdit.current = false;
      (editRef.current ?? resetRef.current)?.focus();
    }
  }, [editing]);

  useEffect(() => {
    if (confirmReset) confirmResetRef.current?.focus();
  }, [confirmReset]);

  function showFlag(f: Flag) {
    setFlag(f);
    if (flagTimer.current) clearTimeout(flagTimer.current);
    flagTimer.current = setTimeout(() => setFlag(null), 1600);
  }

  function startEdit() {
    setNote(null);
    setDraft(secret ? '' : rawValue(current));
    setError(null);
    setConfirmReset(false);
    setEditing(true);
  }

  function cancelEdit() {
    focusEdit.current = true;
    setEditing(false);
    setError(null);
  }

  const clientError = editing ? checkDraft(spec, draft) : null;
  const changed = editing && (secret ? draft !== '' : parseDraft(spec, draft) !== parseDraft(spec, rawValue(current)));
  const canSave = changed && !clientError && busy === null;

  async function commit(value: SettingValue): Promise<boolean> {
    setBusy('saving');
    setError(null);
    setNote(null);
    const r = await onCommit(value);
    setBusy(null);
    if (r.ok) {
      if (!grouped) showFlag('saved');
      if (r.note) setNote(r.note);
      return true;
    }
    if (!r.cancelled) setError(r.message ?? SAVE_ERROR);
    return false;
  }

  async function save() {
    if (!canSave) return;
    if (await commit(parseDraft(spec, draft))) {
      focusEdit.current = true;
      setEditing(false);
    }
  }

  async function flip() {
    if (busy !== null || locked) return;
    const next = !(current === true || current === 'true');
    if ((await commit(next)) && !grouped) setCommitted(next);
  }

  async function reset() {
    if (!onReset) return;
    setBusy('resetting');
    setError(null);
    setNote(null);
    const r = await onReset();
    setBusy(null);
    setConfirmReset(false);
    if (r.ok) {
      showFlag('reset');
      if (r.note) setNote(r.note);
      // The Reset button goes away with the UI value; keep focus in the row.
      requestAnimationFrame(() => (editRef.current ?? resetRef.current)?.focus());
    } else if (!r.cancelled) setError(r.message ?? "Couldn't reset. Try again.");
  }

  function onFieldKeys(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      // One layer: the Admin Panel beneath must not close.
      e.stopPropagation();
      e.preventDefault();
      cancelEdit();
    }
  }

  // --- the value as shown at rest ------------------------------------------
  let shown: string;
  let warn = false;
  if (secret) {
    if (isStaged) shown = 'Replaced';
    else if (setting.unreadable) {
      shown = "Can't be read";
      warn = true;
    } else shown = setting.isSet ? 'Set' : 'Not set';
  } else shown = formatValue(spec, current);

  // --- the muted detail line(s) --------------------------------------------
  const details: string[] = [];
  if (readonly) details.push('Set on the server. Applies after restart.');
  if (envOnly && setting.saved && !setting.savedInvalid) {
    details.push(
      secret
        ? 'Saved secret ignored.'
        : setting.savedValue !== undefined
          ? `Saved value ignored: ${formatValue(spec, setting.savedValue) || '—'}`
          : 'Saved value ignored.',
    );
  }
  if (setting.savedInvalid) details.push("The saved value no longer passes the rules, so it's ignored. Reset clears it.");
  if (!envOnly && setting.source === 'ui' && showBadge) {
    const who = setting.updatedBy?.name;
    const when = shortDate(setting.updatedAt);
    if (who || when) details.push(`Saved by ${[who, when].filter(Boolean).join(', ')}`);
    if (secret) details.push(`Env: ${setting.envIsSet ? 'set' : 'not set'}`);
    else if (envIsSet(setting)) details.push(`Env: ${formatValue(spec, setting.envValue)}`);
  }
  if (secret && setting.readOnlyReason === 'no_secret_key') {
    details.push('To save the secret here, add HOMEPAD_SECRET_KEY on the server. The env secret still works.');
  }
  if (secret && setting.unreadable && !isStaged) details.push('The server key changed. Replace the secret.');
  if (hint) details.push(hint);

  const resetWord = secret ? 'Remove saved secret' : `Reset to ${target}`;
  const resetAria = secret ? `Remove saved ${spec.label}` : `Reset ${spec.label} to ${target}`;
  const fallback = secret
    ? setting.envIsSet
      ? 'The env secret applies again.'
      : 'No secret will be set.'
    : null;
  const fallbackValue = target === 'env' ? setting.envValue : setting.defaultValue;
  const resetQuestion = secret
    ? 'Remove the saved secret?'
    : `Reset to ${target}: ${formatValue(spec, fallbackValue) || '—'}?`;

  const flagText = flag === 'saved' ? 'Saved ✓' : flag === 'reset' ? 'Reset ✓' : '';
  const flagSr =
    flag === 'saved'
      ? showBadge
        ? 'Saved. Now set in the UI.'
        : 'Saved.'
      : flag === 'reset'
        ? target === 'env'
          ? 'Reset. Now from the environment.'
          : 'Reset. Now the default.'
        : '';

  const isBool = spec.kind === 'boolean';
  const checked = current === true || current === 'true';

  return (
    <div
      className={`settings-kv-row settings-setting${editing ? ' settings-setting--editing' : ''}`}
      data-testid={`setting-row-${spec.key}`}
      data-source={setting.source}
    >
      <dt>
        <span className="settings-kv-label" id={labelId}>
          {spec.label}
        </span>
        {/^[A-Z0-9_]+$/.test(spec.key) && <code className="settings-kv-var">{spec.key}</code>}
        {isBool && spec.help && <span className="settings-kv-help">{spec.help}</span>}
        {!editing &&
          details.map((d) => (
            <span key={d} className={`settings-setting-detail${warn && d.startsWith('The server key') ? ' settings-setting-detail--warn' : ''}`}>
              {d}
            </span>
          ))}
      </dt>
      <dd>
        <div className="settings-setting-head">
          <span className="settings-save-flag" role="status" aria-live="polite" data-state={busy === 'saving' && isBool ? 'saving' : flag ? 'saved' : 'idle'}>
            {busy === 'saving' && isBool ? 'Saving…' : (
              <>
                <span aria-hidden="true">{flagText}</span>
                <span className="sr-only">{flagSr}</span>
              </>
            )}
          </span>
          {!editing && !isBool && (
            <span className={`settings-kv-value${warn ? ' settings-kv-value--warn' : ''}${shown === '' ? ' settings-kv-value--empty' : ''}`}>
              {isStaged && <span aria-hidden="true">✎ </span>}
              {shown === '' ? (
                <>
                  <span aria-hidden="true">{spec.key === 'OIDC_DISCOVERY_URL' ? '— (from the issuer)' : '—'}</span>
                  <span className="sr-only">not set</span>
                </>
              ) : (
                shown
              )}
            </span>
          )}
          {isBool && (
            <>
              <button
                type="button"
                role="switch"
                aria-checked={checked}
                aria-labelledby={labelId}
                aria-busy={busy === 'saving'}
                // Not disabled while busy: a confirm dialog may be open, and
                // focus must be able to come back here. flip() ignores clicks.
                disabled={locked}
                className="settings-switch"
                data-testid={switchTestId ?? `setting-switch-${spec.key}`}
                onClick={() => void flip()}
              >
                <span className="settings-switch-thumb" aria-hidden="true" />
              </button>
              <span className="settings-setting-onoff" aria-hidden="true">
                {isStaged && '✎ '}
                {checked ? 'On' : 'Off'}
              </span>
            </>
          )}
          {isStaged ? (
            <span className="settings-setting-pending">changed, not saved</span>
          ) : (
            showBadge && (
              <span className="settings-env-badge settings-src-badge" data-source={setting.source}>
                <span aria-hidden="true">{BADGE_TEXT[setting.source].short}</span>
                <span className="sr-only">{BADGE_TEXT[setting.source].long}</span>
              </span>
            )
          )}
        </div>

        {editing ? (
          <form
            ref={formRef}
            className="settings-setting-form"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            onKeyDown={onFieldKeys}
          >
            {spec.kind === 'choice' ? (
              <div role="radiogroup" aria-labelledby={labelId} aria-describedby={helpId} className="settings-segmented">
                {spec.choices?.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    role="radio"
                    aria-checked={draft === c.value}
                    className="settings-segmented-opt"
                    disabled={busy !== null}
                    onClick={() => setDraft(c.value)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            ) : (
              <span className="settings-setting-field">
                <input
                  ref={(el) => { fieldRef.current = el; }}
                  type={secret ? 'password' : spec.kind === 'number' ? 'text' : spec.kind === 'url' ? 'url' : 'text'}
                  inputMode={spec.kind === 'number' ? 'numeric' : undefined}
                  autoComplete="off"
                  spellCheck={false}
                  className="settings-input settings-setting-input"
                  aria-labelledby={labelId}
                  aria-describedby={`${helpId}${clientError || error ? ` ${errId}` : ''}`}
                  aria-invalid={!!(clientError || error) || undefined}
                  value={draft}
                  disabled={busy !== null}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    setError(null);
                  }}
                />
                {spec.unit && <span className="settings-unit" aria-hidden="true">{spec.unit}</span>}
              </span>
            )}
            {spec.help && !isBool && (
              <span id={helpId} className="settings-kv-help">
                {spec.help}
              </span>
            )}
            {clientError && (
              <span id={errId} className="settings-error settings-setting-error">
                {clientError}
              </span>
            )}
            {!clientError && error && (
              <span id={errId} role="alert" className="settings-error settings-setting-error">
                {error}
              </span>
            )}
            <span className="settings-setting-actions">
              <button type="button" className="settings-ghost-btn settings-setting-btn" disabled={busy !== null} onClick={cancelEdit}>
                Cancel
              </button>
              <button type="submit" className="library-add settings-setting-btn" disabled={!canSave}>
                {busy === 'saving' ? 'Saving…' : grouped ? 'Done' : 'Save'}
              </button>
            </span>
          </form>
        ) : (
          <>
            {note && (
              <span className="settings-setting-detail settings-setting-detail--warn" role="status" data-testid="setting-note">
                {note}
              </span>
            )}
            {error && (
              <span role="alert" className="settings-error settings-setting-error">
                {error}
              </span>
            )}
            {confirmReset ? (
              <span className="settings-setting-reset-confirm" role="group" aria-label={resetQuestion}>
                <span>{resetQuestion}</span>
                {fallback && <span className="settings-setting-detail">{fallback}</span>}
                <span className="settings-setting-actions">
                  <button
                    ref={confirmResetRef}
                    type="button"
                    className="settings-ghost-btn settings-setting-btn"
                    disabled={busy !== null}
                    onClick={() => {
                      setConfirmReset(false);
                      requestAnimationFrame(() => resetRef.current?.focus());
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="library-add settings-setting-btn"
                    disabled={busy !== null}
                    onClick={() => void reset()}
                  >
                    {busy === 'resetting' ? 'Resetting…' : secret ? 'Remove' : 'Reset'}
                  </button>
                </span>
              </span>
            ) : (
              (canReset || (!readonly && !isBool)) && (
                <span className="settings-setting-actions">
                  {canReset && (
                    <button
                      ref={resetRef}
                      type="button"
                      className="settings-ghost-btn settings-setting-btn"
                      aria-label={resetAria}
                      disabled={busy !== null}
                      onClick={() => {
                        setError(null);
                        setConfirmReset(true);
                      }}
                    >
                      {resetWord}
                    </button>
                  )}
                  {!readonly && !isBool && (
                    <button
                      ref={editRef}
                      type="button"
                      className="settings-ghost-btn settings-setting-btn"
                      aria-label={`${secret ? 'Replace' : 'Edit'} ${spec.label}`}
                      disabled={locked || busy !== null}
                      onClick={startEdit}
                    >
                      {secret ? 'Replace' : 'Edit'}
                    </button>
                  )}
                </span>
              )
            )}
          </>
        )}
      </dd>
    </div>
  );
}
