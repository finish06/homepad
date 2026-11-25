import Modal from '../ui/Modal';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { addFromLibrary, listLibrary, type LibraryOffer, type Service } from '../api';
import { initialBadge } from '../lib/icons';
import { categoryHue } from '../lib/categoryColor';

// v9.3 §7.2 — the browse + add-from-library surface. A modal mirroring the v8
// launcher's overlay/panel tokens (no new palette): it lists the admin-curated
// App Library (`GET /api/library`) and copies an offer onto MY dashboard
// (`POST /api/library/{id}/add`). Any authenticated user; custom-add stays
// available (delegated to the existing ServiceForm via onCustomAdd). CLIENT-SIDE
// only — no homepad-api change.

// SPEC-ui-quick-wins AC-015 — the Added filter's three choices.
type Show = 'all' | 'not-added' | 'added';
const SHOW_OPTIONS: { id: Show; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'not-added', label: 'Not added' },
  { id: 'added', label: 'Added' },
];
// What to say when the radio filter alone leaves nothing to show.
const NOTHING_SHOWN: Record<Show, string> = {
  all: 'No apps to show.',
  'not-added': 'Every app is already added.',
  added: 'No added apps yet.',
};

export default function LibraryBrowse({
  onClose,
  onAdded,
  onCustomAdd,
  isAdmin = false,
  onManageLibrary,
  targetCategory,
}: {
  onClose: () => void;
  // Called with each freshly-copied service so the dashboard can reflect it
  // without a refetch (the new tile appears once the modal is dismissed).
  onAdded: (service: Service) => void;
  // Opens the existing "add a custom app" form (§7.2 — unchanged from v6).
  onCustomAdd: () => void;
  isAdmin?: boolean;
  // Admin-only: jump to the library-management view (Settings §7.3).
  onManageLibrary?: () => void;
  // SPEC-dashboard-empty-loading §3.3 — opened from an empty box: the heading
  // names the box and every add files into it, whatever group the offer is
  // listed under. Absent (the Gear): "App Library", adds land in Uncategorized.
  targetCategory?: { id: string; title: string };
}) {
  const [offers, setOffers] = useState<LibraryOffer[] | null>(null);
  const [query, setQuery] = useState('');
  // SPEC-ui-quick-wins AC-015 — All · Not added · Added.
  const [show, setShow] = useState<Show>('all');
  // The id currently being added — disables its button so a double-click can't
  // fire two copies by accident (an intentional "Add again" still can).
  const [busyId, setBusyId] = useState<string | null>(null);
  // Politely announced to screen readers after each successful add (§9).
  const [announce, setAnnounce] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    listLibrary().then(setOffers);
  }, []);

  // Move focus into the modal on open, restore it to the opener on close, and
  // lock body scroll while open — same pattern as the v8 launcher (§9).
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, []);

  // Esc + scrim dismiss live in Modal (§9); this handler keeps the focus trap.
  function onPanelKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab' || !panelRef.current) return;
    // Focus trap — Tab/Shift+Tab cycle only within the dialog.
    const focusables = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  async function add(offer: LibraryOffer) {
    setBusyId(offer.id);
    const r = targetCategory ? await addFromLibrary(offer.id, targetCategory.id) : await addFromLibrary(offer.id);
    setBusyId(null);
    if (!r.ok || !r.service) return;
    onAdded(r.service);
    setAnnounce(`${offer.name} added`);
    // Flip the offer to its Added state (D6 — a non-blocking hint; "Add again"
    // stays available since the same offer may legitimately be added twice).
    setOffers((prev) =>
      prev ? prev.map((o) => (o.id === offer.id ? { ...o, added: true } : o)) : prev,
    );
  }

  const visible = useMemo(() => {
    if (!offers) return [];
    const q = query.trim().toLowerCase();
    return offers.filter(
      (o) =>
        // SPEC-ui-quick-wins AC-015 — the Added filter combines with the text one.
        (show === 'all' || (show === 'added') === o.added) &&
        (q === '' ||
          o.name.toLowerCase().includes(q) ||
          o.description.toLowerCase().includes(q) ||
          o.suggestedCategory.toLowerCase().includes(q)),
    );
  }, [offers, query, show]);

  // SPEC-ui-quick-wins §3.6 / AC-014 — one group per suggested category, in the
  // order of each group's first offer in the admin's library order; offers with
  // no category go in "Other", last. The ORDER comes from the whole library,
  // not the filtered view, so groups don't jump as the filter changes; only
  // groups with a visible offer render, and counts are what is shown. Library
  // order holds inside a group. Groups only sort the list: they never decide
  // where an app lands on the dashboard.
  const groups = useMemo(() => {
    const order = new Map<string, number>();
    (offers ?? []).forEach((o) => {
      if (o.suggestedCategory && !order.has(o.suggestedCategory)) order.set(o.suggestedCategory, order.size);
    });
    const byCat = new Map<string, LibraryOffer[]>();
    visible.forEach((o) => {
      const rows = byCat.get(o.suggestedCategory);
      if (rows) rows.push(o);
      else byCat.set(o.suggestedCategory, [o]);
    });
    // Every visible offer is in `offers`, so every named category has a rank;
    // "Other" ('') ranks after all of them.
    const rank = (c: string) => (c === '' ? order.size : order.get(c)!);
    return Array.from(byCat, ([category, rows]) => ({ category, rows })).sort(
      (a, b) => rank(a.category) - rank(b.category),
    );
  }, [offers, visible]);
  // Each visible offer's position in the rendered (grouped) order.
  const rowIndex = useMemo(
    () => new Map(groups.flatMap((g) => g.rows).map((o, i) => [o.id, i] as const)),
    [groups],
  );

  // AC-015 — under "Not added", an Add moves its row out of the view, and the
  // button that held focus goes with it. Focus then moves to the row that took
  // its place (or the filter) instead of falling to <body>.
  const refocusAt = useRef<number | null>(null);
  function addFromRow(offer: LibraryOffer, index: number) {
    refocusAt.current = index;
    void add(offer);
  }
  useEffect(() => {
    const i = refocusAt.current;
    const panel = panelRef.current;
    if (i === null || !panel || busyId !== null) return;
    refocusAt.current = null;
    // The row is still there (All or Added view): focus never left it.
    if (panel.contains(document.activeElement)) return;
    const buttons = panel.querySelectorAll<HTMLElement>('.library-row button:not([disabled])');
    const fallback = panel.querySelector<HTMLElement>('input[name="library-show"]:checked');
    (buttons[i] ?? buttons[buttons.length - 1] ?? fallback)?.focus();
  }, [visible, busyId]);

  return (
    <Modal onDismiss={onClose} overlayClassName="launcher-overlay" overlayTestId="library-browse-overlay">
      <div
        ref={panelRef}
        data-testid="library-browse"
        role="dialog"
        aria-modal="true"
        aria-label={targetCategory ? `Add to ${targetCategory.title}` : 'App Library'}
        className="launcher-panel library-panel"
        onKeyDown={onPanelKeyDown}
      >
        <div data-testid="library-live" aria-live="polite" role="status" className="sr-only">
          {announce}
        </div>

        <div className="library-head">
          <div>
            <h2 className="library-title">{targetCategory ? `Add to ${targetCategory.title}` : 'App Library'}</h2>
            <p className="library-subtitle">Add apps to your dashboard.</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            data-testid="library-close"
            aria-label="Close App Library"
            onClick={onClose}
            className="launcher-clear library-close"
          >
            ✕
          </button>
        </div>

        {offers && offers.length > 0 && (
          <div className="launcher-input-row">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter apps…"
              aria-label="Filter the App Library"
              autoComplete="off"
              className="launcher-input"
            />
          </div>
        )}

        {/* SPEC-ui-quick-wins AC-015 / AC-016 — All · Not added · Added, as
            native radios (one Tab stop, arrows move within), right under the
            text filter so Tab order follows what you see. */}
        {offers && offers.length > 0 && (
          <div role="radiogroup" aria-label="Show" data-testid="library-show" className="flex flex-wrap gap-1.5 px-4 pb-2 pt-1">
            {SHOW_OPTIONS.map((opt) => (
              <label
                key={opt.id}
                className={
                  'relative inline-flex min-h-[44px] cursor-pointer items-center rounded-full border px-4 text-sm font-medium transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-500 ' +
                  (show === opt.id
                    ? 'border-indigo-600 bg-indigo-600 text-white dark:border-indigo-400 dark:bg-indigo-400 dark:text-neutral-950'
                    : 'border-neutral-300 text-neutral-700 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800')
                }
              >
                <input
                  type="radio"
                  name="library-show"
                  value={opt.id}
                  checked={show === opt.id}
                  onChange={() => setShow(opt.id)}
                  className="sr-only"
                />
                {opt.label}
              </label>
            ))}
          </div>
        )}

        <div className="launcher-results" role="region" aria-label="Library offers">
          {offers === null ? (
            <p className="library-loading">Loading…</p>
          ) : offers.length === 0 ? (
            <div data-testid="library-empty" className="launcher-no-results">
              <svg
                data-testid="library-empty-illustration"
                className="library-empty-art"
                aria-hidden="true"
                viewBox="0 0 64 64"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M8 22 32 10l24 12-24 12L8 22Z" />
                <path d="M8 22v20l24 12 24-12V22" />
                <path d="M32 34v20" />
              </svg>
              <p className="launcher-no-results-title">No apps in the library yet.</p>
              {isAdmin && (
                <button
                  type="button"
                  data-testid="library-manage-link"
                  onClick={() => onManageLibrary?.()}
                  className="library-manage-link"
                >
                  Manage the library
                </button>
              )}
            </div>
          ) : visible.length === 0 ? (
            <p data-testid="library-no-matches" className="launcher-no-results-title">
              {query.trim() ? <>No apps match “{query.trim()}”.</> : NOTHING_SHOWN[show]}
            </p>
          ) : (
            // SPEC-ui-quick-wins AC-014 — one labelled section per category,
            // each with its own list. The heading shows the count of what is
            // visible, and the category hue the row chips use (#90).
            groups.map(({ category, rows }) => {
              const name = category || 'Other';
              return (
                <section key={category ? `c:${category}` : 'other'} data-testid="library-group" aria-label={name}>
                  <h3
                    data-testid="library-group-title"
                    className="flex items-center gap-2 px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-300"
                  >
                    {category && (
                      <span
                        data-testid="library-group-hue"
                        data-hue={categoryHue(category)}
                        aria-hidden="true"
                        className="inline-block h-2 w-2 flex-none rounded-full"
                        style={{ backgroundColor: `hsl(${categoryHue(category)} 70% 50%)` }}
                      />
                    )}
                    {`${name} (${rows.length})`}
                  </h3>
                  <ul className="library-list" aria-label={name}>
                    {rows.map((o) => (
                      <li
                        key={o.id}
                        data-testid="library-row"
                        data-library-id={o.id}
                        className="library-row"
                      >
                        <img
                          src={o.icon || initialBadge(o.name)}
                          alt=""
                          onError={(e) => {
                            const img = e.currentTarget;
                            img.onerror = null;
                            img.src = initialBadge(o.name);
                          }}
                          className="launcher-row-icon"
                        />
                        <div className="library-row-text">
                          <span className="library-row-name">{o.name}</span>
                          {o.description && (
                            <span className="library-row-desc">{o.description}</span>
                          )}
                        </div>
                        {o.suggestedCategory && (
                          <span
                            className="library-chip"
                            style={{ '--chip-hue': categoryHue(o.suggestedCategory) } as CSSProperties}
                          >
                            {o.suggestedCategory}
                          </span>
                        )}
                        {o.added ? (
                          <button
                            type="button"
                            data-testid={`library-added-${o.id}`}
                            aria-label={`Add another ${o.name} to my dashboard`}
                            title="Add again"
                            disabled={busyId === o.id}
                            onClick={() => addFromRow(o, rowIndex.get(o.id) ?? 0)}
                            className="library-added"
                          >
                            <span aria-hidden="true">✓</span> Added
                          </button>
                        ) : (
                          <button
                            type="button"
                            data-testid={`library-add-${o.id}`}
                            aria-label={`Add ${o.name} to my dashboard`}
                            disabled={busyId === o.id}
                            onClick={() => addFromRow(o, rowIndex.get(o.id) ?? 0)}
                            className="library-add"
                          >
                            Add
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })
          )}
        </div>

        <div className="library-footer">
          <button
            type="button"
            data-testid="library-custom-add"
            onClick={onCustomAdd}
            className="library-custom-add"
          >
            + Add a custom app
          </button>
        </div>
      </div>
    </Modal>
  );
}
