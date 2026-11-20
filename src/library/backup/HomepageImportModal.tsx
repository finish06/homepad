import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import Modal from '../../ui/Modal';
import { trapTab } from '../../ui/trapTab';
import { initialBadge } from '../../lib/icons';
import {
  applyHomepageImport,
  previewHomepageImport,
  TransferError,
  type HomepageFile,
  type HomepageTexts,
  type Plan,
  type PlanItem,
} from './transferApi';
import { errorCopy, IMPORT_COPY } from '../importCopy';
import { DiscardStrip, fileSize, hasChanges, isLongPreview, plural, PlanGroup, PlanRow, readText, saveBlob, StepHeading } from './planParts';
import './backup-import.css';

// SPEC-backup-import UX §4 (TASK-305) — Import from Homepage, in three steps:
// Add files → Preview → Done. Only services.yaml is required (OQ-5 (c)). The
// server parses the YAML (spec §10: no YAML library in the browser); this modal
// shows its plan, its parse errors next to the right input, and the Gatus
// snippet for apps that had siteMonitor or ping (OQ-9 (b)).

type Step = 1 | 2 | 3;
type Source = 'paste' | 'upload';
type FileState = { text: string; source: Source; upload: { name: string; size: number } | null };
type FieldError = { file: HomepageFile; message: string; line?: number };

const TITLE = 'Import from Homepage';
const FILES: { key: HomepageFile; label: string; hint: string }[] = [
  { key: 'services', label: 'services.yaml', hint: '(required)' },
  { key: 'bookmarks', label: 'bookmarks.yaml', hint: '(optional)' },
  { key: 'settings', label: 'settings.yaml', hint: '(optional, for section order)' },
];
const DROPPED_WORDS: Record<string, string> = {
  widgets: 'widgets',
  docker: 'Docker stats',
  kubernetes: 'Kubernetes settings',
};

const emptyFile = (): FileState => ({ text: '', source: 'paste', upload: null });
const snippetCount = (s: string) => (s.match(/^\s*- name:/gm) ?? []).length;

// Select line `n` (1-based) of a pasted file, so the admin sees where the parser
// stopped (UX §4.1).
function selectLine(el: HTMLTextAreaElement, n: number) {
  const lines = el.value.split('\n');
  const idx = Math.min(Math.max(n, 1), lines.length) - 1;
  const start = lines.slice(0, idx).reduce((a, l) => a + l.length + 1, 0);
  el.focus();
  el.setSelectionRange(start, start + lines[idx].length);
}

export default function HomepageImportModal({ onClose, onApplied }: { onClose: () => void; onApplied?: () => void }) {
  const uid = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const areaRefs = useRef<Partial<Record<HomepageFile, HTMLTextAreaElement | null>>>({});
  const [step, setStep] = useState<Step>(1);
  const [files, setFiles] = useState<Record<HomepageFile, FileState>>({
    services: emptyFile(),
    bookmarks: emptyFile(),
    settings: emptyFile(),
  });
  const [open, setOpen] = useState<Record<HomepageFile, boolean>>({ services: true, bookmarks: false, settings: false });
  const [fieldError, setFieldError] = useState<FieldError | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [result, setResult] = useState<Plan | null>(null);
  const [stale, setStale] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [copied, setCopied] = useState(false);
  const pendingSelect = useRef<FieldError | null>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  // After a parse error renders (and an optional file has opened), select the line.
  useEffect(() => {
    const p = pendingSelect.current;
    if (!p) return;
    pendingSelect.current = null;
    const el = areaRefs.current[p.file];
    if (!el) return;
    if (p.line) selectLine(el, p.line);
    else el.focus();
  }, [fieldError, open]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  // Only services.yaml is required; an empty optional file is left out.
  const texts = (): HomepageTexts => {
    const t: HomepageTexts = { services: files.services.text };
    if (files.bookmarks.text.trim()) t.bookmarks = files.bookmarks.text;
    if (files.settings.text.trim()) t.settings = files.settings.text;
    return t;
  };
  const dirty = Object.values(files).some((f) => f.text.trim() !== '');

  function setFile(key: HomepageFile, patch: Partial<FileState>) {
    setFiles((cur) => ({ ...cur, [key]: { ...cur[key], ...patch } }));
    if (fieldError?.file === key) setFieldError(null);
  }

  async function upload(key: HomepageFile, file: File | undefined) {
    if (!file) return;
    setFile(key, { text: await readText(file), upload: { name: file.name, size: file.size } });
  }

  function showError(e: unknown) {
    if (e instanceof TransferError && e.file) {
      const fe = { file: e.file, message: errorCopy(e), line: e.line };
      setFieldError(fe);
      if (files[e.file].source === 'paste') pendingSelect.current = fe;
      setOpen((cur) => ({ ...cur, [e.file!]: true }));
      return;
    }
    setError(e instanceof TransferError ? errorCopy(e) : IMPORT_COPY.failed);
  }

  async function preview() {
    setBusy(true);
    setError(null);
    setFieldError(null);
    try {
      const p = await previewHomepageImport(texts());
      setPlan(p);
      setStale(false);
      setFailed(null);
      setStep(2);
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!plan?.planHash) return;
    setBusy(true);
    setFailed(null);
    try {
      const r = await applyHomepageImport(texts(), plan.planHash);
      setResult(r);
      setStep(3);
      onApplied?.();
    } catch (e) {
      if (e instanceof TransferError && e.code === 'plan_changed') {
        let fresh = e.plan ?? null;
        if (!fresh) {
          try {
            fresh = await previewHomepageImport(texts());
          } catch (again) {
            setFailed(again instanceof TransferError ? errorCopy(again) : IMPORT_COPY.failed);
            return;
          }
        }
        setPlan(fresh);
        setStale(true);
        return;
      }
      setFailed(e instanceof TransferError ? errorCopy(e) : IMPORT_COPY.failed);
    } finally {
      setBusy(false);
    }
  }

  async function copySnippet(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  function attemptClose() {
    if (dirty && step !== 3) {
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
    e.stopPropagation();
    if (discarding) {
      setDiscarding(false);
      return;
    }
    attemptClose();
  }

  const headingId = `${uid}-title`;

  return createPortal(
    <Modal
      onDismiss={attemptClose}
      overlayClassName="launcher-overlay add-offer-overlay bi-overlay"
      overlayTestId="homepage-import-overlay"
      escapeDismisses={false}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        data-testid="homepage-import-modal"
        className="kid-editor-panel bi-panel"
        onKeyDown={onKeyDown}
      >
        <div className="library-head">
          <StepHeading ref={headingRef} id={headingId} title={TITLE} step={step} />
          <button type="button" aria-label={`Close ${TITLE}`} onClick={attemptClose} className="launcher-clear library-close">
            ✕
          </button>
        </div>

        <div className="bi-body">
          {step === 1 && (
            <>
              {FILES.map(({ key, label, hint }) => (
                <FileInput
                  key={key}
                  uid={uid}
                  fileKey={key}
                  label={label}
                  hint={hint}
                  state={files[key]}
                  open={open[key]}
                  collapsible={key !== 'services'}
                  error={fieldError?.file === key ? fieldError.message : null}
                  areaRef={(el) => {
                    areaRefs.current[key] = el;
                  }}
                  onToggle={() => setOpen((cur) => ({ ...cur, [key]: !cur[key] }))}
                  onText={(text) => setFile(key, { text, upload: null })}
                  onSource={(source) => setFile(key, { source })}
                  onUpload={(f) => void upload(key, f)}
                />
              ))}
              <p className="settings-section-note bi-note">
                Apps found by Docker labels or Kubernetes aren't in these files, so they won't come across. Your current apps
                stay as they are.
              </p>
            </>
          )}
          {step === 2 && plan && (
            <ImportPreview plan={plan} stale={stale} copied={copied} onCopy={copySnippet} />
          )}
          {step === 3 && result && <ImportDone result={result} onCopy={copySnippet} />}
          {step !== 2 && (
            <span className="sr-only" aria-live="polite">
              {step === 3 && copied ? 'Copied' : ''}
            </span>
          )}
        </div>

        {discarding ? (
          <DiscardStrip question="Discard this import?" onKeep={() => setDiscarding(false)} onDiscard={onClose} />
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
                  disabled={!files.services.text.trim() || busy}
                  onClick={() => void preview()}
                >
                  {busy ? 'Checking…' : 'Preview'}
                </button>
              </>
            )}
            {step === 2 && plan && (
              hasChanges(plan) ? (
                <>
                  {failed && (
                    <div className="settings-error bi-foot-error" role="alert">
                      <p>Import didn't finish. Nothing was changed.</p>
                      <p>{failed}</p>
                    </div>
                  )}
                  <button type="button" className="settings-ghost-btn bi-btn" onClick={() => setStep(1)}>
                    Back
                  </button>
                  <button type="button" className="library-add bi-btn" disabled={busy} onClick={() => void apply()}>
                    {failed ? 'Try again' : primaryLabel(plan)}
                  </button>
                </>
              ) : (
                <button type="button" className="library-add bi-btn" onClick={onClose}>
                  Close
                </button>
              )
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

// UX §4.2 — the primary button names the count; a re-import that only fills in
// status keys says so.
function primaryLabel(plan: Plan): string {
  const add = plan.summary.create.apps;
  if (add > 0) return `Import ${plural(add, 'app')}`;
  return `Turn on status for ${plural(plan.summary.update.apps, 'app')}`;
}

function FileInput({
  uid,
  fileKey,
  label,
  hint,
  state,
  open,
  collapsible,
  error,
  areaRef,
  onToggle,
  onText,
  onSource,
  onUpload,
}: {
  uid: string;
  fileKey: HomepageFile;
  label: string;
  hint: string;
  state: FileState;
  open: boolean;
  collapsible: boolean;
  error: string | null;
  areaRef: (el: HTMLTextAreaElement | null) => void;
  onToggle: () => void;
  onText: (t: string) => void;
  onSource: (s: Source) => void;
  onUpload: (f: File | undefined) => void;
}) {
  const areaId = `${uid}-${fileKey}`;
  const errId = `${uid}-${fileKey}-err`;
  const lines = state.text.split('\n').length;
  return (
    <div className="bi-file">
      {collapsible ? (
        <button type="button" className="bi-group-toggle bi-file-toggle" aria-expanded={open} onClick={onToggle}>
          {label} <span className="add-offer-optional">{hint}</span>
        </button>
      ) : (
        <p className="add-offer-label">
          {label} <span className="add-offer-optional">{hint}</span>
        </p>
      )}
      {open && (
        <>
          {/* The click-action segmented control (v21/#428), reused as is. */}
          <div
            role="group"
            aria-label={`${label} input`}
            className="inline-flex w-full items-center rounded-lg border border-neutral-200 p-0.5 dark:border-neutral-700 bi-switch"
          >
            {(['paste', 'upload'] as const).map((s) => {
              const active = state.source === s;
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSource(s)}
                  className={`inline-flex min-h-[44px] flex-1 min-[375px]:min-w-0 items-center justify-center whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    active
                      ? 'bg-indigo-600 text-white'
                      : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'
                  }`}
                >
                  {s === 'paste' ? 'Paste' : 'Upload'}
                </button>
              );
            })}
          </div>
          {state.source === 'paste' ? (
            <textarea
              ref={areaRef}
              id={areaId}
              aria-label={label}
              className="settings-input bi-yaml"
              rows={Math.min(Math.max(lines, 12), 24)}
              spellCheck={false}
              value={state.text}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errId : undefined}
              onChange={(e) => onText(e.target.value)}
            />
          ) : (
            <div className="bi-upload">
              <label htmlFor={`${areaId}-file`} className="add-offer-label">
                Choose {label}
              </label>
              <input
                id={`${areaId}-file`}
                type="file"
                accept=".yaml,.yml,application/yaml,text/yaml"
                className="bi-file-input"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errId : undefined}
                onChange={(e) => onUpload(e.target.files?.[0])}
              />
              {state.upload && (
                <p className="settings-section-note" data-testid={`upload-meta-${fileKey}`}>
                  {state.upload.name} · {fileSize(state.upload.size)}
                </p>
              )}
            </div>
          )}
          {error && (
            <p id={errId} className="settings-error">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}

type SectionGroup = { name: string | null; isNew: boolean; items: PlanItem[] };

// UX §4.2 — grouped by section, in the order the sections will appear: the
// plan's section rows first, then any section only an app names.
function bySection(plan: Plan): SectionGroup[] {
  const groups: SectionGroup[] = [];
  const find = (name: string | null) => groups.find((g) => g.name === name);
  for (const s of plan.items.filter((i) => i.kind === 'section')) {
    groups.push({ name: s.name, isNew: s.action === 'create', items: [] });
  }
  for (const a of plan.items.filter((i) => i.kind === 'app' && i.action !== 'skip')) {
    const name = a.section ?? null;
    let g = find(name);
    if (!g) {
      g = { name, isNew: false, items: [] };
      groups.push(g);
    }
    g.items.push(a);
  }
  return groups.filter((g) => g.items.length > 0);
}

function ImportPreview({
  plan,
  stale,
  copied,
  onCopy,
}: {
  plan: Plan;
  stale: boolean;
  copied: boolean;
  onCopy: (s: string) => void;
}) {
  const long = isLongPreview(plan);
  const s = plan.summary;
  const already = plan.items.filter((i) => i.kind === 'app' && i.reason === 'already_here').length;
  const summary = [
    s.create.sections > 0 && `Add ${plural(s.create.sections, 'section')}`,
    s.create.apps > 0 && `Add ${plural(s.create.apps, 'app')}`,
    s.update.apps > 0 && `Turn on status for ${plural(s.update.apps, 'app')}`,
    already > 0 && `${already} already here`,
    s.skipped > 0 && `${s.skipped} skipped`,
  ].filter(Boolean);
  const skipped = plan.items.filter((i) => i.action === 'skip');
  const notImported = [...plan.ignored.dropped.map((d) => DROPPED_WORDS[d] ?? d), ...plan.ignored.settings];
  const row = (i: PlanItem, k: number) => (
    <PlanRow
      key={`${i.name}-${k}`}
      item={i}
      thumb={i.icon || initialBadge(i.name)}
      alreadyHere={i.reason === 'already_here'}
    />
  );

  return (
    <>
      {stale && (
        <p className="bi-banner" role="status">
          {IMPORT_COPY.plan_changed}
        </p>
      )}
      {summary.length > 0 && (
        <p className="bi-summary" data-testid="plan-summary">
          {summary.join(' · ')}
        </p>
      )}
      {!hasChanges(plan) && <p className="bi-nothing">Everything here is already on your dashboard.</p>}

      {bySection(plan).map((g) => (
        <PlanGroup
          key={g.name ?? '__uncat__'}
          label={`${g.name ?? 'Uncategorized'}${g.isNew ? ' (new section)' : ''}`}
          defaultOpen
          long={long}
          rows={g.items.map(row)}
        />
      ))}
      {skipped.length > 0 && (
        <PlanGroup label={`Skipped (${skipped.length})`} defaultOpen long={long} rows={skipped.map(row)} />
      )}

      {plan.gatusSnippet && <StatusChecks snippet={plan.gatusSnippet} copied={copied} onCopy={onCopy} />}

      {notImported.length > 0 && (
        <p className="settings-section-note" data-testid="not-imported">
          Not imported: {notImported.join(', ')}.{plan.ignored.fields > 0 ? ` (${plural(plan.ignored.fields, 'setting')})` : ''}
        </p>
      )}
      {hasChanges(plan) && <p className="settings-section-note">Nothing changes until you select Import.</p>}
    </>
  );
}

function StatusChecks({ snippet, copied, onCopy }: { snippet: string; copied: boolean; onCopy: (s: string) => void }) {
  const n = snippetCount(snippet);
  return (
    <section className="bi-status" aria-label="Status checks">
      <h3 className="settings-section-title">Status checks</h3>
      <p className="bi-status-text">
        {plural(n, 'app')} had siteMonitor or ping. Homepad reads status from Gatus. Add these to your Gatus config, then
        import again to turn on their status.
      </p>
      <textarea className="settings-input bi-yaml bi-snippet" aria-label="Gatus endpoints" readOnly rows={8} value={snippet} />
      <div className="bi-status-actions">
        <span className="bi-copied" data-testid="copy-status" aria-live="polite">
          {copied ? 'Copied' : ''}
        </span>
        <button type="button" className="settings-ghost-btn bi-btn" onClick={() => onCopy(snippet)}>
          Copy
        </button>
        <button
          type="button"
          className="settings-ghost-btn bi-btn"
          onClick={() => saveBlob(new Blob([snippet], { type: 'application/yaml' }), 'gatus-endpoints.yaml')}
        >
          Download gatus-endpoints.yaml
        </button>
      </div>
    </section>
  );
}

// UX §4.3 — where the apps went, and what to do next.
function ImportDone({ result, onCopy }: { result: Plan; onCopy: (s: string) => void }) {
  const s = result.summary;
  const apps = s.create.apps;
  let title: string;
  if (apps > 0 && s.create.sections > 0) {
    title = `Imported ${plural(apps, 'app')} into ${plural(s.create.sections, 'new section')}.`;
  } else if (apps > 0) {
    title = `Imported ${plural(apps, 'app')}.`;
  } else {
    title = `Turned on status for ${plural(s.update.apps, 'app')}.`;
  }
  return (
    <div className="bi-done">
      <p className="bi-done-title">
        <span aria-hidden="true">✓ </span>
        {title}
      </p>
      {apps > 0 && (
        <p>
          They're at the end of your dashboard.
          {result.otherAccounts > 0 ? ' Other people see them A–Z until they arrange their own.' : ''}
        </p>
      )}
      {result.gatusSnippet && (
        <div className="bi-next">
          <p>Next: add the status checks to Gatus.</p>
          <button type="button" className="settings-ghost-btn bi-btn" onClick={() => onCopy(result.gatusSnippet!)}>
            Copy snippet
          </button>
        </div>
      )}
    </div>
  );
}
