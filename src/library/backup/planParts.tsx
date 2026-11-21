import { forwardRef, useState, type ReactNode } from 'react';
import type { Plan, PlanItem } from './transferApi';
import { codeCopy, fieldWords } from '../importCopy';

// SPEC-backup-import UX §3.2 / §4.2 — the pieces both previews share: the
// summary line, a disclosure group, one plan row, the step heading, and the
// small file helpers. Styles: backup-import.css (lazy, never in the entry).

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// "a, b and c" — the past-tense result lines read as a sentence.
export function listWords(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

// UX §3.2 — the summary in plain counts, zero counts left out. Deletes lead,
// because in Replace they are what the admin must read first.
export function restoreSummary(p: Plan): string[] {
  const s = p.summary;
  const out: string[] = [];
  const push = (n: number, verb: string, one: string, many?: string) => {
    if (n > 0) out.push(`${verb} ${plural(n, one, many)}`);
  };
  push(s.delete.apps, 'Delete', 'app');
  push(s.delete.sections, 'Delete', 'section');
  push(s.delete.offers, 'Delete', 'App Library offer');
  push(s.create.sections, 'Add', 'section');
  push(s.update.sections, 'Update', 'section');
  push(s.create.apps, 'Add', 'app');
  push(s.update.apps, 'Update', 'app');
  push(s.create.icons, 'Add', 'icon');
  push(s.update.icons, 'Update', 'icon');
  push(s.create.offers, 'Add', 'App Library offer');
  push(s.update.offers, 'Update', 'App Library offer');
  push(s.create.kids, 'Add', 'kid');
  push(s.update.people, 'Update', 'person', 'people');
  if (s.update.settings > 0) out.push('Update settings');
  if (s.skipped > 0) out.push(`${s.skipped} skipped`);
  return out;
}

// Anything to write? A plan of only unchanged and skipped rows has nothing to apply.
export function hasChanges(p: Plan): boolean {
  const s = p.summary;
  const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
  return sum(s.create) + sum(s.update) + sum(s.delete) > 0;
}

// UX §3.2 — every mark is paired with words; color is never the only signal.
const MARKS: Record<PlanItem['action'], { mark: string; words: string }> = {
  create: { mark: '+', words: 'Add' },
  update: { mark: '~', words: 'Update' },
  delete: { mark: '–', words: 'Delete' },
  skip: { mark: '–', words: 'Skip' },
  unchanged: { mark: '=', words: 'Unchanged' },
};

export function itemNote(item: PlanItem): string {
  const parts: string[] = [];
  if (item.reason) parts.push(codeCopy(item.reason));
  if (item.action === 'update' && item.fields?.length && !item.reason) parts.push(fieldWords(item.fields));
  for (const w of item.warnings ?? []) parts.push(codeCopy(w, { icon: item.detail }));
  return parts.join(' ');
}

export function PlanRow({
  item,
  showSection = false,
  thumb,
  alreadyHere = false,
}: {
  item: PlanItem;
  showSection?: boolean;
  thumb?: string;
  // Homepage import: an existing app reads "Already here" (UX §4.2 "=").
  alreadyHere?: boolean;
}) {
  const m = MARKS[item.action];
  const words = alreadyHere ? 'Already here' : m.words;
  const mark = alreadyHere ? '=' : m.mark;
  const label = item.kind === 'icon' ? `${item.name} icon${item.variant ? ` (${item.variant})` : ''}` : item.name;
  return (
    <li className={`bi-plan-row bi-plan-row--${item.action}`} data-testid={`plan-row-${item.kind}-${item.name}`}>
      <span className="bi-mark" aria-hidden="true">
        {mark}
      </span>
      <span className="sr-only">{words}: </span>
      {thumb !== undefined && <img className="bi-thumb" src={thumb} alt="" width={24} height={24} />}
      <span className="bi-row-name">{label}</span>
      {showSection && <span className="bi-row-section">{item.section ?? 'Uncategorized'}</span>}
      <span className="bi-row-note">{itemNote(item)}</span>
    </li>
  );
}

// UX B-3 — a long preview shows the first 20 rows per group, then "Show all".
const LONG_PREVIEW = 50;
const FIRST_ROWS = 20;

export function PlanGroup({
  label,
  defaultOpen,
  rows,
  long,
  children,
}: {
  label: string;
  defaultOpen: boolean;
  rows: ReactNode[];
  // Whether the whole preview is long enough to truncate groups.
  long: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [all, setAll] = useState(false);
  const cut = long && !all && rows.length > FIRST_ROWS;
  return (
    <div className="bi-group">
      <button
        type="button"
        className="bi-group-toggle"
        data-testid="plan-group-toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
      </button>
      {open && (
        <>
          {children}
          {rows.length > 0 && <ul className="bi-rows">{cut ? rows.slice(0, FIRST_ROWS) : rows}</ul>}
          {cut && (
            <button type="button" className="settings-ghost-btn bi-show-all" onClick={() => setAll(true)}>
              Show all {rows.length}
            </button>
          )}
        </>
      )}
    </div>
  );
}

export const isLongPreview = (p: Plan) => p.items.length > LONG_PREVIEW;

// "2 to add, 1 to update, 1 unchanged, 1 skipped" for a group heading.
export function groupCounts(items: PlanItem[]): string {
  const n = (a: PlanItem['action']) => items.filter((i) => i.action === a).length;
  const parts: string[] = [];
  if (n('delete')) parts.push(`${n('delete')} to delete`);
  if (n('create')) parts.push(`${n('create')} to add`);
  if (n('update')) parts.push(`${n('update')} to update`);
  if (n('unchanged')) parts.push(`${n('unchanged')} unchanged`);
  if (n('skip')) parts.push(`${n('skip')} skipped`);
  return parts.join(', ');
}

// UX §7 — the step line is part of the heading's accessible name ("Restore from
// backup, step 2 of 3"); the heading takes focus on every step change.
export const StepHeading = forwardRef<HTMLHeadingElement, { id: string; title: string; step: number; extra?: string }>(
  function StepHeading({ id, title, step, extra }, ref) {
    return (
      <h2 ref={ref} id={id} tabIndex={-1} className="library-title bi-title" aria-label={`${title}, step ${step} of 3`}>
        {title}
        <span className="bi-step" aria-hidden="true">
          Step {step} of 3{extra ? ` · ${extra}` : ''}
        </span>
      </h2>
    );
  },
);

// The discard confirm (the ServiceForm/KidEditor dirty-close pattern).
export function DiscardStrip({ question, onKeep, onDiscard }: { question: string; onKeep: () => void; onDiscard: () => void }) {
  return (
    <div className="bi-strip" role="group" aria-label={question}>
      <span className="bi-strip-text">{question}</span>
      <button type="button" className="settings-ghost-btn bi-btn" onClick={onKeep} autoFocus>
        Keep
      </button>
      <button type="button" className="library-add settings-danger-btn bi-btn" onClick={onDiscard}>
        Discard
      </button>
    </div>
  );
}

// Save a Blob under a filename: the backup file and the Gatus snippet.
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// Read a picked file as text. jsdom's Blob has no text(), so FileReader is the
// fallback (the same split icons.ts makes for arrayBuffer).
export function readText(file: Blob): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
