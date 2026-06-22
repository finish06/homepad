import { useEffect, useMemo, useRef, useState } from 'react';
import { addFromLibrary, listLibrary, type LibraryOffer, type Service } from './api';
import { initialBadge } from './icons';

// v9.3 §7.2 — the browse + add-from-library surface. A modal mirroring the v8
// launcher's overlay/panel tokens (no new palette): it lists the admin-curated
// App Library (`GET /api/library`) and copies an offer onto MY dashboard
// (`POST /api/library/{id}/add`). Any authenticated user; custom-add stays
// available (delegated to the existing ServiceForm via onCustomAdd). CLIENT-SIDE
// only — no homepad-api change.

export default function LibraryBrowse({
  onClose,
  onAdded,
  onCustomAdd,
  isAdmin = false,
  onManageLibrary,
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
}) {
  const [offers, setOffers] = useState<LibraryOffer[] | null>(null);
  const [query, setQuery] = useState('');
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

  // Esc closes (§9). Bound at the panel so it doesn't fight the page below.
  function onPanelKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
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
    const r = await addFromLibrary(offer.id);
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
    if (q === '') return offers;
    return offers.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.description.toLowerCase().includes(q) ||
        o.suggestedCategory.toLowerCase().includes(q),
    );
  }, [offers, query]);

  return (
    <div
      data-testid="library-browse-overlay"
      className="launcher-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        data-testid="library-browse"
        role="dialog"
        aria-modal="true"
        aria-label="App Library"
        className="launcher-panel library-panel"
        onKeyDown={onPanelKeyDown}
      >
        <div data-testid="library-live" aria-live="polite" role="status" className="sr-only">
          {announce}
        </div>

        <div className="library-head">
          <div>
            <h2 className="library-title">App Library</h2>
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
          ) : (
            <ul className="library-list" aria-label="Library offers">
              {visible.map((o) => (
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
                    <span className="library-chip">{o.suggestedCategory}</span>
                  )}
                  {o.added ? (
                    <button
                      type="button"
                      data-testid={`library-added-${o.id}`}
                      aria-label={`Add another ${o.name} to my dashboard`}
                      title="Add again"
                      disabled={busyId === o.id}
                      onClick={() => add(o)}
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
                      onClick={() => add(o)}
                      className="library-add"
                    >
                      Add
                    </button>
                  )}
                </li>
              ))}
            </ul>
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
    </div>
  );
}
