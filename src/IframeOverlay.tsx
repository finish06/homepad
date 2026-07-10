import { useEffect, useRef, useState } from 'react';
import type { Service } from './api';

// v23 — IframeOverlay (SPEC-tile-click-action §5.4-5.5). A tile whose
// clickAction='iframe' opens this backdrop modal instead of navigating: the
// service is embedded in a sandboxed <iframe> so a local dashboard can be kept
// visible alongside homepad. Chrome mirrors the tile-edit modal family (scrim +
// centered panel + sticky header + ✕).
//
// The honest part is §5.5: X-Frame-Options / CSP `frame-ancestors` block embeds
// with NO reliable cross-browser event — `onLoad` fires even for a blocked frame
// (the browser paints its own error page). So we can't detect a block directly;
// instead a 5s deadline arms on open and, if `onLoad` hasn't fired by then, we
// surface a fallback panel offering to open the site in a new tab. A LAN service
// loads well within 5s, so a still-blank frame at 5s is almost certainly blocked
// (or too slow to embed usefully) — either way the new-tab escape hatch is right.
const FALLBACK_MS = 5000;

const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups';

export default function IframeOverlay({
  service,
  onClose,
}: {
  service: Service;
  onClose: () => void;
}) {
  // loaded → onLoad fired (spinner off, content assumed good).
  // blocked → the 5s deadline elapsed before onLoad (show the fallback panel).
  const [loaded, setLoaded] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Esc anywhere closes (a document-level listener, torn down on unmount) — the
  // overlay owns the whole viewport so it need not be focused first (AC-006).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    // Land focus on the close button so keyboard users have an obvious exit and
    // Tab starts inside the overlay.
    closeRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Arm the blocked-embed deadline once, on open. onFrameLoad clears it (§5.5),
  // so a frame that loads in time never trips the fallback.
  useEffect(() => {
    timerRef.current = setTimeout(() => setBlocked(true), FALLBACK_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function onFrameLoad() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setLoaded(true);
    setBlocked(false); // a real load after a near-miss still clears the fallback
  }

  const showSpinner = !loaded && !blocked;

  return (
    <div
      className="iframe-overlay"
      data-testid="iframe-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="iframe-overlay-panel"
        data-testid="iframe-overlay-panel"
        role="dialog"
        aria-modal="true"
        aria-label={service.name}
      >
        <header className="iframe-overlay-header">
          <span className="iframe-overlay-title" data-testid="iframe-overlay-title" title={service.name}>
            {service.name}
          </span>
          <button
            ref={closeRef}
            type="button"
            className="iframe-overlay-close"
            data-testid="iframe-overlay-close"
            aria-label={`Close ${service.name}`}
            onClick={onClose}
          >
            ✕
          </button>
        </header>

        <div className="iframe-overlay-body">
          {blocked ? (
            // §5.5 — the frame never signalled load; it's blocked or too slow to
            // embed. Offer the new-tab escape hatch (does NOT auto-close — the
            // user may dismiss manually or click through).
            <div className="iframe-overlay-fallback" data-testid="iframe-overlay-fallback" role="alert">
              <p className="iframe-overlay-fallback-title">This site can't be embedded</p>
              <p className="iframe-overlay-fallback-text">Some sites block display in an embedded frame.</p>
              <a
                className="iframe-overlay-fallback-open"
                data-testid="iframe-overlay-fallback-open"
                href={service.url}
                target="_blank"
                rel="noreferrer noopener"
              >
                Open in new tab ↗
              </a>
            </div>
          ) : (
            <>
              {showSpinner && (
                <div
                  className="iframe-overlay-spinner"
                  data-testid="iframe-overlay-spinner"
                  role="status"
                  aria-live="polite"
                >
                  <span className="iframe-overlay-spinner-ring" aria-hidden="true" />
                  <span className="sr-only">Loading {service.name}…</span>
                </div>
              )}
              <iframe
                className="iframe-overlay-frame"
                data-testid="iframe-overlay-frame"
                src={service.url}
                title={service.name}
                loading="lazy"
                sandbox={SANDBOX}
                onLoad={onFrameLoad}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
