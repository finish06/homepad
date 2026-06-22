import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import LibraryBrowse from './LibraryBrowse';
import { addFromLibrary, listLibrary, type LibraryOffer, type Service } from './api';
import { ThemeProvider } from './theme';
import { categoryHue } from './categoryColor';

vi.mock('./api', () => ({
  listLibrary: vi.fn(),
  addFromLibrary: vi.fn(),
}));

expect.extend(toHaveNoViolations);

const OFFERS: LibraryOffer[] = [
  {
    id: 'L1', name: 'Jellyfin', url: 'https://jf.x', icon: 'https://jf.x/i.png',
    description: 'Media server', suggestedCategory: 'Media', sortIndex: 0, added: false,
  },
  {
    id: 'L2', name: 'Vaultwarden', url: 'https://vw.x', icon: '',
    description: 'Password manager', suggestedCategory: '', sortIndex: 1, added: true,
  },
];

const NEW_SERVICE: Service = {
  id: 's9', slug: 'jellyfin', name: 'Jellyfin', description: 'Media server',
  url: 'https://jf.x', icon: '', status: 'UNKNOWN', favorite: false,
  iconLight: false, iconDark: false, categoryId: null, categoryName: null,
};

function renderBrowse(props: Partial<React.ComponentProps<typeof LibraryBrowse>> = {}) {
  return render(
    <ThemeProvider userPref="light">
      <LibraryBrowse
        onClose={props.onClose ?? vi.fn()}
        onAdded={props.onAdded ?? vi.fn()}
        onCustomAdd={props.onCustomAdd ?? vi.fn()}
        isAdmin={props.isAdmin ?? false}
        onManageLibrary={props.onManageLibrary}
      />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  vi.mocked(listLibrary).mockResolvedValue(OFFERS);
  vi.mocked(addFromLibrary).mockResolvedValue({ ok: true, status: 201, service: NEW_SERVICE });
});

afterEach(() => vi.clearAllMocks());

describe('A16 — browse the App Library', () => {
  it('lists every offer with name, description and a suggested-category chip', async () => {
    renderBrowse();
    expect(await screen.findByTestId('library-browse')).toBeInTheDocument();
    const rows = await screen.findAllByTestId('library-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute('data-library-id', 'L1');
    expect(within(rows[0]).getByText('Jellyfin')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Media server')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Media')).toBeInTheDocument();
  });

  it('is a modal dialog: role=dialog + aria-modal', async () => {
    renderBrowse();
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('an already-held offer shows the Added state instead of a plain Add', async () => {
    renderBrowse();
    // L1 not added → an Add button; L2 already added → the added affordance.
    expect(await screen.findByTestId('library-add-L1')).toBeInTheDocument();
    expect(screen.getByTestId('library-added-L2')).toBeInTheDocument();
  });

  it('the Add button has an accessible name naming the offer (a11y §9)', async () => {
    renderBrowse();
    expect(await screen.findByTestId('library-add-L1')).toHaveAccessibleName(/add jellyfin to my dashboard/i);
  });
});

describe('A16 — add from the library', () => {
  it('clicking Add POSTs the offer and flips to Added ✓, announcing it', async () => {
    const onAdded = vi.fn();
    renderBrowse({ onAdded });
    await userEvent.click(await screen.findByTestId('library-add-L1'));

    await waitFor(() => expect(addFromLibrary).toHaveBeenCalledWith('L1'));
    expect(onAdded).toHaveBeenCalledWith(NEW_SERVICE);
    // The row flips to the Added state and keeps an "Add again" affordance (D6).
    expect(await screen.findByTestId('library-added-L1')).toBeInTheDocument();
    expect(screen.getByText(/jellyfin added/i)).toBeInTheDocument();
  });

  it('Added ✓ carries text + a check glyph, not colour alone (a11y §9)', async () => {
    renderBrowse();
    // L2 is already added on load.
    expect(await screen.findByTestId('library-added-L2')).toHaveTextContent(/added/i);
  });

  it('"Add again" adds a second copy (no dedupe — D6)', async () => {
    renderBrowse();
    // L2 is already added; its affordance still lets you add again.
    await userEvent.click(await screen.findByTestId('library-added-L2'));
    await waitFor(() => expect(addFromLibrary).toHaveBeenCalledWith('L2'));
  });
});

describe('A16 — empty library + custom add', () => {
  it('shows the empty hint when the library has no offers', async () => {
    vi.mocked(listLibrary).mockResolvedValue([]);
    renderBrowse();
    expect(await screen.findByTestId('library-empty')).toBeInTheDocument();
  });

  it('renders a decorative illustration in the empty library state (#91)', async () => {
    vi.mocked(listLibrary).mockResolvedValue([]);
    renderBrowse();
    const illustration = await screen.findByTestId('library-empty-illustration');
    expect(illustration).toBeInTheDocument();
    expect(illustration).toHaveAttribute('aria-hidden', 'true');
  });

  it('an admin sees a manage-library link in the empty state', async () => {
    vi.mocked(listLibrary).mockResolvedValue([]);
    const onManageLibrary = vi.fn();
    renderBrowse({ isAdmin: true, onManageLibrary });
    await screen.findByTestId('library-empty');
    await userEvent.click(screen.getByTestId('library-manage-link'));
    expect(onManageLibrary).toHaveBeenCalled();
  });

  it('the custom-app affordance opens the add form (§7.2)', async () => {
    const onCustomAdd = vi.fn();
    renderBrowse({ onCustomAdd });
    await screen.findByTestId('library-browse');
    await userEvent.click(screen.getByTestId('library-custom-add'));
    expect(onCustomAdd).toHaveBeenCalled();
  });
});

describe('A16 — dismissal', () => {
  it('Escape closes the modal', async () => {
    const onClose = vi.fn();
    renderBrowse({ onClose });
    await screen.findByTestId('library-browse');
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('clicking the scrim closes the modal', async () => {
    const onClose = vi.fn();
    renderBrowse({ onClose });
    await screen.findByTestId('library-browse');
    await userEvent.click(screen.getByTestId('library-browse-overlay'));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('#90 — per-category chip color', () => {
  it('gives each category chip a hue matching its name (distinct per category)', async () => {
    vi.mocked(listLibrary).mockResolvedValue([
      { ...OFFERS[0], id: 'C1', suggestedCategory: 'Media', added: false },
      { ...OFFERS[0], id: 'C2', suggestedCategory: 'Network', added: false },
    ]);
    const { container } = renderBrowse();
    await screen.findAllByTestId('library-row');
    const chips = container.querySelectorAll<HTMLElement>('.library-chip');
    expect(chips).toHaveLength(2);
    const hueOf = (el: HTMLElement) => el.style.getPropertyValue('--chip-hue');
    expect(hueOf(chips[0])).toBe(String(categoryHue('Media')));
    expect(hueOf(chips[1])).toBe(String(categoryHue('Network')));
    expect(hueOf(chips[0])).not.toBe(hueOf(chips[1]));
  });
});

describe('A19 — a11y / themes', () => {
  it('has no axe violations populated (light)', async () => {
    const { container } = renderBrowse();
    await screen.findAllByTestId('library-row');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations empty + dark', async () => {
    vi.mocked(listLibrary).mockResolvedValue([]);
    const { container } = render(
      <div className="dark">
        <ThemeProvider userPref="dark">
          <LibraryBrowse onClose={vi.fn()} onAdded={vi.fn()} onCustomAdd={vi.fn()} />
        </ThemeProvider>
      </div>,
    );
    await screen.findByTestId('library-empty');
    expect(await axe(container)).toHaveNoViolations();
  });
});
