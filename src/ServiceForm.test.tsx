import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ServiceForm from './ServiceForm';
import { assignCategory, createService, updateService, type Category, type Service } from './api';

vi.mock('./api', () => ({
  createService: vi.fn(),
  updateService: vi.fn(),
  assignCategory: vi.fn(),
}));

const noop = () => {};

const cats: Category[] = [
  { id: 'c1', name: 'Media', sortIndex: 0, layoutRow: 0, layoutColOrder: 0, layoutWidthPct: 100 },
  { id: 'c2', name: 'Tools', sortIndex: 1, layoutRow: 1, layoutColOrder: 0, layoutWidthPct: 100 },
];

function svc(overrides: Partial<Service> = {}): Service {
  return {
    id: 'S1',
    name: 'Plex',
    slug: 'plex',
    url: 'https://plex.x',
    description: '',
    icon: '',
    status: 'UNKNOWN',
    favorite: false,
    iconLight: false,
    iconDark: false,
    ...overrides,
  };
}

function renderForm(service?: Service, categories: Category[] = []) {
  return render(
    <ServiceForm service={service} categories={categories} onClose={noop} onSaved={noop} />,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('ServiceForm modal card style (#94)', () => {
  it('uses the shared launcher-panel modal chrome like Library/Settings', () => {
    renderForm();
    // The dialog surface reuses the same card classes as the Library and
    // Settings modals (launcher-panel + library-panel) instead of a bespoke
    // Tailwind card, so the three modals read as one family.
    const panel = screen.getByTestId('service-form');
    expect(panel).toHaveClass('launcher-panel');
    expect(panel).toHaveClass('library-panel');
    // The scrim is the shared launcher-overlay (z-60, blur), not the old z-20 one.
    const overlay = screen.getByTestId('service-form-overlay');
    expect(overlay).toHaveClass('launcher-overlay');
    // Header uses the shared library title treatment.
    expect(panel.querySelector('.library-title')).not.toBeNull();
  });
});

describe('ServiceForm slug auto-fill (#78)', () => {
  it('derives the slug from the name as the user types in add mode', async () => {
    const user = userEvent.setup();
    renderForm();
    const name = screen.getByTestId('field-name') as HTMLInputElement;
    const slug = screen.getByTestId('field-slug') as HTMLInputElement;

    await user.type(name, 'Plex Media Server');

    expect(slug.value).toBe('plex-media-server');
  });

  it('stops auto-filling once the admin edits the slug by hand', async () => {
    const user = userEvent.setup();
    renderForm();
    const name = screen.getByTestId('field-name') as HTMLInputElement;
    const slug = screen.getByTestId('field-slug') as HTMLInputElement;

    await user.type(name, 'Plex');
    expect(slug.value).toBe('plex');

    // Admin overrides the slug, then keeps editing the name.
    await user.clear(slug);
    await user.type(slug, 'custom');
    await user.type(name, ' Media');

    expect(slug.value).toBe('custom');
  });

  it('never auto-overwrites an existing slug in edit mode', async () => {
    const user = userEvent.setup();
    renderForm(svc());
    const name = screen.getByTestId('field-name') as HTMLInputElement;
    const slug = screen.getByTestId('field-slug') as HTMLInputElement;

    await user.type(name, ' Media Server');

    expect(slug.value).toBe('plex');
  });
});

describe('ServiceForm category selector (#84)', () => {
  it('A84 — offers an Uncategorized option plus every admin category', () => {
    renderForm(undefined, cats);
    const select = screen.getByTestId('field-category') as HTMLSelectElement;
    const labels = Array.from(select.options).map((o) => o.textContent);
    expect(labels).toEqual(['Uncategorized', 'Media', 'Tools']);
    // Defaults to Uncategorized on add.
    expect(select.value).toBe('');
  });

  it('A84 — files a new app under the chosen category on add', async () => {
    const user = userEvent.setup();
    vi.mocked(createService).mockResolvedValue({
      ok: true,
      status: 201,
      service: svc({ id: 'S9', name: 'Sonarr', slug: 'sonarr', categoryId: null }),
    });
    vi.mocked(assignCategory).mockResolvedValue({
      ok: true,
      status: 200,
      service: svc({ id: 'S9', name: 'Sonarr', slug: 'sonarr', categoryId: 'c2', categoryName: 'Tools' }),
    });
    const onSaved = vi.fn();
    render(<ServiceForm categories={cats} onClose={noop} onSaved={onSaved} />);

    await user.type(screen.getByTestId('field-name'), 'Sonarr');
    await user.type(screen.getByTestId('field-url'), 'https://son.x');
    await user.selectOptions(screen.getByTestId('field-category'), 'c2');
    await user.click(screen.getByTestId('form-submit'));

    await waitFor(() => expect(assignCategory).toHaveBeenCalledWith('S9', 'c2'));
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'S9', categoryId: 'c2' }),
      'add',
    );
  });

  it('A84 — leaves a new app uncategorized when no category is chosen', async () => {
    const user = userEvent.setup();
    vi.mocked(createService).mockResolvedValue({
      ok: true,
      status: 201,
      service: svc({ id: 'S9', name: 'Sonarr', slug: 'sonarr', categoryId: null }),
    });
    const onSaved = vi.fn();
    render(<ServiceForm categories={cats} onClose={noop} onSaved={onSaved} />);

    await user.type(screen.getByTestId('field-name'), 'Sonarr');
    await user.type(screen.getByTestId('field-url'), 'https://son.x');
    await user.click(screen.getByTestId('form-submit'));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.anything(), 'add'));
    expect(assignCategory).not.toHaveBeenCalled();
  });

  it('A84 — prefills the current category in edit mode and reassigns on change', async () => {
    const user = userEvent.setup();
    vi.mocked(updateService).mockResolvedValue({
      ok: true,
      status: 200,
      service: svc({ categoryId: 'c1', categoryName: 'Media' }),
    });
    vi.mocked(assignCategory).mockResolvedValue({
      ok: true,
      status: 200,
      service: svc({ categoryId: 'c2', categoryName: 'Tools' }),
    });
    const onSaved = vi.fn();
    render(
      <ServiceForm
        service={svc({ categoryId: 'c1', categoryName: 'Media' })}
        categories={cats}
        onClose={noop}
        onSaved={onSaved}
      />,
    );

    const select = screen.getByTestId('field-category') as HTMLSelectElement;
    expect(select.value).toBe('c1');

    await user.selectOptions(select, 'c2');
    await user.click(screen.getByTestId('form-submit'));

    await waitFor(() => expect(assignCategory).toHaveBeenCalledWith('S1', 'c2'));
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ categoryId: 'c2' }), 'edit');
  });

  it('A84 — skips the extra assign call when the category is unchanged in edit mode', async () => {
    const user = userEvent.setup();
    vi.mocked(updateService).mockResolvedValue({
      ok: true,
      status: 200,
      service: svc({ categoryId: 'c1', categoryName: 'Media' }),
    });
    const onSaved = vi.fn();
    render(
      <ServiceForm
        service={svc({ categoryId: 'c1', categoryName: 'Media' })}
        categories={cats}
        onClose={noop}
        onSaved={onSaved}
      />,
    );

    await user.click(screen.getByTestId('form-submit'));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.anything(), 'edit'));
    expect(assignCategory).not.toHaveBeenCalled();
  });
});

// #87 — the technical fields (Slug, Icon URL, Gatus key) are unexplained, so
// each carries example/hint placeholder copy shown while empty.
describe('ServiceForm field placeholder copy (#87)', () => {
  it('gives the slug field an example placeholder', () => {
    renderForm();
    expect(screen.getByTestId('field-slug')).toHaveAttribute(
      'placeholder',
      'e.g. plex-media-server',
    );
  });

  it('gives the icon URL field an example placeholder', () => {
    renderForm();
    expect(screen.getByTestId('field-icon')).toHaveAttribute(
      'placeholder',
      'e.g. https://cdn.example.com/plex.png',
    );
  });

  it('gives the gatus key field an explanatory placeholder in add mode', () => {
    renderForm();
    expect(screen.getByTestId('field-gatus_key')).toHaveAttribute(
      'placeholder',
      'e.g. plex — its Gatus monitor key',
    );
  });

  it('keeps the leave-blank gatus key placeholder in edit mode', () => {
    renderForm(svc());
    expect(screen.getByTestId('field-gatus_key')).toHaveAttribute(
      'placeholder',
      'leave blank to keep current',
    );
  });
});
