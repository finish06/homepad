import { useState } from 'react';
import {
  assignCategory,
  createService,
  updateService,
  type Category,
  type Service,
  type ServiceInput,
} from './api';

// Mirror of the backend slugify (homepad-api internal/storage/library.go):
// lowercase, runs of non-alphanumeric collapse to a single dash, no leading or
// trailing dash. "Plex Media Server" → "plex-media-server".
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Admin add/edit form for a catalog entry (A6). Passing a `service` puts it in
// edit mode (fields prefilled, PATCH on submit); omitting it is add mode (POST).
// Reuses the shared launcher/library modal chrome (#94) so it reads as one
// family with the App Library and Settings dialogs. Server errors — 409 slug
// collision, 403 forbidden, 422/400 validation — surface inline via the Result
// `error` text, the same way AuthForm shows a failed login.
export default function ServiceForm({
  service,
  categories = [],
  onClose,
  onSaved,
}: {
  service?: Service;
  categories?: Category[];
  onClose: () => void;
  onSaved: (service: Service, mode: 'add' | 'edit') => void;
}) {
  const editing = service !== undefined;
  const [name, setName] = useState(service?.name ?? '');
  const [slug, setSlug] = useState(service?.slug ?? '');
  // While untouched, the slug tracks the name (slugified) so admins don't have
  // to fill it by hand — a blank slug otherwise guarantees a save error (#78).
  // Editing the slug directly, or opening an existing entry, stops the tracking.
  const [slugEdited, setSlugEdited] = useState(editing);
  const [url, setUrl] = useState(service?.url ?? '');
  const [description, setDescription] = useState(service?.description ?? '');
  const [icon, setIcon] = useState(service?.icon ?? '');
  // The API never returns gatus_key, so edit mode starts it blank. Left blank on
  // an edit it is omitted from the PATCH (the existing key is preserved); typing
  // a value sets or changes it. On add it is sent verbatim (blank = unmonitored).
  const [gatusKey, setGatusKey] = useState('');
  // The catalog category the app belongs to ('' → Uncategorized). On add the
  // create endpoint can't set a category (#84), so a chosen one is filed via a
  // follow-up assignCategory PATCH; on edit we only re-file when it changed.
  const [categoryId, setCategoryId] = useState(service?.categoryId ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim() || !slug.trim() || !url.trim()) {
      setError('Name, slug and URL are required.');
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        const patch: Partial<ServiceInput> = {
          name: name.trim(),
          slug: slug.trim(),
          url: url.trim(),
          description,
          icon,
        };
        if (gatusKey.trim()) patch.gatus_key = gatusKey.trim();
        const r = await updateService(service.id, patch);
        if (!r.ok || !r.service) {
          setError(r.error ?? 'Could not save changes.');
          return;
        }
        let saved = r.service;
        // Re-file only when the admin actually picked a different category, to
        // avoid a redundant PATCH on an otherwise-unchanged category.
        if (categoryId !== (service.categoryId ?? '')) {
          const a = await assignCategory(saved.id, categoryId || null);
          if (!a.ok || !a.service) {
            setError(a.error ?? 'Saved the app, but could not set its category.');
            return;
          }
          saved = a.service;
        }
        onSaved(saved, 'edit');
      } else {
        const r = await createService({
          name: name.trim(),
          slug: slug.trim(),
          url: url.trim(),
          description,
          icon,
          gatus_key: gatusKey.trim(),
        });
        if (!r.ok || !r.service) {
          setError(r.error ?? 'Could not add the app.');
          return;
        }
        let saved = r.service;
        // The create endpoint ignores categoryId, so a chosen category is filed
        // with a follow-up PATCH (#84) — no more manual "move to category" step.
        if (categoryId) {
          const a = await assignCategory(saved.id, categoryId);
          if (!a.ok || !a.service) {
            setError(a.error ?? 'Added the app, but could not set its category.');
            return;
          }
          saved = a.service;
        }
        onSaved(saved, 'add');
      }
    } finally {
      setBusy(false);
    }
  }

  const title = editing ? 'Edit app' : 'Add app';

  return (
    <div
      data-testid="service-form-overlay"
      className="launcher-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        data-testid="service-form"
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="launcher-panel library-panel service-form-panel"
      >
        <div className="library-head">
          <h2 className="library-title">{title}</h2>
          <button
            type="button"
            data-testid="form-close"
            aria-label={`Close ${title}`}
            onClick={onClose}
            className="launcher-clear library-close"
          >
            ✕
          </button>
        </div>

        <div className="service-form-body">
          <label className="service-form-field">
            Name
            <input
              data-testid="field-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugEdited) setSlug(slugify(e.target.value));
              }}
              className="settings-input"
            />
          </label>

          <label className="service-form-field">
            Slug
            <input
              data-testid="field-slug"
              value={slug}
              onChange={(e) => {
                setSlugEdited(true);
                setSlug(e.target.value);
              }}
              placeholder="e.g. plex-media-server"
              className="settings-input"
            />
          </label>

          <label className="service-form-field">
            URL
            <input
              data-testid="field-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="settings-input"
            />
          </label>

          <label className="service-form-field">
            Description
            <input
              data-testid="field-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="settings-input"
            />
          </label>

          <label className="service-form-field">
            Category
            <select
              data-testid="field-category"
              value={categoryId ?? ''}
              onChange={(e) => setCategoryId(e.target.value)}
              className="settings-input"
            >
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="service-form-field">
            Icon URL
            <input
              data-testid="field-icon"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="e.g. https://cdn.example.com/plex.png"
              className="settings-input"
            />
          </label>

          <label className="service-form-field">
            Gatus key
            <input
              data-testid="field-gatus_key"
              value={gatusKey}
              onChange={(e) => setGatusKey(e.target.value)}
              placeholder={editing ? 'leave blank to keep current' : 'e.g. plex — its Gatus monitor key'}
              className="settings-input"
            />
          </label>

          {error && (
            <p data-testid="form-error" className="settings-error">
              {error}
            </p>
          )}
        </div>

        <div className="service-form-actions">
          <button
            type="submit"
            data-testid="form-submit"
            disabled={busy}
            className="library-add service-form-submit"
          >
            {busy ? '…' : editing ? 'Save' : 'Add'}
          </button>
          <button
            type="button"
            data-testid="form-cancel"
            onClick={onClose}
            className="settings-ghost-btn"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
