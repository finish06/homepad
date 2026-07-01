import { useCallback, useEffect, useRef, useState } from 'react';
import {
  categories as fetchCategories,
  createCategory,
  saveCategoryWidth,
  services as fetchServices,
  type Category,
  type Service,
} from './api';
import { boxesFromData, effectiveWidth, MAX_WIDTH, type Box } from './appGrid';
import { iconSrc, initialBadge } from './icons';
import { useServicesContext } from './services';
import { useResolvedTheme } from './theme';

// AppGrid (SPEC-app-grid) — the primary dashboard layout: a 6-column page grid
// of boxes (= categories). Each box's width (1–6) drives BOTH its column span
// and its links-per-row via one `--w` CSS variable; the greedy pack + wrap and
// the ≤640px 2-column cap are pure CSS (index.css `.app-grid`). This component
// owns the data fetch, the admin width selector, and the "+ Add box" flow. It
// replaces the v14 floating-panel Catalog layout (§2).

const WIDTHS = Array.from({ length: MAX_WIDTH }, (_, i) => i + 1); // [1..6]

// useIsMobile tracks the ≤640px breakpoint (AC-022). CSS min() can't be used
// inside repeat()/span, so the effective (mobile-capped) width is computed in JS
// and written to `--w`; the page grid itself flips to 2 columns via CSS media.
function useIsMobile(): boolean {
  const query = '(max-width: 640px)';
  const [mobile, setMobile] = useState(() => window.matchMedia?.(query)?.matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const onChange = () => setMobile(mq.matches);
    onChange();
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return mobile;
}

export default function AppGrid({ isAdmin }: { isAdmin: boolean }) {
  // Services come from the shared provider (the SAME array the launcher + live
  // poll use — §3/A12); AppGrid self-fetches only when rendered without a
  // provider (isolated tests). Categories (box list + widths) AppGrid owns.
  const ctx = useServicesContext();
  const [cats, setCats] = useState<Category[]>([]);
  const [catsLoaded, setCatsLoaded] = useState(false);
  const [ownSvcs, setOwnSvcs] = useState<Service[] | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    let alive = true;
    fetchCategories().then((c) => {
      if (!alive) return;
      setCats(c);
      setCatsLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (ctx) return; // provider owns the services load
    let alive = true;
    fetchServices().then((s) => alive && setOwnSvcs(s));
    return () => {
      alive = false;
    };
  }, [ctx]);

  const svcs = ctx ? ctx.items : ownSvcs;
  const loading = !catsLoaded || svcs === null;

  // Optimistic width change: update local state immediately (AC-015 — no
  // reload), persist, and roll back on failure (§4A persist).
  const changeWidth = useCallback(
    async (id: string, width: number) => {
      let prev = 3;
      setCats((cs) =>
        cs.map((c) => {
          if (c.id === id) prev = c.gridWidth ?? 3;
          return c.id === id ? { ...c, gridWidth: width } : c;
        }),
      );
      const ok = await saveCategoryWidth(id, width);
      if (!ok) {
        setCats((cs) => cs.map((c) => (c.id === id ? { ...c, gridWidth: prev } : c)));
      }
    },
    [],
  );

  const onCreate = useCallback(async (title: string) => {
    const r = await createCategory(title);
    if (r.ok && r.category) {
      setCats((cs) => [...cs, { ...r.category!, gridWidth: r.category!.gridWidth ?? 3 }]);
      setAddOpen(false);
      return true;
    }
    return r.error ?? 'Could not create box';
  }, []);

  if (loading) {
    return (
      <div className="app-spinner" role="status" aria-live="polite" data-testid="app-grid-loading">
        <span className="sr-only">Loading dashboard…</span>
      </div>
    );
  }

  const boxes = boxesFromData(cats, svcs ?? []);

  return (
    <>
      <div className="app-grid" data-testid="app-grid">
        {boxes.map((box) => (
          <BoxCard key={box.id || '__uncat__'} box={box} isAdmin={isAdmin} isMobile={isMobile} onWidth={changeWidth} />
        ))}
        {isAdmin && (
          <button
            type="button"
            className="app-grid-add"
            data-testid="add-box"
            onClick={() => setAddOpen(true)}
          >
            + Add box
          </button>
        )}
      </div>
      {addOpen && <AddBoxModal onCreate={onCreate} onClose={() => setAddOpen(false)} />}
    </>
  );
}

// A single box: glass container, header (title + admin width selector), and the
// inner tools grid (or the designed empty state, §6.6).
function BoxCard({
  box,
  isAdmin,
  isMobile,
  onWidth,
}: {
  box: Box;
  isAdmin: boolean;
  isMobile: boolean;
  onWidth: (id: string, width: number) => void;
}) {
  const theme = useResolvedTheme();
  // A synthetic Uncategorized box (empty id) has no real category → no selector.
  const showSelector = isAdmin && box.id !== '';
  return (
    <section
      className="app-grid-box"
      data-testid="app-grid-box"
      data-box-id={box.id}
      style={{ ['--w' as string]: effectiveWidth(box.width, isMobile) }}
    >
      <header className="app-grid-box-header">
        <h2 className="app-grid-box-title" data-testid="box-title" title={box.title}>
          {box.title}
        </h2>
        {showSelector && (
          <WidthSelector width={box.width} onPick={(w) => onWidth(box.id, w)} />
        )}
      </header>
      {box.tools.length === 0 ? (
        <p className="app-grid-empty" data-testid="box-empty">
          {isAdmin ? 'No apps yet — add from the Library.' : 'No apps in this box.'}
        </p>
      ) : (
        <div className="app-grid-tools" data-testid="box-tools">
          {box.tools.map((s) => (
            <ToolLink key={s.id} service={s} theme={theme} />
          ))}
        </div>
      )}
    </section>
  );
}

// One tool link: icon plate + name, opens the tool in a new tab (AC-011, §6.4).
// The visible name truncates; the accessible name (aria-label) + native title
// carry the full string (§6.2.1).
function ToolLink({ service, theme }: { service: Service; theme: 'light' | 'dark' }) {
  return (
    <a
      className="app-grid-tool"
      data-testid="tool-link"
      href={service.url}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={service.name}
      title={service.name}
    >
      <span className="app-grid-tool-icon">
        <img
          src={iconSrc(service, theme, 0)}
          alt=""
          data-fallback={initialBadge(service.name)}
          onError={onIconError}
        />
      </span>
      <span className="app-grid-tool-name">{service.name}</span>
    </a>
  );
}

function onIconError(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  const fb = img.dataset.fallback;
  if (fb && img.src !== fb) img.src = fb;
}

// The admin width selector: six 1–6 buttons; the active one carries fill + weight
// (never color alone, §6.3). Each button is a ≥44px hit area (CSS).
function WidthSelector({ width, onPick }: { width: number; onPick: (w: number) => void }) {
  return (
    <div className="app-grid-width" data-testid="width-selector" role="group" aria-label="Box width">
      <span className="app-grid-width-label" aria-hidden="true">
        width
      </span>
      {WIDTHS.map((n) => {
        const selected = n === width;
        return (
          <button
            key={n}
            type="button"
            data-testid={`width-btn-${n}`}
            className={`app-grid-width-btn${selected ? ' is-selected' : ''}`}
            aria-pressed={selected}
            aria-label={`Width ${n}`}
            onClick={() => onPick(n)}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

// "+ Add box" title-prompt modal (§6.5) — styled dialog, not window.prompt.
// Confirm → create; empty/whitespace disables Create; Esc / scrim / Cancel → no
// box (AC-021).
function AddBoxModal({
  onCreate,
  onClose,
}: {
  onCreate: (title: string) => Promise<true | string>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async () => {
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    const r = await onCreate(t);
    if (r !== true) {
      setError(r);
      setBusy(false);
    }
  };

  return (
    <div
      className="launcher-overlay add-offer-overlay"
      data-testid="add-box-modal"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="add-offer-panel" role="dialog" aria-modal="true" aria-label="Add box">
        <h2 className="add-offer-title">Add box</h2>
        <label className="add-offer-field">
          <span className="add-offer-label">Box title</span>
          <input
            id="add-box-input"
            data-testid="add-box-input"
            ref={inputRef}
            className="settings-input"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setError('');
            }}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </label>
        {error && <p className="app-grid-add-error" role="alert">{error}</p>}
        <div className="add-offer-actions">
          <button
            type="button"
            className="settings-ghost-btn"
            data-testid="add-box-cancel"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="library-add"
            data-testid="add-box-create"
            disabled={!title.trim() || busy}
            onClick={submit}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
