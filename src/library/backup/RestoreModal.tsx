import { useEffect, useId, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import Modal from '../../ui/Modal';
import { trapTab } from '../../ui/trapTab';
import {
  applyRestore,
  downloadBackup,
  previewRestore,
  TransferError,
  type Plan,
  type PlanItem,
  type RestoreMode,
} from './transferApi';
import { codeCopy, errorCopy, IMPORT_COPY } from '../importCopy';
import {
  DiscardStrip,
  fileSize,
  groupCounts,
  hasChanges,
  isLongPreview,
  listWords,
  plural,
  PlanGroup,
  PlanRow,
  readText,
  restoreSummary,
  saveBlob,
  StepHeading,
} from './planParts';
import './backup-import.css';

// SPEC-backup-import UX §3 (TASK-304) — Restore from backup, in three steps:
// Choose → Preview → Done. The preview changes nothing; Restore sends the same
// file back with the preview's planHash, and a 409 brings the fresh plan back to
// step 2 (UX §3.4). Replace needs REPLACE typed first (AC-011).

type Step = 1 | 2 | 3;
type Picked = { file: File; exportedAt: string | null };

const TITLE = 'Restore from backup';

function exportedDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export default function RestoreModal({ onClose, onApplied }: { onClose: () => void; onApplied?: () => void }) {
  const uid = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState<Step>(1);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [mode, setMode] = useState<RestoreMode>('merge');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [result, setResult] = useState<Plan | null>(null);
  const [stale, setStale] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [confirm, setConfirm] = useState('');
  const [discarding, setDiscarding] = useState(false);
  const [safetyBusy, setSafetyBusy] = useState(false);
  const [safetyError, setSafetyError] = useState(false);

  // UX §7 — every step change moves focus to the step's heading.
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setPicked(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readText(file));
    } catch {
      setFileError(IMPORT_COPY.not_a_backup);
      return;
    }
    setFileError(null);
    const at = parsed && typeof parsed === 'object' ? (parsed as { exportedAt?: unknown }).exportedAt : null;
    setPicked({ file, exportedAt: typeof at === 'string' ? at : null });
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    void pick(e.dataTransfer?.files?.[0]);
  }

  async function preview() {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      const p = await previewRestore(picked.file, mode);
      setPlan(p);
      setStale(false);
      setFailed(null);
      setConfirm('');
      setStep(2);
    } catch (e) {
      setError(e instanceof TransferError ? errorCopy(e) : IMPORT_COPY.failed);
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!picked || !plan?.planHash) return;
    setBusy(true);
    setFailed(null);
    try {
      const r = await applyRestore(picked.file, mode, plan.planHash);
      setResult(r);
      setStep(3);
      onApplied?.();
    } catch (e) {
      if (e instanceof TransferError && e.code === 'plan_changed') {
        // UX §3.4 — back to step 2 with the new plan already loaded. An older
        // server's bare 409 carries no plan, so ask for one.
        let fresh = e.plan ?? null;
        if (!fresh) {
          try {
            fresh = await previewRestore(picked.file, mode);
          } catch (again) {
            setFailed(again instanceof TransferError ? errorCopy(again) : IMPORT_COPY.failed);
            return;
          }
        }
        setPlan(fresh);
        setStale(true);
        setConfirm('');
        return;
      }
      setFailed(e instanceof TransferError ? errorCopy(e) : IMPORT_COPY.failed);
    } finally {
      setBusy(false);
    }
  }

  async function safetyDownload() {
    setSafetyBusy(true);
    setSafetyError(false);
    try {
      const { blob, filename } = await downloadBackup(true);
      saveBlob(blob, filename);
    } catch {
      setSafetyError(true);
    } finally {
      setSafetyBusy(false);
    }
  }

  // Closing with a file picked asks first (UX §7); the Done step closes at once.
  function attemptClose() {
    if (picked && step !== 3) {
      setDiscarding(true);
      return;
    }
    onClose();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Tab') {
      trapTab(e, dialogRef.current);
      return;
    }
    if (e.key !== 'Escape') return;
    // One press, one layer: the Admin Panel's window listener never sees it.
    e.stopPropagation();
    if (discarding) {
      setDiscarding(false);
      return;
    }
    attemptClose();
  }

  const headingId = `${uid}-title`;
  const modeWord = mode === 'merge' ? 'Merge' : 'Replace';

  return createPortal(
    <Modal
      onDismiss={attemptClose}
      overlayClassName="launcher-overlay add-offer-overlay bi-overlay"
      overlayTestId="restore-overlay"
      escapeDismisses={false}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        data-testid="restore-modal"
        className="kid-editor-panel bi-panel"
        onKeyDown={onKeyDown}
      >
        <div className="library-head">
          <StepHeading ref={headingRef} id={headingId} title={TITLE} step={step} extra={step === 2 ? modeWord : undefined} />
          <button
            type="button"
            aria-label={`Close ${TITLE}`}
            onClick={attemptClose}
            className="launcher-clear library-close"
          >
            ✕
          </button>
        </div>

        <div className="bi-body">
          {step === 1 && (
            <ChooseStep
              uid={uid}
              picked={picked}
              fileError={fileError}
              mode={mode}
              onMode={setMode}
              onPick={pick}
              onDrop={onDrop}
            />
          )}
          {step === 2 && plan && (
            <PreviewStep
              uid={uid}
              plan={plan}
              mode={mode}
              stale={stale}
              confirm={confirm}
              onConfirm={setConfirm}
              onSafetyDownload={safetyDownload}
              safetyBusy={safetyBusy}
              safetyError={safetyError}
            />
          )}
          {step === 3 && result && <DoneStep result={result} />}
        </div>

        {discarding ? (
          <DiscardStrip question="Discard this restore?" onKeep={() => setDiscarding(false)} onDiscard={onClose} />
        ) : (
          <div className="bi-foot">
            {step === 1 && (
              <>
                {error && (
                  <p className="settings-error bi-foot-error" role="alert">
                    {error}
                  </p>
                )}
                <button type="button" className="settings-ghost-btn bi-btn" onClick={attemptClose}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="library-add bi-btn"
                  disabled={!picked || busy}
                  onClick={() => void preview()}
                >
                  {busy ? 'Checking…' : 'Preview'}
                </button>
              </>
            )}
            {step === 2 && plan && (
              <PreviewFoot
                plan={plan}
                mode={mode}
                busy={busy}
                failed={failed}
                confirmed={confirm === 'REPLACE'}
                onBack={() => {
                  setFailed(null);
                  setStep(1);
                }}
                onApply={() => void apply()}
                onClose={onClose}
              />
            )}
            {step === 3 && (
              <button type="button" className="library-add bi-btn" onClick={onClose}>
                Done
              </button>
            )}
          </div>
        )}
      </div>
    </Modal>,
    document.body,
  );
}

function ChooseStep({
  uid,
  picked,
  fileError,
  mode,
  onMode,
  onPick,
  onDrop,
}: {
  uid: string;
  picked: Picked | null;
  fileError: string | null;
  mode: RestoreMode;
  onMode: (m: RestoreMode) => void;
  onPick: (f: File | undefined) => void;
  onDrop: (e: DragEvent) => void;
}) {
  const fileId = `${uid}-file`;
  const errId = `${uid}-file-err`;
  return (
    <>
      <div className="bi-field">
        <label htmlFor={fileId} className="add-offer-label">
          Backup file
        </label>
        {/* UX §7 — a real file input with a visible label; drop is an extra. */}
        <div
          className="bi-drop"
          data-testid="restore-drop"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
        >
          <span>Drop a .json file here, or</span>
          <input
            id={fileId}
            type="file"
            accept=".json,application/json"
            className="bi-file-input"
            aria-invalid={fileError ? true : undefined}
            aria-describedby={fileError ? errId : undefined}
            onChange={(e) => void onPick(e.target.files?.[0])}
          />
        </div>
        {picked && (
          <p className="settings-section-note bi-meta" data-testid="restore-file-meta">
            {[picked.file.name, fileSize(picked.file.size), exportedDate(picked.exportedAt)].filter(Boolean).join(' · ')}
          </p>
        )}
        {fileError && (
          <p id={errId} className="settings-error">
            {fileError}
          </p>
        )}
      </div>

      <fieldset className="bi-field bi-modes">
        <legend className="add-offer-label">How to restore</legend>
        <label className="bi-radio">
          <input type="radio" name={`${uid}-mode`} checked={mode === 'merge'} onChange={() => onMode('merge')} />
          <span>
            <strong>Merge</strong> — add new items and update matching ones. Nothing is deleted.
          </span>
        </label>
        <label className="bi-radio">
          <input type="radio" name={`${uid}-mode`} checked={mode === 'replace'} onChange={() => onMode('replace')} />
          <span>
            <strong>Replace</strong> — delete all apps, sections and App Library offers first, then load the file.
          </span>
        </label>
      </fieldset>
    </>
  );
}

const byAction = (items: PlanItem[], ...actions: PlanItem['action'][]) => items.filter((i) => actions.includes(i.action));

function PreviewStep({
  uid,
  plan,
  mode,
  stale,
  confirm,
  onConfirm,
  onSafetyDownload,
  safetyBusy,
  safetyError,
}: {
  uid: string;
  plan: Plan;
  mode: RestoreMode;
  stale: boolean;
  confirm: string;
  onConfirm: (v: string) => void;
  onSafetyDownload: () => void;
  safetyBusy: boolean;
  safetyError: boolean;
}) {
  const long = isLongPreview(plan);
  const banner = stale && (
    <p className="bi-banner" role="status">
      {IMPORT_COPY.plan_changed}
    </p>
  );

  if (!hasChanges(plan)) {
    return (
      <>
        {banner}
        <p className="bi-nothing">Nothing to change. Your dashboard already matches this backup.</p>
      </>
    );
  }

  const live = plan.items.filter((i) => i.action !== 'unchanged' && i.action !== 'delete');
  const deletes = byAction(plan.items, 'delete');
  const unchanged = byAction(plan.items, 'unchanged');
  const ofKind = (...kinds: PlanItem['kind'][]) => live.filter((i) => kinds.includes(i.kind));
  const row = (i: PlanItem, k: number, showSection = false) => (
    <PlanRow key={`${i.kind}-${i.name}-${i.variant ?? ''}-${k}`} item={i} showSection={showSection} />
  );

  const warningLines = plan.warnings.map((w) => codeCopy(w.code, { n: w.count }));
  if (plan.ignored.fields > 0 && !plan.warnings.some((w) => w.code === 'unknown_fields')) {
    warningLines.push(codeCopy('unknown_fields', { n: plan.ignored.fields }));
  }

  const d = plan.summary.delete;
  const deleteLabel = [
    d.apps && plural(d.apps, 'app'),
    d.sections && plural(d.sections, 'section'),
    d.offers && plural(d.offers, 'offer'),
  ]
    .filter(Boolean)
    .join(', ');
  const sections = ofKind('section');
  const apps = ofKind('app', 'icon');
  const appItems = plan.items.filter((i) => i.kind === 'app' && i.action !== 'delete');
  const offers = ofKind('offer');
  const people = ofKind('adult', 'kid');
  const settings = ofKind('settings');
  const warnId = `${uid}-replace-warn`;
  const confirmId = `${uid}-replace-confirm`;

  return (
    <>
      {banner}
      <p className="bi-summary" data-testid="plan-summary">
        {restoreSummary(plan).join(' · ')}
      </p>
      {warningLines.map((w) => (
        <p key={w} className="settings-section-note bi-plan-warning">
          {w}
        </p>
      ))}

      {deletes.length > 0 && (
        <PlanGroup label={`Delete (${deleteLabel})`} defaultOpen long={long} rows={deletes.map((i, k) => row(i, k, true))} />
      )}
      {sections.length > 0 && (
        <PlanGroup label={`Sections (${groupCounts(sections)})`} defaultOpen long={long} rows={sections.map((i, k) => row(i, k))} />
      )}
      {apps.length > 0 && (
        <PlanGroup label={`Apps (${groupCounts(appItems)})`} defaultOpen long={long} rows={apps.map((i, k) => row(i, k, true))} />
      )}
      {offers.length > 0 && (
        <PlanGroup label={`App Library (${groupCounts(offers)})`} defaultOpen long={long} rows={offers.map((i, k) => row(i, k))} />
      )}
      {people.length > 0 && (
        <PlanGroup label={`People (${groupCounts(people)})`} defaultOpen long={long} rows={people.map((i, k) => row(i, k))} />
      )}
      {settings.length > 0 && (
        <PlanGroup label="Settings" defaultOpen long={long} rows={settings.map((i, k) => row(i, k))} />
      )}
      {unchanged.length > 0 && (
        <PlanGroup label={`Unchanged (${unchanged.length})`} defaultOpen={false} long={long} rows={unchanged.map((i, k) => row(i, k))} />
      )}

      {mode === 'replace' ? (
        <div className="bi-replace">
          <p id={warnId} className="bi-replace-warn">
            This deletes everything listed above, and everyone's favorites for those apps. Download a backup first if you
            might want it back.
          </p>
          <button type="button" className="settings-ghost-btn bi-btn" disabled={safetyBusy} onClick={onSafetyDownload}>
            {safetyBusy ? 'Preparing…' : 'Download backup'}
          </button>
          {safetyError && <p className="settings-error">Couldn't make the backup. Try again.</p>}
          <label htmlFor={confirmId} className="add-offer-label bi-confirm-label">
            Type REPLACE to confirm
          </label>
          <input
            id={confirmId}
            className="settings-input bi-confirm-input"
            value={confirm}
            autoComplete="off"
            spellCheck={false}
            aria-describedby={warnId}
            onChange={(e) => onConfirm(e.target.value)}
          />
        </div>
      ) : (
        <p className="settings-section-note">Nothing changes until you select Restore.</p>
      )}
    </>
  );
}

function PreviewFoot({
  plan,
  mode,
  busy,
  failed,
  confirmed,
  onBack,
  onApply,
  onClose,
}: {
  plan: Plan;
  mode: RestoreMode;
  busy: boolean;
  failed: string | null;
  confirmed: boolean;
  onBack: () => void;
  onApply: () => void;
  onClose: () => void;
}) {
  if (!hasChanges(plan)) {
    return (
      <button type="button" className="library-add bi-btn" onClick={onClose}>
        Close
      </button>
    );
  }
  const replace = mode === 'replace';
  return (
    <>
      {failed && (
        <div className="settings-error bi-foot-error" role="alert">
          <p>Restore didn't finish. Nothing was changed.</p>
          <p>{failed}</p>
        </div>
      )}
      <button type="button" className="settings-ghost-btn bi-btn" onClick={onBack}>
        Back
      </button>
      <button
        type="button"
        className={`library-add bi-btn${replace ? ' settings-danger-btn' : ''}`}
        disabled={busy || (replace && !confirmed)}
        onClick={onApply}
      >
        {failed ? 'Try again' : replace ? 'Replace' : 'Restore'}
      </button>
    </>
  );
}

// UX §3.4 — the summary again, past tense, plus a follow-up only when there is
// something to do.
function DoneStep({ result }: { result: Plan }) {
  const s = result.summary;
  const added = [
    s.create.sections && plural(s.create.sections, 'section'),
    s.create.apps && plural(s.create.apps, 'app'),
    s.create.icons && plural(s.create.icons, 'icon'),
    s.create.offers && plural(s.create.offers, 'App Library offer'),
    s.create.kids && plural(s.create.kids, 'kid'),
  ].filter(Boolean) as string[];
  const updated = [
    s.update.sections && plural(s.update.sections, 'section'),
    s.update.apps && plural(s.update.apps, 'app'),
    s.update.icons && plural(s.update.icons, 'icon'),
    s.update.offers && plural(s.update.offers, 'App Library offer'),
    s.update.people && plural(s.update.people, 'person', 'people'),
    s.update.settings && 'settings',
  ].filter(Boolean) as string[];
  const deleted = [
    s.delete.apps && plural(s.delete.apps, 'app'),
    s.delete.sections && plural(s.delete.sections, 'section'),
    s.delete.offers && plural(s.delete.offers, 'App Library offer'),
  ].filter(Boolean) as string[];
  const kids = result.items.filter((i) => i.kind === 'kid' && i.action === 'create').map((i) => i.name);
  const skippedPeople = result.items.filter((i) => i.kind === 'adult' && i.action === 'skip').length;

  return (
    <div className="bi-done">
      <p className="bi-done-title">
        <span aria-hidden="true">✓ </span>Restored.
      </p>
      <p data-testid="restore-result">
        {[
          deleted.length ? `Deleted ${listWords(deleted)}.` : '',
          added.length ? `Added ${listWords(added)}.` : '',
          updated.length ? `Updated ${listWords(updated)}.` : '',
        ]
          .filter(Boolean)
          .join(' ')}
      </p>
      {kids.length > 0 && (
        <p>
          Added {plural(kids.length, 'kid')}: {listWords(kids)}. Sign their device in from Accounts.
        </p>
      )}
      {skippedPeople > 0 && <p>Skipped {plural(skippedPeople, 'person', 'people')}: no account with this email.</p>}
    </div>
  );
}
