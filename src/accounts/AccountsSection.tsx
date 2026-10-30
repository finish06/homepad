import { useCallback, useEffect, useRef, useState } from 'react';
import { listAccounts, type Account } from '../api';
import { avatarColorId, avatarSwatch } from '../lib/avatarColor';
import KidEditor from './KidEditor';

// SPEC-kid-accounts UX §2 (TASK-402) — the Accounts section, first in the Admin
// Panel (K-1). Every account is listed. Adults are listed only, with no action
// (spec §10: managing adults is out of scope). Kids carry "N apps · N devices"
// and the whole row opens the kid editor (UX §3).
//
// It loads once on mount and then mirrors the editor's results locally, so a
// create, rename, apps change, device sign-out or delete shows without a
// refetch. Retry (after an error) is the only reload.

type Load = 'loading' | 'ready' | 'error';

// The editor is either closed, adding (null kid), or editing a kid.
type EditorState = { kid: Account | null } | null;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function kidSummary(a: Account): string {
  const apps = plural(a.appCount ?? 0, 'app', 'apps');
  const devices = a.deviceCount ? plural(a.deviceCount, 'device', 'devices') : 'no devices';
  return `${apps} · ${devices}`;
}

export default function AccountsSection({
  currentUserId,
  scrollIntoView = false,
}: {
  currentUserId?: string;
  // UX §1 — the "Accounts" menu item opens the Admin Panel scrolled here.
  scrollIntoView?: boolean;
}) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [state, setState] = useState<Load>('loading');
  const [editor, setEditor] = useState<EditorState>(null);
  const sectionRef = useRef<HTMLElement>(null);

  const load = useCallback(() => {
    let live = true;
    setState('loading');
    listAccounts()
      .then((rows) => {
        if (!live) return;
        setAccounts(rows);
        setState('ready');
      })
      .catch(() => {
        if (live) setState('error');
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => load(), [load]);

  useEffect(() => {
    // Optional call: jsdom (the unit suite) has no scrollIntoView.
    if (scrollIntoView) sectionRef.current?.scrollIntoView?.({ block: 'start' });
  }, [scrollIntoView]);

  // Upsert by id: an edit replaces the row in place, a create appends it.
  function onSaved(a: Account) {
    setAccounts((cur) => (cur.some((x) => x.id === a.id) ? cur.map((x) => (x.id === a.id ? a : x)) : [...cur, a]));
  }
  function onDeleted(id: string) {
    setAccounts((cur) => cur.filter((x) => x.id !== id));
  }

  const hasKids = accounts.some((a) => a.role === 'kid');

  return (
    <section
      ref={sectionRef}
      data-testid="settings-accounts"
      aria-labelledby="settings-accounts-h"
      className="settings-section accounts-section"
    >
      <div className="accounts-head">
        <h3 id="settings-accounts-h" className="settings-section-title">
          Accounts
        </h3>
        <button
          type="button"
          data-testid="accounts-add-kid"
          className="library-add"
          onClick={() => setEditor({ kid: null })}
        >
          + Add a kid
        </button>
      </div>

      {state === 'loading' && (
        <div className="accounts-list" aria-busy="true">
          <span className="sr-only" role="status">
            Loading accounts…
          </span>
          {[0, 1, 2].map((i) => (
            <div key={i} data-testid="account-skeleton" className="accounts-row accounts-row--skeleton" aria-hidden="true">
              <span className="settings-skeleton-bar settings-skeleton-bar--dt" />
              <span className="settings-skeleton-bar settings-skeleton-bar--dd" />
            </div>
          ))}
        </div>
      )}

      {state === 'error' && (
        <div className="accounts-error" data-testid="accounts-error">
          <span className="settings-error" role="alert">
            Couldn't load accounts.
          </span>
          <button type="button" className="settings-ghost-btn" onClick={load}>
            Retry
          </button>
        </div>
      )}

      {state === 'ready' && (
        <>
          <ul className="accounts-list" aria-label="Accounts">
            {accounts.map((a) => (
              <li key={a.id} data-testid="account-row" className="accounts-item">
                {a.role === 'kid' ? (
                  <button
                    type="button"
                    className="accounts-row accounts-row--kid"
                    aria-label={`Edit ${a.name}, kid, ${kidSummary(a)}`}
                    onClick={() => setEditor({ kid: a })}
                  >
                    <AccountIdentity account={a} />
                    <span className="accounts-summary">{kidSummary(a)}</span>
                    <span className="accounts-edit" aria-hidden="true">
                      Edit ›
                    </span>
                  </button>
                ) : (
                  <div className="accounts-row">
                    <AccountIdentity account={a} />
                    <span className="accounts-summary accounts-email" title={a.email}>
                      {a.id === currentUserId ? 'you' : a.email}
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {!hasKids && (
            <p data-testid="accounts-empty" className="settings-section-note accounts-empty">
              Kids get a dashboard with only the apps you choose, signed in on their own device.
            </p>
          )}
          <p className="settings-section-note">Adults are listed only. Kids are managed here.</p>
        </>
      )}

      {editor && (
        <KidEditor
          kid={editor.kid ?? undefined}
          onClose={() => setEditor(null)}
          onSaved={onSaved}
          onDeleted={onDeleted}
        />
      )}
    </section>
  );
}

function AccountIdentity({ account }: { account: Account }) {
  return (
    <>
      <span
        data-testid="account-dot"
        data-color={avatarColorId(account.avatarColor)}
        className="account-dot"
        style={{ backgroundColor: avatarSwatch(account.avatarColor) }}
        aria-hidden="true"
      />
      <span className="accounts-name">{account.name}</span>
      <span className="role-pill accounts-role">{account.role}</span>
    </>
  );
}
