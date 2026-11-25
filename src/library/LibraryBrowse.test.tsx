import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import LibraryBrowse from './LibraryBrowse';
import { addFromLibrary, listLibrary, type LibraryOffer, type Service } from '../api';
import { ThemeProvider } from '../theme/theme';
import { categoryHue } from '../lib/categoryColor';

vi.mock('../api', () => ({
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
        targetCategory={props.targetCategory}
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

describe('Library search filter', () => {
  it('filters the list to offers whose name matches the query (case-insensitive)', async () => {
    renderBrowse();
    await screen.findAllByTestId('library-row');
    await userEvent.type(screen.getByLabelText(/filter the app library/i), 'JELLY');
    const rows = screen.getAllByTestId('library-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute('data-library-id', 'L1');
  });

  it('shows a no-matches hint (not a blank list) when the query excludes every offer', async () => {
    renderBrowse();
    await screen.findAllByTestId('library-row');
    await userEvent.type(screen.getByLabelText(/filter the app library/i), 'zzzznope');
    expect(screen.queryAllByTestId('library-row')).toHaveLength(0);
    expect(screen.getByTestId('library-no-matches')).toHaveTextContent(/no apps match/i);
  });
});

describe('A16 — add from the library', () => {
  it('clicking Add POSTs the offer and flips to Added ✓, announcing it', async () => {
    const onAdded = vi.fn();
    renderBrowse({ onAdded });
    await userEvent.click(await screen.findByTestId('library-add-L1'));

    await waitFor(() => expect(addFromLibrary).toHaveBeenCalledWith('L1', undefined));
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
    await waitFor(() => expect(addFromLibrary).toHaveBeenCalledWith('L2', undefined));
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

// SPEC-ui-quick-wins §3.6, AC-014..AC-016 — offers are grouped under a heading
// per suggested category, with a count; uncategorized offers go in "Other",
// last; an All / Not added / Added radio group filters together with the text
// filter. Groups come in the order of each group's first offer in library
// order, and library order holds inside a group.
describe('SPEC-ui-quick-wins — groups and the Added filter', () => {
  const offer = (id: string, name: string, cat: string, added: boolean, sortIndex: number): LibraryOffer => ({
    id, name, url: `https://${id}.x`, icon: '', description: `${name} app`, suggestedCategory: cat, sortIndex, added,
  });
  // Library order: Sonarr(Media) · Pi-hole(Network) · Misc(none) · Plex(Media) · Unifi(Network) · Notes(none)
  const GROUPED: LibraryOffer[] = [
    offer('G1', 'Sonarr', 'Media', true, 0),
    offer('G2', 'Pi-hole', 'Network', false, 1),
    offer('G3', 'Misc', '', false, 2),
    offer('G4', 'Plex', 'Media', false, 3),
    offer('G5', 'Unifi', 'Network', true, 4),
    offer('G6', 'Notes', '', true, 5),
  ];

  const groups = () =>
    screen.getAllByTestId('library-group').map((g) => ({
      title: within(g).getByTestId('library-group-title').textContent,
      rows: within(g).queryAllByTestId('library-row').map((r) => r.getAttribute('data-library-id')),
    }));

  beforeEach(() => {
    vi.mocked(listLibrary).mockResolvedValue(GROUPED);
  });

  it('AC-014: one heading per category with a count, in first-offer order, "Other" last', async () => {
    renderBrowse();
    await screen.findAllByTestId('library-row');
    expect(groups()).toEqual([
      { title: 'Media (2)', rows: ['G1', 'G4'] },
      { title: 'Network (2)', rows: ['G2', 'G5'] },
      { title: 'Other (2)', rows: ['G3', 'G6'] },
    ]);
  });

  it('AC-014: each group is a labelled region of its own list, and rows keep their chips', async () => {
    const { container } = renderBrowse();
    await screen.findAllByTestId('library-row');
    const media = screen.getAllByTestId('library-group')[0];
    expect(within(media).getByRole('heading', { name: 'Media (2)' })).toBeInTheDocument();
    expect(within(media).getByRole('list')).toHaveAccessibleName('Media');
    // The chips stay on the rows (4 categorized rows); headings carry no chip.
    expect(container.querySelectorAll('.library-chip')).toHaveLength(4);
  });

  it('AC-014: the heading carries the category hue the row chips use (#90)', async () => {
    renderBrowse();
    await screen.findAllByTestId('library-row');
    const [media, network, other] = screen.getAllByTestId('library-group');
    const hue = (g: HTMLElement) => within(g).getByTestId('library-group-hue').getAttribute('data-hue');
    expect(hue(media)).toBe(String(categoryHue('Media')));
    expect(hue(network)).toBe(String(categoryHue('Network')));
    expect(within(other).queryByTestId('library-group-hue')).toBeNull();
  });

  it('AC-015: the filter is a radio group, All checked by default', async () => {
    renderBrowse();
    await screen.findAllByTestId('library-row');
    const group = screen.getByRole('radiogroup', { name: /show/i });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('aria-label') ?? r.closest('label')?.textContent)).toEqual([
      'All',
      'Not added',
      'Added',
    ]);
    expect(within(group).getByRole('radio', { name: 'All' })).toBeChecked();
  });

  it('AC-015: "Not added" and "Added" filter rows; empty groups hide; counts match', async () => {
    renderBrowse();
    await screen.findAllByTestId('library-row');
    await userEvent.click(screen.getByRole('radio', { name: 'Not added' }));
    // Group order comes from the whole library, so Media stays first even
    // though its first visible offer (Plex) is later than Pi-hole: groups do
    // not jump around as the filter changes.
    expect(groups()).toEqual([
      { title: 'Media (1)', rows: ['G4'] },
      { title: 'Network (1)', rows: ['G2'] },
      { title: 'Other (1)', rows: ['G3'] },
    ]);
    await userEvent.click(screen.getByRole('radio', { name: 'Added' }));
    expect(groups()).toEqual([
      { title: 'Media (1)', rows: ['G1'] },
      { title: 'Network (1)', rows: ['G5'] },
      { title: 'Other (1)', rows: ['G6'] },
    ]);
  });

  it('AC-015: the radio filter combines with the text filter', async () => {
    renderBrowse();
    await screen.findAllByTestId('library-row');
    await userEvent.click(screen.getByRole('radio', { name: 'Added' }));
    await userEvent.type(screen.getByLabelText(/filter the app library/i), 'net');
    // "net" matches Pi-hole and Unifi by category; only Unifi is added.
    expect(groups()).toEqual([{ title: 'Network (1)', rows: ['G5'] }]);
  });

  it('AC-015: a filter that matches nothing says so instead of showing a blank list', async () => {
    vi.mocked(listLibrary).mockResolvedValue([offer('G1', 'Sonarr', 'Media', false, 0)]);
    renderBrowse();
    await screen.findAllByTestId('library-row');
    await userEvent.click(screen.getByRole('radio', { name: 'Added' }));
    expect(screen.queryAllByTestId('library-row')).toHaveLength(0);
    expect(screen.getByTestId('library-no-matches')).toHaveTextContent('No added apps yet.');
  });

  it('AC-015: adding under "Not added" moves the offer out of the view and announces it', async () => {
    vi.mocked(addFromLibrary).mockResolvedValue({ ok: true, status: 201, service: { ...NEW_SERVICE, name: 'Plex' } });
    renderBrowse();
    await screen.findAllByTestId('library-row');
    await userEvent.click(screen.getByRole('radio', { name: 'Not added' }));
    await userEvent.click(screen.getByTestId('library-add-G4'));
    await waitFor(() => expect(screen.queryByTestId('library-add-G4')).toBeNull());
    expect(screen.getByTestId('library-live')).toHaveTextContent('Plex added');
    expect(groups().map((g) => g.title)).toEqual(['Network (1)', 'Other (1)']);
    // The button that held focus is gone; focus goes to the next Add, not <body>.
    expect(document.activeElement).not.toBe(document.body);
    expect(screen.getByTestId('library-browse').contains(document.activeElement)).toBe(true);
  });

  it('AC-016: tab order follows the visual order — text filter, radio group, then groups top to bottom', async () => {
    renderBrowse();
    await screen.findAllByTestId('library-row');
    const input = screen.getByLabelText(/filter the app library/i);
    input.focus();
    await userEvent.tab();
    expect(screen.getByRole('radio', { name: 'All' })).toHaveFocus();
    await userEvent.tab();
    // First row of the first group (Sonarr, already added → its "Add again").
    expect(screen.getByTestId('library-added-G1')).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByTestId('library-add-G4')).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByTestId('library-add-G2')).toHaveFocus();
  });

  it('AC-016: the focus trap still wraps from the last control to the first', async () => {
    renderBrowse();
    await screen.findAllByTestId('library-row');
    screen.getByTestId('library-custom-add').focus();
    await userEvent.tab();
    expect(screen.getByTestId('library-close')).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByTestId('library-custom-add')).toHaveFocus();
  });

  it('AC-016: grouped and filtered, it has no axe violations', async () => {
    const { container } = renderBrowse();
    await screen.findAllByTestId('library-row');
    expect(await axe(container)).toHaveNoViolations();
    await userEvent.click(screen.getByRole('radio', { name: 'Not added' }));
    expect(await axe(container)).toHaveNoViolations();
  });
});

// SPEC-dashboard-empty-loading AC-010 / §3.3 — opened from an empty box, the
// Library says which box and files every add there, whatever group the offer
// is listed under. Without a target nothing changes.
describe('the target box (AC-010)', () => {
  it('without a target the heading is "App Library" and adds send no category', async () => {
    const u = userEvent.setup();
    renderBrowse();
    expect(await screen.findByRole('heading', { name: 'App Library' })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'App Library' })).toBeInTheDocument();
    await u.click(await screen.findByTestId('library-add-L1'));
    await waitFor(() => expect(addFromLibrary).toHaveBeenCalledWith('L1', undefined));
    expect(vi.mocked(addFromLibrary).mock.calls[0][1]).toBeUndefined();
  });

  it('with a target the heading reads "Add to {title}" and every add sends that categoryId', async () => {
    const u = userEvent.setup();
    renderBrowse({ targetCategory: { id: 'c7', title: 'Games' } });
    expect(await screen.findByRole('heading', { name: 'Add to Games' })).toBeInTheDocument();
    // The dialog's name says the same, for a screen reader.
    expect(screen.getByRole('dialog', { name: 'Add to Games' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'App Library' })).toBeNull();
    // L1 is suggested for "Media" — it still goes into the target box.
    await u.click(await screen.findByTestId('library-add-L1'));
    await waitFor(() => expect(addFromLibrary).toHaveBeenCalledWith('L1', 'c7'));
    // An "Add again" on an already-added offer goes there too.
    await u.click(screen.getByTestId('library-added-L2'));
    await waitFor(() => expect(addFromLibrary).toHaveBeenCalledWith('L2', 'c7'));
  });

  // SPEC-ui-quick-wins groups only sort the list (§3.3): with a target box, an
  // offer listed under any group — or "Other" — still lands in the target, and
  // the Added filter works the same.
  it('with a target box, offers in every group (and the Added filter) add into that box', async () => {
    const u = userEvent.setup();
    const offer = (id: string, name: string, cat: string, added: boolean, sortIndex: number): LibraryOffer => ({
      id, name, url: `https://${id}.x`, icon: '', description: '', suggestedCategory: cat, sortIndex, added,
    });
    vi.mocked(listLibrary).mockResolvedValue([
      offer('T1', 'Sonarr', 'Media', false, 0),
      offer('T2', 'Pi-hole', 'Network', false, 1),
      offer('T3', 'Notes', '', true, 2),
    ]);
    renderBrowse({ targetCategory: { id: 'c7', title: 'Games' } });
    expect(await screen.findByRole('heading', { name: 'Add to Games' })).toBeInTheDocument();
    const groupOf = (id: string) =>
      screen
        .getAllByTestId('library-group')
        .find((g) => within(g).queryAllByTestId('library-row').some((r) => r.getAttribute('data-library-id') === id))!;
    expect(within(groupOf('T1')).getByTestId('library-group-title')).toHaveTextContent('Media');
    expect(within(groupOf('T2')).getByTestId('library-group-title')).toHaveTextContent('Network');
    await u.click(within(groupOf('T1')).getByTestId('library-add-T1'));
    await waitFor(() => expect(addFromLibrary).toHaveBeenCalledWith('T1', 'c7'));
    await u.click(within(groupOf('T2')).getByTestId('library-add-T2'));
    await waitFor(() => expect(addFromLibrary).toHaveBeenCalledWith('T2', 'c7'));
    // The Added filter, then "Add again" from the "Other" group.
    await u.click(screen.getByRole('radio', { name: 'Added' }));
    await u.click(within(groupOf('T3')).getByTestId('library-added-T3'));
    await waitFor(() => expect(addFromLibrary).toHaveBeenCalledWith('T3', 'c7'));
    expect(vi.mocked(addFromLibrary).mock.calls.every((c) => c[1] === 'c7')).toBe(true);
  });
});
