import { useEffect, useRef, useState } from 'react';
import type { Service, ServiceStatus } from './api';
import { DEFAULT_ICON, iconSrc } from './icons';
import { rankServices } from './ranker';
import { useLauncher } from './launcher';
import { useResolvedTheme } from './theme';

// v8 §5–6 — the command launcher dialog. CLIENT-SIDE ONLY: it filters the
// `services` array it is handed (the catalog's already-loaded list) and never
// fetches (§3, A12). Open-state + the global hotkey live in LauncherProvider
// (./launcher); this component owns the query, selection and in-dialog keys.

// A row's DOM id, referenced by aria-activedescendant (§8) and by Enter to
// activate the selected anchor.
const optionId = (id: string) => `launcher-option-${id}`;

// OQ3 — per-row status dot, mirroring the tile's status-badge colours so a row
// reads identically to its tile (UP green, DOWN red, DEGRADED amber, else gray).
// The colour is never the only signal: an sr-only "status …" text rides along.
const statusDot: Record<ServiceStatus, string> = {
  UP: 'bg-emerald-500',
  DOWN: 'bg-red-500',
  DEGRADED: 'bg-amber-400',
  UNKNOWN: 'bg-neutral-300',
  // NOT_MONITORED (no gatus_key): outlined dashed ring, matching the tile.
  NOT_MONITORED: 'bg-transparent border-2 border-dashed border-neutral-300 dark:border-neutral-600',
};

type Section = { label: string | null; items: Service[] };

// Build the visible sections from the query. Empty query → Favorites then All
// services (favorites not repeated), §7/D1. Non-empty → a single ranked,
// unlabelled section (empty when nothing matches → the no-results state).
function buildSections(query: string, services: Service[]): Section[] {
  if (query.trim() === '') {
    const favorites = services.filter((s) => s.favorite);
    const rest = services.filter((s) => !s.favorite);
    const sections: Section[] = [];
    if (favorites.length > 0) sections.push({ label: 'Favorites', items: favorites });
    sections.push({ label: 'All services', items: rest });
    return sections;
  }
  const ranked = rankServices(query, services);
  return ranked.length > 0 ? [{ label: null, items: ranked }] : [];
}

export default function CommandLauncher({ services }: { services: Service[] }) {
  const { open, closeLauncher } = useLauncher();
  const theme = useResolvedTheme();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Reopen is always empty (D5): clear query + selection whenever the launcher
  // closes, so the next open starts blank.
  useEffect(() => {
    if (!open) {
      setQuery('');
      setSelected(0);
    }
  }, [open]);

  // Auto-focus the input on open (§5.3) and lock body scroll while open (§5.1).
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const sections = buildSections(query, services);
  const flat = sections.flatMap((s) => s.items);
  const hasResults = flat.length > 0;
  const selectedIndex = hasResults ? Math.min(selected, flat.length - 1) : -1;
  const activeId = selectedIndex >= 0 ? optionId(flat[selectedIndex].id) : undefined;
  const noMatches = query.trim() !== '' && !hasResults;
  // §8 — the result count, announced politely to screen readers on every query
  // change (and "no services match" for the empty state).
  const liveMessage = noMatches
    ? `No services match ${query.trim()}.`
    : `${flat.length} result${flat.length === 1 ? '' : 's'}`;

  // Keep the selected row scrolled into view as the selection moves (§6.4).
  useEffect(() => {
    if (!open || selectedIndex < 0) return;
    document.getElementById(optionId(flat[selectedIndex].id))?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex, open]);

  if (!open) return null;

  function onQueryChange(value: string) {
    setQuery(value);
    setSelected(0); // typing re-selects rank 0 (§6.4)
  }

  // §8 focus trap — Tab/Shift+Tab cycle only within the dialog; focus can never
  // reach the page behind the scrim. The input keeps focus during normal use
  // (combobox pattern); this only fires when the user actually tabs.
  function onModalKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab' || !modalRef.current) return;
    const focusables = Array.from(
      modalRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    const inside = modalRef.current.contains(active);
    if (e.shiftKey && (active === first || !inside)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !inside)) {
      e.preventDefault();
      first.focus();
    }
  }

  function activateSelected() {
    if (selectedIndex < 0) return; // no-op when there are no results (A11)
    // Activate the real <a target=_blank rel="noreferrer noopener"> so the
    // browser handles the new tab exactly like a tile (§6.5, D7), then close.
    document.getElementById(optionId(flat[selectedIndex].id))?.click();
    closeLauncher();
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        closeLauncher();
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (hasResults) setSelected((i) => (Math.min(i, flat.length - 1) + 1) % flat.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (hasResults)
          setSelected((i) => (Math.min(i, flat.length - 1) - 1 + flat.length) % flat.length);
        break;
      case 'Home':
        if (hasResults) {
          e.preventDefault();
          setSelected(0);
        }
        break;
      case 'End':
        if (hasResults) {
          e.preventDefault();
          setSelected(flat.length - 1);
        }
        break;
      case 'Enter':
        e.preventDefault();
        activateSelected();
        break;
    }
  }

  // Running index across the flattened, visible result order so each row carries
  // its global 0-based data-rank (test ordering hook, §5.5).
  let globalIndex = -1;

  return (
    <div
      data-testid="launcher-overlay"
      className="launcher-overlay"
      onClick={(e) => {
        // Close only when the click lands on the scrim itself, not bubbling up
        // from the panel (§4.3): a click inside the panel has e.target !== the
        // overlay, so it is left open.
        if (e.target === e.currentTarget) closeLauncher();
      }}
    >
      <div
        ref={modalRef}
        data-testid="launcher-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Quick launcher"
        className="launcher-panel"
        onKeyDown={onModalKeyDown}
      >
        {/* §8 — polite result-count announcement, visually hidden. */}
        <div data-testid="launcher-live" aria-live="polite" role="status" className="sr-only">
          {liveMessage}
        </div>
        <div className="launcher-input-row">
          <SearchGlyph />
          <input
            ref={inputRef}
            data-testid="launcher-input"
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Search services…"
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="off"
            role="combobox"
            aria-expanded={hasResults}
            aria-controls="launcher-results"
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            className="launcher-input"
          />
          {query !== '' && (
            <button
              type="button"
              data-testid="launcher-clear"
              aria-label="Clear search"
              onClick={() => {
                onQueryChange('');
                inputRef.current?.focus();
              }}
              className="launcher-clear"
            >
              ✕
            </button>
          )}
        </div>

        <div
          ref={resultsRef}
          id="launcher-results"
          data-testid="launcher-results"
          role="listbox"
          aria-label="Services"
          className="launcher-results"
        >
          {noMatches ? (
            <div data-testid="launcher-no-results" className="launcher-no-results">
              <p className="launcher-no-results-title">No services match “{query.trim()}”.</p>
              <p className="launcher-no-results-hint">Try a name, category, or keyword.</p>
            </div>
          ) : (
            sections.map((section) => (
              <div key={section.label ?? '__ranked__'} role="group" aria-label={section.label ?? undefined}>
                {section.label && (
                  <div className="launcher-group-label" aria-hidden="true">
                    {section.label}
                  </div>
                )}
                {section.items.map((s) => {
                  globalIndex += 1;
                  const isSelected = globalIndex === selectedIndex;
                  return (
                    <ResultRow
                      key={s.id}
                      service={s}
                      theme={theme}
                      rank={globalIndex}
                      selected={isSelected}
                    />
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="launcher-footer" data-testid="launcher-footer" aria-hidden="true">
          <span>↑↓ to move</span>
          <span>⏎ to open</span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  );
}

function ResultRow({
  service,
  theme,
  rank,
  selected,
}: {
  service: Service;
  theme: 'light' | 'dark';
  rank: number;
  selected: boolean;
}) {
  const category = service.categoryName ?? 'Uncategorized';
  return (
    <a
      id={optionId(service.id)}
      data-testid="launcher-result"
      data-service-id={service.id}
      data-rank={rank}
      data-selected={selected ? 'true' : 'false'}
      role="option"
      aria-selected={selected}
      href={service.url}
      target="_blank"
      rel="noreferrer noopener"
      className="launcher-row"
    >
      <img
        data-testid="launcher-result-icon"
        src={iconSrc(service, theme, 0)}
        alt=""
        onError={(e) => {
          const img = e.currentTarget;
          img.onerror = null;
          img.src = DEFAULT_ICON;
        }}
        className="launcher-row-icon"
      />
      <span data-testid="launcher-result-name" className="launcher-row-name">
        {service.name}
      </span>
      <span data-testid="launcher-result-category" className="launcher-row-category">
        {category}
      </span>
      <span
        data-testid="launcher-result-status"
        data-status={service.status}
        aria-hidden="true"
        className={`launcher-row-status status-dot ${statusDot[service.status] ?? statusDot.UNKNOWN}`}
      />
      {/* §8 — fold status into the option's accessible name (name, category,
          status …) without relying on the colour of the dot above. */}
      <span className="sr-only">status {service.status.toLowerCase()}</span>
      {selected && (
        <span data-testid="launcher-enter-hint" aria-hidden="true" className="launcher-row-enter">
          ⏎
        </span>
      )}
    </a>
  );
}

function SearchGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="launcher-search-glyph">
      <path
        d="M9 3a6 6 0 104.47 10.03l3.25 3.24a1 1 0 001.41-1.41l-3.24-3.25A6 6 0 009 3zm0 2a4 4 0 110 8 4 4 0 010-8z"
        fill="currentColor"
      />
    </svg>
  );
}
