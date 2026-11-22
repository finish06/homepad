import { useCallback, useEffect, useRef, useState } from 'react';
import { authConfig, listAccounts, listInvites, type Account, type AuthConfig, type Invite } from '../api';
import { avatarColorId, avatarSwatch } from '../lib/avatarColor';
import AddAdultDialog from './AddAdultDialog';
import AdultRowMenu from './AdultRowMenu';
import KidEditor from './KidEditor';
import PendingInvites from './PendingInvites';
import { roleLabel } from './inviteFormat';
// SPEC-household-basics — the Accounts additions' styles ride in this lazy
// admin chunk, not the entry stylesheet (tests/infra/bundle-budget.test.ts).
import './household.css';

// The README section the open-sign-up warning points to (UX §3.1, "How ›").
const REGISTRATION_DOCS = 'https://github.com/finish06/homepad#registration';

// SPEC-kid-accounts UX §2 (TASK-402) — the Accounts section, first in the Admin
// Panel (K-1). Every account is listed. Kids carry "N apps · N devices" and the
// whole row opens the kid editor (UX §3).
//
// SPEC-household-manage-adults UX §2 — every other adult's row has a
// "Manage ▾" menu (role change, Remove). Your own row has none (Q1). A polite
// status line says what a confirm did, and focus lands per UX §6.
//
// It loads once on mount and then mirrors the editor's results locally, so a
// create, rename, apps change, device sign-out or delete shows without a
// refetch. Retry (after an error) is the only reload.
//
// SPEC-household-basics UX §3.1 — "+ Add an adult" sits next to "+ Add a kid"
// (H-1); the open-sign-up warning shows while HOMEPAD_REGISTRATION=open
// (AC-006); the user role reads "member" (AC-021); Pending invites list under
// the accounts (AC-011, AC-019). They load on their own, with their own error
// and Retry: a web build ahead of its API (no invites route) still lists the
// accounts and manages kids (#583, spec §10).

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
  const [invitesState, setInvitesState] = useState<Load>('loading');
  const [editor, setEditor] = useState<EditorState>(null);
  const [addingAdult, setAddingAdult] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  // Manage-adults: the status line, every Manage button by account id, and
  // where focus goes once a removal has re-rendered the list.
  const [announcement, setAnnouncement] = useState('');
  const manageButtons = useRef(new Map<string, HTMLButtonElement>());
  const addAdultRef = useRef<HTMLButtonElement>(null);
  const [focusAfter, setFocusAfter] = useState<string | null>(null);

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

  const loadInvites = useCallback(() => {
    let live = true;
    setInvitesState('loading');
    listInvites()
      .then((pending) => {
        if (!live) return;
        setInvites(pending);
        setInvitesState('ready');
      })
      .catch(() => {
        if (live) setInvitesState('error');
      });
    return () => {
      live = false;
    };
  }, []);

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
    const stopInvites = loadInvites();
    return () => {
      live = false;
      stopInvites();
    };
  }, [loadInvites]);

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

  // UX §6 — after a removal, focus the next row's Manage button, else the
  // previous one, else "+ Add an adult".
  useEffect(() => {
    if (focusAfter === null) return;
    const el = focusAfter === '' ? addAdultRef.current : manageButtons.current.get(focusAfter);
    el?.focus();
    setFocusAfter(null);
  }, [focusAfter, accounts]);

  function onAdultRemoved(a: Account) {
    const managed = accounts.filter((x) => x.role !== 'kid' && x.id !== currentUserId);
    const at = managed.findIndex((x) => x.id === a.id);
    const next = managed[at + 1] ?? managed[at - 1];
    setAccounts((cur) => cur.filter((x) => x.id !== a.id));
    // Their invites stopped working with them (Q3).
    setInvites((cur) => cur.filter((i) => i.createdBy.id !== a.id));
    setFocusAfter(next ? next.id : '');
    setAnnouncement(`${a.name} was removed.`);
  }

  function onAdultRoleChanged(a: Account) {
    onSaved(a);
    setAnnouncement(a.role === 'admin' ? `${a.name} is now an admin.` : `${a.name} is now a member.`);
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
            ref={addAdultRef}
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
                    {a.id !== currentUserId && (
                      <AdultRowMenu
                        account={a}
                        pendingInvites={invites.filter((i) => i.createdBy.id === a.id).length}
                        oidcEnabled={config?.oidcEnabled === true}
                        buttonRef={(el) => {
                          if (el) manageButtons.current.set(a.id, el);
                          else manageButtons.current.delete(a.id);
                        }}
                        onRoleChanged={onAdultRoleChanged}
                        onRemoved={onAdultRemoved}
                        onStale={load}
                      />
                    )}
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
          {invitesState === 'ready' && (
            <PendingInvites invites={invites} onRevoked={(id) => setInvites((cur) => cur.filter((i) => i.id !== id))} />
          )}
          {invitesState === 'error' && (
            <div className="accounts-error invites" data-testid="invites-error">
              <span className="settings-error" role="alert">
                Couldn't load pending invites.
              </span>
              <button type="button" className="settings-ghost-btn" onClick={loadInvites}>
                Retry
              </button>
            </div>
          )}
        </>
      )}

      {state === 'ready' && (
        <p role="status" className="sr-only">
          {announcement}
        </p>
      )}

      {addingAdult && (
        <AddAdultDialog
          oidcEnabled={config?.oidcEnabled === true}
          registration={config?.registration}
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
