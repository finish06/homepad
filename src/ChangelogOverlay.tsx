import { useEffect, useRef, useState } from 'react';
import changelog from './changelog.json';

// v15 — changelog overlay. Modeled on fleet-feed's Option B+ design: a two-panel
// dialog (version list + change detail) with a fixed 88px chip gutter so every
// description starts at the same x regardless of chip length. Data is a static
// JSON import — no backend call.

export type ChangeType = 'feature' | 'enhancement' | 'bug-fix' | 'security';
export interface Change {
  type: string;
  text: string;
}
export interface Version {
  version: string;
  date: string;
  changes: Change[];
}
export interface Changelog {
  pending: Change[];
  versions: Version[];
}

// §2 chip color table. Backgrounds are semi-transparent rgba so they read against
// both the white (light) and neutral-900 (dark) dialog surface with no override.
// Text color is applied via the per-type CSS class (light + .dark) in index.css.
const CHIP_BG: Record<string, string> = {
  feature: 'rgba(34, 197, 94, 0.14)',
  enhancement: 'rgba(58, 142, 232, 0.15)',
  'bug-fix': 'rgba(217, 164, 65, 0.15)',
  security: 'rgba(248, 113, 113, 0.14)',
};
const CHIP_FG: Record<string, string> = {
  feature: '#16a34a',
  enhancement: '#2563eb',
  'bug-fix': '#b45309',
  security: '#dc2626',
};
const NEUTRAL_BG = 'rgba(138, 143, 152, 0.15)';
const NEUTRAL_FG = '#6b7280';

// Helper (§6): canonical inline style for a chip type, neutral fallback for any
// unknown type so an entry never crashes or hides.
export function chipStyle(type: string): { background: string; color: string } {
  return { background: CHIP_BG[type] ?? NEUTRAL_BG, color: CHIP_FG[type] ?? NEUTRAL_FG };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Format an ISO 'YYYY-MM-DD' as 'Jun 23, 2026' without going through Date() —
// avoids the UTC-midnight-to-local off-by-one-day shift.
function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

function Chip({ type }: { type: Change['type'] }) {
  const known = type in CHIP_BG;
  return (
    <span
      className={`changelog-chip changelog-chip--${known ? type : 'unknown'}`}
      style={{ background: chipStyle(type).background }}
    >
      {type}
    </span>
  );
}

function ChangeRows({ changes }: { changes: Change[] }) {
  return (
    <>
      {changes.map((c, i) => (
        <div className="changelog-row" key={i}>
          <span className="changelog-chip-cell">
            <Chip type={c.type} />
          </span>
          <span className="changelog-row-text">{c.text}</span>
        </div>
      ))}
    </>
  );
}

export default function ChangelogOverlay({
  open,
  onClose,
  data = changelog as Changelog,
}: {
  open: boolean;
  onClose: () => void;
  data?: Changelog;
}) {
  // null = the "Pending next release" bucket; otherwise the selected version str.
  // Default per AC-012: pending when it has entries, else the version matching
  // the running build, else the newest release. The initializer re-runs on each
  // open (the dialog unmounts when closed) so re-opening lands on the default.
  const defaultSelection = (): string | null => {
    if (data.pending.length >= 1) return null;
    const match = data.versions.find((v) => v.version === __APP_VERSION__);
    return (match ?? data.versions[0])?.version ?? null;
  };
  const [selected, setSelected] = useState<string | null>(defaultSelection);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
      // AC-009 — focus returns to the trigger (the footer button).
      opener?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  }

  const activeVersion = selected === null ? null : data.versions.find((v) => v.version === selected);

  return (
    <div
      className="changelog-overlay"
      data-testid="changelog-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Changelog"
        className="changelog-dialog"
        onKeyDown={onKeyDown}
      >
        <header className="changelog-head">
          <h2 className="changelog-title">Changelog</h2>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close changelog"
            className="changelog-close"
            onClick={onClose}
          >
            ✕
          </button>
        </header>

        <div className="changelog-body">
          <nav className="changelog-versions" aria-label="Versions">
            <button
              type="button"
              className={`changelog-version-btn${selected === null ? ' is-selected' : ''}`}
              aria-current={selected === null ? 'true' : undefined}
              onClick={() => setSelected(null)}
            >
              Pending next release
            </button>
            {data.versions.map((v) => (
              <button
                key={v.version}
                type="button"
                className={`changelog-version-btn${selected === v.version ? ' is-selected' : ''}`}
                aria-current={selected === v.version ? 'true' : undefined}
                onClick={() => setSelected(v.version)}
              >
                v{v.version}
              </button>
            ))}
          </nav>

          <section className="changelog-detail">
            {selected === null ? (
              data.pending.length === 0 ? (
                <p className="changelog-empty">Nothing queued yet.</p>
              ) : (
                <ChangeRows changes={data.pending} />
              )
            ) : activeVersion ? (
              <>
                <div className="changelog-detail-head">
                  <span className="changelog-detail-version">v{activeVersion.version}</span>
                  <span className="changelog-detail-date">{formatDate(activeVersion.date)}</span>
                </div>
                <ChangeRows changes={activeVersion.changes} />
              </>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
