import { useEffect, useId, useRef, useState } from 'react';
import { canCopy, copyHint } from '../lib/copyText';

// SPEC-household-basics UX §3.3 and SPEC-password-reset-link UX §2.2 — the
// link-once view the invite dialog and the reset-link dialog share: the link
// in a read-only field, Copy (reads "Copied" for 2 seconds) and Share… where
// the browser has a share sheet. Browsers block the clipboard on plain http (a
// LAN address), so there the field is selected instead, with how to copy it.
// The server keeps only a hash, so this is the one time the link is shown.
// canCopy and copyHint are shared with every other Copy button (lib/copyText).

export default function LinkOnce({
  link,
  intro,
  label,
  shareTitle,
  footer,
  focusCopy = false,
  onDone,
}: {
  link: string;
  // "Send Jo this link."
  intro: string;
  // The field's label: "Invite link", "Reset link".
  label: string;
  // The share sheet's title.
  shareTitle: string;
  // The lines under the link, one paragraph each.
  footer: string[];
  // Move focus to Copy link on open (the reset dialog, UX §5).
  focusCopy?: boolean;
  onDone: () => void;
}) {
  const [fallback, setFallback] = useState(!canCopy());
  const [copied, setCopied] = useState(false);
  const fieldRef = useRef<HTMLInputElement>(null);
  const copyRef = useRef<HTMLButtonElement>(null);
  const uid = useId();

  useEffect(() => {
    if (!fallback) {
      if (focusCopy) copyRef.current?.focus();
      return;
    }
    fieldRef.current?.focus();
    fieldRef.current?.select();
  }, [fallback, focusCopy]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setFallback(true);
    }
  }

  const share = typeof navigator.share === 'function';

  return (
    <div className="add-adult-body">
      <p>{intro}</p>
      <div className="kid-field">
        <label htmlFor={`${uid}-link`} className="add-offer-label">
          {label}
        </label>
        <input
          ref={fieldRef}
          id={`${uid}-link`}
          className="settings-input add-adult-link"
          value={link}
          readOnly
          onFocus={(e) => e.currentTarget.select()}
        />
        {fallback && <p className="settings-section-note">{copyHint()}</p>}
      </div>
      {!fallback && (
        <div className="add-adult-actions">
          <button ref={copyRef} type="button" className="library-add kid-btn" onClick={() => void copy()}>
            {copied ? 'Copied' : 'Copy link'}
          </button>
          {share && (
            <button
              type="button"
              className="settings-ghost-btn kid-btn"
              onClick={() => void navigator.share({ title: shareTitle, url: link }).catch(() => {})}
            >
              Share…
            </button>
          )}
        </div>
      )}
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? 'Copied' : ''}
      </span>
      {footer.map((line) => (
        <p key={line} className="settings-section-note">
          {line}
        </p>
      ))}
      <div className="kid-editor-foot">
        <span className="kid-foot-spacer" />
        <button type="button" className="library-add kid-btn" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}
