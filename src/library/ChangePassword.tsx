import { useEffect, useId, useRef, useState } from 'react';
import { changePassword } from '../passwordApi';
import { newPasswordProblem, PW_HINT, PW_MISMATCH } from '../lib/passwordCopy';
import { waitMessage } from '../lib/waitMessage';

// SPEC-password-reset-link AC-013, AC-014, UX §4 — My settings → Password.
// Change password expands in place (R-5): three fields under the section, no
// second dialog on top of My settings. Saving ends every other session of the
// account; this device stays signed in (Q3). SettingsPanel shows the section
// only when GET /api/me says hasPassword (AC-020).

type Errors = { current?: string; next?: string; again?: string; form?: string };

export default function ChangePassword({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  // Focus returns to Change password after Cancel or a save, never on mount.
  const returnFocus = useRef(false);
  const uid = useId();

  useEffect(() => {
    if (open || !returnFocus.current) return;
    returnFocus.current = false;
    toggleRef.current?.focus();
  }, [open]);

  function close(saved: boolean) {
    returnFocus.current = true;
    setDone(saved);
    setOpen(false);
  }

  return (
    <section data-testid="settings-password" aria-labelledby={`${uid}-h`} className="settings-section">
      <h3 id={`${uid}-h`} className="settings-section-title">
        Password
      </h3>
      {done && (
        <p role="status" className="settings-section-note">
          ✓ Password changed. Your other devices are signed out.
        </p>
      )}
      <div className="settings-kv-row settings-kv-row--control">
        <p className="settings-section-note">Change the password you sign in with.</p>
        <button
          ref={toggleRef}
          type="button"
          className="settings-ghost-btn kid-btn"
          aria-expanded={open}
          aria-controls={`${uid}-form`}
          onClick={() => {
            setDone(false);
            setOpen(true);
          }}
        >
          Change password
        </button>
      </div>
      {open && <PasswordForm id={`${uid}-form`} email={email} onCancel={() => close(false)} onSaved={() => close(true)} />}
    </section>
  );
}

function PasswordForm({
  id,
  email,
  onCancel,
  onSaved,
}: {
  id: string;
  email: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const currentRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLInputElement>(null);
  const againRef = useRef<HTMLInputElement>(null);
  const uid = useId();

  // Focus Current password on open, and again after a wrong one: the effect
  // runs once the fields are enabled again.
  useEffect(() => {
    if (!errors.next && !errors.again) currentRef.current?.focus();
  }, [errors.current]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const problem = newPasswordProblem(next);
    if (problem) {
      setErrors({ next: problem });
      nextRef.current?.focus();
      return;
    }
    if (again !== next) {
      setErrors({ again: PW_MISMATCH });
      againRef.current?.focus();
      return;
    }
    setErrors({});
    setBusy(true);
    const r = await changePassword(current, next);
    setBusy(false);
    if (r.ok) return onSaved();
    if (r.status === 403) {
      // Nobody is signed out. Only the wrong field is cleared.
      setCurrent('');
      return setErrors({ current: "That's not your current password." });
    }
    if (r.status === 429) return setErrors({ form: waitMessage(r.retryAfter) });
    if (r.status === 409) {
      return setErrors({ form: 'This account signs in with single sign-on. It has no password to change here.' });
    }
    setErrors({ form: "Couldn't change the password. Try again." });
  }

  const field = (
    label: string,
    value: string,
    set: (v: string) => void,
    ref: React.RefObject<HTMLInputElement>,
    autoComplete: string,
    error: string | undefined,
    key: string,
    hint?: string,
  ) => (
    <div className="kid-field">
      <label htmlFor={`${uid}-${key}`} className="add-offer-label">
        {label}
      </label>
      <input
        ref={ref}
        id={`${uid}-${key}`}
        type="password"
        className="settings-input"
        autoComplete={autoComplete}
        value={value}
        disabled={busy}
        aria-invalid={error ? true : undefined}
        aria-describedby={[error && `${uid}-${key}-err`, hint && `${uid}-${key}-hint`].filter(Boolean).join(' ') || undefined}
        onChange={(e) => set(e.target.value)}
      />
      {error && (
        <p id={`${uid}-${key}-err`} className="settings-error">
          {error}
        </p>
      )}
      {hint && (
        <p id={`${uid}-${key}-hint`} className="settings-section-note">
          {hint}
        </p>
      )}
    </div>
  );

  return (
    <form id={id} className="add-adult-body" onSubmit={save} noValidate>
      {/* Password managers update the saved password for this account. */}
      <input type="email" autoComplete="username" value={email} readOnly hidden />
      {field('Current password', current, setCurrent, currentRef, 'current-password', errors.current, 'current')}
      {field('New password', next, setNext, nextRef, 'new-password', errors.next, 'next', PW_HINT)}
      {field('Type it again', again, setAgain, againRef, 'new-password', errors.again, 'again')}
      <p className="settings-section-note">Your other devices will be signed out.</p>
      {errors.form && (
        <p role="alert" className="settings-error">
          {errors.form}
        </p>
      )}
      <div className="kid-editor-foot">
        <span className="kid-foot-spacer" />
        <button type="button" className="settings-ghost-btn kid-btn" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="library-add kid-btn" disabled={busy}>
          {busy ? 'Saving…' : 'Save password'}
        </button>
      </div>
    </form>
  );
}
