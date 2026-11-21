import { lazy, Suspense, useId, useState } from 'react';
import { downloadBackup } from './transferApi';
import { saveBlob } from './planParts';
import './backup-import.css';

// SPEC-backup-import UX §2 (TASK-303) — Backup and import, the last section of
// the Admin Panel (B-1). Three rows, one line of copy and one button each. The
// two flows load on demand (code-splitting.test.ts).
const RestoreModal = lazy(() => import('./RestoreModal'));
const HomepageImportModal = lazy(() => import('./HomepageImportModal'));

type Flow = 'restore' | 'import' | null;

export default function BackupSection({ onApplied }: { onApplied?: () => void }) {
  const uid = useId();
  const [people, setPeople] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [flow, setFlow] = useState<Flow>(null);

  async function download() {
    setBusy(true);
    setError(false);
    try {
      const { blob, filename } = await downloadBackup(people);
      saveBlob(blob, filename);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  const hintId = `${uid}-people-hint`;
  return (
    <section data-testid="settings-backup" aria-labelledby={`${uid}-h`} className="settings-section bi-section">
      <h3 id={`${uid}-h`} className="settings-section-title">
        Backup and import
      </h3>

      <div className="bi-row">
        <div className="bi-row-text">
          <p className="bi-row-title">Back up</p>
          <p className="settings-section-note">One file with your sections, apps, icons, App Library and settings.</p>
          <label className="bi-check">
            <input
              type="checkbox"
              checked={people}
              aria-describedby={hintId}
              onChange={(e) => setPeople(e.target.checked)}
            />
            Include people (emails, favorites, kids' apps)
          </label>
          <p id={hintId} className="settings-section-note">
            {people ? 'The file will include email addresses. Keep it private.' : 'No emails or personal settings.'}
          </p>
          {error && <p className="settings-error">Couldn't make the backup. Try again.</p>}
        </div>
        <button type="button" className="library-add bi-btn" disabled={busy} onClick={() => void download()}>
          {busy ? 'Preparing…' : 'Download backup'}
        </button>
      </div>

      <div className="bi-row">
        <div className="bi-row-text">
          <p className="bi-row-title">Restore</p>
          <p className="settings-section-note">Load a Homepad backup file. You'll see the changes first.</p>
        </div>
        <button type="button" className="settings-ghost-btn bi-btn" onClick={() => setFlow('restore')}>
          Restore from file…
        </button>
      </div>

      <div className="bi-row">
        <div className="bi-row-text">
          <p className="bi-row-title">Import from Homepage</p>
          <p className="settings-section-note">Bring in your services.yaml. You'll see the changes first.</p>
        </div>
        <button type="button" className="settings-ghost-btn bi-btn" onClick={() => setFlow('import')}>
          Import…
        </button>
      </div>

      {flow && (
        <Suspense fallback={null}>
          {flow === 'restore' ? (
            <RestoreModal onClose={() => setFlow(null)} onApplied={onApplied} />
          ) : (
            <HomepageImportModal onClose={() => setFlow(null)} onApplied={onApplied} />
          )}
        </Suspense>
      )}
    </section>
  );
}
