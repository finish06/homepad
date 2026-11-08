import { useCallback, useEffect, useRef, useState } from 'react';
import { authConfig, listAccounts, listInvites, type Account, type AuthConfig, type Invite } from '../api';
import { avatarColorId, avatarSwatch } from '../lib/avatarColor';
import AddAdultDialog from './AddAdultDialog';
import KidEditor from './KidEditor';
import PendingInvites from './PendingInvites';
import { roleLabel } from './inviteFormat';
// SPEC-household-basics — the Accounts additions' styles ride in this lazy
// admin chunk, not the entry stylesheet (tests/infra/bundle-budget.test.ts).
import './household.css';

// The README section the open-sign-up warning points to (UX §3.1, "How ›").
const REGISTRATION_DOCS = 'https://github.com/finish06/homepad#registration';

// SPEC-kid-accounts UX §2 (TASK-402) — the Accounts section, first in the Admin
// Panel (K-1). Every account is listed. Adults are listed only, with no action
// (spec §10: managing adults is out of scope). Kids carry "N apps · N devices"
// and the whole row opens the kid editor (UX §3).
//
// It loads once on mount and then mirrors the editor's results locally, so a
// create, rename, apps change, device sign-out or delete shows without a
// refetch. Retry (after an error) is the only reload.
//
// SPEC-household-basics UX §3.1 — "+ Add an adult" sits next to "+ Add a kid"
// (H-1); the open-sign-up warning shows while HOMEPAD_REGISTRATION=open
// (AC-006); the user role reads "member" (AC-021); Pending invites load with
// the account list and share its error state (AC-011, AC-019).

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
  const [invites, setInvites] = useState<Invite[]>([]);
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [state, setState] = useState<Load>('loading');
  const [editor, setEditor] = useState<EditorState>(null);
  const [addingAdult, setAddingAdult] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  // The public auth config carries the registration mode and the SSO flag. It
  // never rejects (a failure reads as closed), so it has no error state.
  useEffect(() => {
    let live = true;
    authConfig().then((c) => {
      if (live) setConfig(c);
    });
    return () => {
      live = false;
    };
  }, []);

  const load = useCallback(() => {
    let live = true;
    setState('loading');
    Promise.all([listAccounts(), listInvites()])
      .then(([rows, pending]) => {
        if (!live) return;
        setAccounts(rows);
        setInvites(pending);
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
  const me = accounts.find((a) => a.id === currentUserId);

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
        <div className="accounts-actions">
          <button
            type="button"
            data-testid="accounts-add-adult"
            className="library-add"
            onClick={() => setAddingAdult(true)}
          >
            + Add an adult
          </button>
          <button
            type="button"
            data-testid="accounts-add-kid"
            className="library-add"
            onClick={() => setEditor({ kid: null })}
          >
            + Add a kid
          </button>
        </div>
      </div>

      {/* Standing information, not an event: a note, not an alert. It can't be
          dismissed; it goes away when the setting changes (UX §3.1). */}
      {config?.registration === 'open' && state === 'ready' && (
        <div role="note" className="accounts-warning" data-testid="accounts-open-warning">
          <span aria-hidden="true">⚠ </span>
          Anyone who can open Homepad can create an account.
          {hasKids && <> A kid who signs out could make an adult account.</>} To stop this, set{' '}
          <code>HOMEPAD_REGISTRATION=invite_only</code>.{' '}
          <a href={REGISTRATION_DOCS} target="_blank" rel="noreferrer">
            How ›
          </a>
        </div>
      )}

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
          <PendingInvites invites={invites} onRevoked={(id) => setInvites((cur) => cur.filter((i) => i.id !== id))} />
        </>
      )}

      {addingAdult && (
        <AddAdultDialog
          oidcEnabled={config?.oidcEnabled === true}
          onClose={() => setAddingAdult(false)}
          onCreated={(inv) => {
            // Pending invites list newest first. The token is not kept: the
            // dialog shows it once and drops it. A new invite is always ours.
            const row: Invite = {
              id: inv.id,
              name: inv.name,
              role: inv.role,
              createdAt: inv.createdAt,
              expiresAt: inv.expiresAt,
              createdBy: { id: currentUserId ?? '', name: me?.name ?? '' },
            };
            setInvites((cur) => [row, ...cur.filter((i) => i.id !== inv.id)]);
          }}
        />
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
      <span className="role-pill accounts-role">{roleLabel(account.role)}</span>
    </>
  );
}
