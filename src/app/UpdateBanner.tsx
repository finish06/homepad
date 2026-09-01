// "New release available" banner — the UI-facing half of release awareness.
//
// Renders nothing until useReleaseCheck sees a deployed sha newer than this
// bundle's, then shows a quiet bottom-left pill: refresh now, or dismiss.
// Dismissal is per-sha, so the banner stays gone for THIS release but returns
// if yet another release ships while the tab is still open. Informational and
// never blocking — the dashboard keeps working underneath.
import { useState } from 'react';
import { useReleaseCheck } from './useReleaseCheck';

export default function UpdateBanner({ currentSha = __GIT_SHA__ }: { currentSha?: string }) {
  const next = useReleaseCheck(currentSha);
  const [dismissedSha, setDismissedSha] = useState<string | null>(null);

  if (!next || next.sha === dismissedSha) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="update-banner"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
    >
      <span className="text-neutral-700 dark:text-neutral-200">
        homepad v{next.version} is available.
      </span>
      <button
        type="button"
        data-testid="update-banner-refresh"
        onClick={() => window.location.reload()}
        className="min-h-[44px] rounded-lg bg-indigo-600 px-3 text-sm font-semibold text-white hover:bg-indigo-700"
      >
        Refresh
      </button>
      <button
        type="button"
        aria-label="Dismiss update notice"
        data-testid="update-banner-dismiss"
        onClick={() => setDismissedSha(next.sha)}
        className="min-h-[44px] min-w-[44px] rounded-lg text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
      >
        ✕
      </button>
    </div>
  );
}
