import { useState } from 'react';
import { createService, updateService, type Service, type ServiceInput } from './api';

// Admin add/edit form for a catalog entry (A6). Passing a `service` puts it in
// edit mode (fields prefilled, PATCH on submit); omitting it is add mode (POST).
// Reuses the AuthForm card/label/input idiom. Server errors — 409 slug
// collision, 403 forbidden, 422/400 validation — surface inline via the Result
// `error` text, the same way AuthForm shows a failed login.
export default function ServiceForm({
  service,
  onClose,
  onSaved,
}: {
  service?: Service;
  onClose: () => void;
  onSaved: (service: Service, mode: 'add' | 'edit') => void;
}) {
  const editing = service !== undefined;
  const [name, setName] = useState(service?.name ?? '');
  const [slug, setSlug] = useState(service?.slug ?? '');
  const [url, setUrl] = useState(service?.url ?? '');
  const [description, setDescription] = useState(service?.description ?? '');
  const [icon, setIcon] = useState(service?.icon ?? '');
  // The API never returns gatus_key, so edit mode starts it blank. Left blank on
  // an edit it is omitted from the PATCH (the existing key is preserved); typing
  // a value sets or changes it. On add it is sent verbatim (blank = unmonitored).
  const [gatusKey, setGatusKey] = useState('');
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
        onSaved(r.service, 'edit');
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
        onSaved(r.service, 'add');
      }
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    'mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-indigo-500';

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-neutral-900/40 p-4"
      onClick={onClose}
    >
      <form
        data-testid="service-form"
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full w-full max-w-md overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-6 shadow-lg"
      >
        <h2 className="text-lg font-semibold">{editing ? 'Edit app' : 'Add app'}</h2>

        <label className="mt-4 block text-sm font-medium text-neutral-700">
          Name
          <input
            data-testid="field-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </label>

        <label className="mt-3 block text-sm font-medium text-neutral-700">
          Slug
          <input
            data-testid="field-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className={inputClass}
          />
        </label>

        <label className="mt-3 block text-sm font-medium text-neutral-700">
          URL
          <input
            data-testid="field-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className={inputClass}
          />
        </label>

        <label className="mt-3 block text-sm font-medium text-neutral-700">
          Description
          <input
            data-testid="field-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClass}
          />
        </label>

        <label className="mt-3 block text-sm font-medium text-neutral-700">
          Icon URL
          <input
            data-testid="field-icon"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            className={inputClass}
          />
        </label>

        <label className="mt-3 block text-sm font-medium text-neutral-700">
          Gatus key
          <input
            data-testid="field-gatus_key"
            value={gatusKey}
            onChange={(e) => setGatusKey(e.target.value)}
            placeholder={editing ? 'leave blank to keep current' : ''}
            className={inputClass}
          />
        </label>

        {error && (
          <p data-testid="form-error" className="mt-3 text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="submit"
            data-testid="form-submit"
            disabled={busy}
            className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {busy ? '…' : editing ? 'Save' : 'Add'}
          </button>
          <button
            type="button"
            data-testid="form-cancel"
            onClick={onClose}
            className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
