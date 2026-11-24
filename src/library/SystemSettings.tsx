import { useCallback, useEffect, useRef, useState } from 'react';
import type { SystemConfig } from '../api';
import ServerSettingRow from './ServerSettingRow';
import SettingsDialog, { confirmCopy } from './SettingsDialog';
import SigninSettings from './SigninSettings';
import { sortRows, toOutcome, type RunSave } from './serverSettingsRun';
import {
  adminServerSettings,
  resetServerSetting,
  saveServerSettings,
  type ServerSetting,
  type ServerSettings,
  type SettingValue,
  type SettingWarning,
} from './serverSettingsApi';
import { GROUPS, specFor, type SettingSpec } from './serverSettingsCatalog';
import './server-settings.css';

// SPEC-admin-server-settings — Admin Panel → System. Replaces the read-only
// Environment Configuration list (SPEC-v26) with the editable server settings,
// read from GET /api/admin/server-settings (the web app no longer calls
// /api/admin/env-config, Q3 A). Four groups, one shared row (UX §2), the
// env-only banner (§6), the Sign-in group's one Save (§7) and the confirm
// dialogs (§8).


// Confirms the client can know before sending (UX §2.1: the dialog opens
// before anything is sent). The rest come back from the server as 409s.
function preConfirm(key: string, value: SettingValue, current: SettingValue | undefined): SettingWarning[] {
  if (key === 'COOKIE_SECURE') return [{ code: value === true ? 'cookie_secure_on' : 'cookie_secure_off' }];
  if (key === 'HOMEPAD_REGISTRATION' && value === 'open' && current !== 'open') return [{ code: 'registration_open' }];
  return [];
}

const UPTIME_SPEC: SettingSpec = {
  key: 'showUptimeDisplay',
  group: 'status',
  label: 'Uptime display for new accounts',
  // cap6 v2 AC-028a — copy accepted 2026-09-20, unchanged.
  help: 'Applies to accounts created after this change. Everyone controls their own in My settings.',
  kind: 'boolean',
};

type Ask = { warnings: SettingWarning[]; set: Record<string, SettingValue>; resolve: (yes: boolean) => void };

export default function SystemSettings({
  showUptimeDisplay,
  onSaveSettings,
  onChanged,
  onSigninDirty,
}: {
  showUptimeDisplay: boolean;
  onSaveSettings: (patch: Partial<SystemConfig>) => Promise<void>;
  // After a save or reset, with the new body and the one before it.
  onChanged?: (next: ServerSettings, prev: ServerSettings | null) => void;
  // How many Sign-in changes are held, not saved (UX §7: leaving asks).
  onSigninDirty?: (count: number) => void;
}) {
  const [body, setBody] = useState<ServerSettings | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [ask, setAsk] = useState<Ask | null>(null);
  const bodyRef = useRef<ServerSettings | null>(null);
  const changedRef = useRef(onChanged);
  changedRef.current = onChanged;

  // Fetched once, when the admin opens the panel (as SPEC-v26 AC-010).
  useEffect(() => {
    let live = true;
    adminServerSettings()
      .then((b) => {
        if (!live) return;
        bodyRef.current = b;
        setBody(b);
        setState('ready');
      })
      .catch(() => {
        if (live) setState('error');
      });
    return () => {
      live = false;
    };
  }, []);

  const apply = useCallback((next: ServerSettings) => {
    const prev = bodyRef.current;
    bodyRef.current = next;
    setBody(next);
    changedRef.current?.(next, prev);
  }, []);

  const askConfirm = useCallback(
    (warnings: SettingWarning[], set: Record<string, SettingValue>) =>
      new Promise<boolean>((resolve) => setAsk({ warnings, set, resolve })),
    [],
  );

  const run: RunSave = useCallback(
    async (call, set, pre = []) => {
      let confirm: string[] = [];
      if (pre.length > 0) {
        if (!(await askConfirm(pre, set))) return { ok: false, cancelled: true };
        confirm = pre.map((w) => w.code);
      }
      // Each round adds at least one new code, so this ends; the cap is a seatbelt.
      for (let round = 0; round < 6; round++) {
        const r = await call(confirm);
        if (r.ok) {
          apply(r.body);
          return r.body.notes ? { ok: true, notes: r.body.notes } : { ok: true };
        }
        const f = r.failure;
        if (f.status !== 409 || f.error !== 'confirm_required') return { ok: false, failure: f };
        const fresh = f.warnings.filter((w) => !confirm.includes(w.code));
        if (fresh.length === 0) return { ok: false, failure: f };
        if (!(await askConfirm(fresh, set))) return { ok: false, cancelled: true };
        confirm = [...confirm, ...fresh.map((w) => w.code)];
      }
      return { ok: false };
    },
    [apply, askConfirm],
  );

  const envOnly = body?.envOnly === true;
  const byGroup = (g: string) => (body?.settings ?? []).filter((s) => s.group === g);

  function plainRow(s: ServerSetting) {
    const spec = specFor(s);
    return (
      <ServerSettingRow
        key={s.key}
        spec={spec}
        setting={s}
        envOnly={envOnly}
        hint={
          // SPEC-signin-hardening S-3 — the one default whose cost isn't visible.
          s.key === 'HOMEPAD_TRUSTED_PROXIES' && (s.value ?? '') === ''
            ? 'When this is empty, everyone shares one sign-in limit.'
            : undefined
        }
        onCommit={async (value) =>
          toOutcome(
            await run(
              (confirm) => saveServerSettings({ [s.key]: value }, { confirm }),
              { [s.key]: value },
              preConfirm(s.key, value, s.value),
            ),
          )
        }
        onReset={async () => toOutcome(await run((confirm) => resetServerSetting(s.key, { confirm }), {}))}
      />
    );
  }

  const uptimeSetting: ServerSetting = {
    key: UPTIME_SPEC.key,
    group: 'status',
    value: showUptimeDisplay,
    source: 'default',
    editable: true,
    applies: 'live',
  };
  const uptimeRow = (
    <ServerSettingRow
      key="uptime"
      spec={UPTIME_SPEC}
      setting={uptimeSetting}
      showBadge={false}
      switchTestId="settings-switch-uptime"
      onCommit={async (value) => {
        try {
          await onSaveSettings({ showUptimeDisplay: value === true });
          return { ok: true };
        } catch {
          return { ok: false, message: "Couldn't save — try again." };
        }
      }}
    />
  );

  const dialog = ask ? confirmCopy(ask.warnings, ask.set) : null;

  return (
    <section data-testid="settings-system" aria-labelledby="settings-system-h" className="settings-section">
      <h3 id="settings-system-h" className="settings-section-title">
        System
      </h3>
      <p className="settings-section-note">
        These settings apply to everyone. A value saved here wins over the server's environment. <strong>Reset</strong>{' '}
        returns to the environment value, or the default if there is none.
      </p>
      {envOnly && (
        <div className="settings-envonly-banner" role="status" data-testid="settings-envonly-banner">
          <p className="settings-envonly-title">
            <span aria-hidden="true">⚠ </span>Server settings come from the environment only.
          </p>
          <p>
            Saved values are ignored while <code>HOMEPAD_SETTINGS_FROM_ENV_ONLY</code> is on. You can still reset a
            saved value. Remove the flag and restart to use saved values again.
          </p>
        </div>
      )}
      {/* SPEC-ui-cleanup-18.3.0 AC-005 (#376) — no aria-busy here: this list also
          holds the "Show uptime display" switch, which works during the load, and
          a busy region can make a screen reader hold it back. The skeletons are
          aria-hidden and the sr-only status line announces the load. */}
      <div className="server-settings" data-testid="server-settings-list">
        {state === 'loading' && (
          <span className="sr-only" role="status">
            Loading server settings…
          </span>
        )}
        {state === 'error' && (
          <div className="settings-env-error-cell" data-testid="server-settings-error">
            <span className="settings-error" role="alert">
              Couldn't load server settings.
            </span>
            <span className="settings-env-error-hint">Reload the page to try again.</span>
          </div>
        )}
        {GROUPS.map((g) => {
          const capId = `server-settings-${g.id}`;
          const rows = byGroup(g.id);
          // The Sign-in group, and any group that loaded empty, shows only once ready.
          if (state === 'error' && g.id !== 'status') return null;
          if (state === 'ready' && rows.length === 0 && g.id !== 'status') return null;
          return (
            <div key={g.id} className="settings-kv-group" role="group" aria-labelledby={capId} data-testid={`settings-group-${g.id}`}>
              <h4 id={capId} className="settings-kv-group-label">
                {g.label}
              </h4>
              {state === 'ready' && g.id === 'signin' ? (
                <SigninSettings settings={rows} envOnly={envOnly} run={run} onDirty={onSigninDirty} />
              ) : (
                <dl className="settings-kv">
                  {state === 'loading' && <Skeleton />}
                  {state === 'ready' && sortRows(rows).map(plainRow)}
                  {g.id === 'status' && uptimeRow}
                </dl>
              )}
            </div>
          );
        })}
      </div>
      {ask && dialog && (
        <SettingsDialog
          title={dialog.title}
          paragraphs={dialog.paragraphs}
          primary={dialog.primary}
          onCancel={() => {
            ask.resolve(false);
            setAsk(null);
          }}
          onConfirm={() => {
            ask.resolve(true);
            setAsk(null);
          }}
        />
      )}
    </section>
  );
}


// UX §4 — today's skeleton rows, 3 per group, hidden from AT (the sr-only
// status above speaks for them).
function Skeleton() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div key={i} className="settings-kv-row settings-kv-skeleton" aria-hidden="true">
          <dt>
            <span className="settings-skeleton-bar settings-skeleton-bar--dt" />
          </dt>
          <dd>
            <span className="settings-skeleton-bar settings-skeleton-bar--dd" />
          </dd>
        </div>
      ))}
    </>
  );
}
