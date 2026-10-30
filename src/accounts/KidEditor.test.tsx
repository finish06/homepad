import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import KidEditor from './KidEditor';
import {
  categories,
  createKid,
  deleteKid,
  kidServices,
  kidSessions,
  revokeKidSession,
  services,
  setKidServices,
  signInHere,
  updateKid,
  type Account,
  type Category,
  type KidDevice,
  type Service,
} from '../api';
import { reloadPage } from '../lib/reload';

// SPEC-kid-accounts UX §3 (TASK-403) and §4 (TASK-404) — the kid editor modal
// and the "Sign in this device as …" confirm.

vi.mock('../api', () => ({
  services: vi.fn(),
  categories: vi.fn(),
  kidServices: vi.fn(),
  kidSessions: vi.fn(),
  createKid: vi.fn(),
  updateKid: vi.fn(),
  deleteKid: vi.fn(),
  setKidServices: vi.fn(),
  revokeKidSession: vi.fn(),
  signInHere: vi.fn(),
}));
vi.mock('../lib/reload', () => ({ reloadPage: vi.fn() }));

expect.extend(toHaveNoViolations);

function svc(id: string, name: string, categoryId: string | null): Service {
  return {
    id, slug: id, name, description: '', url: `https://${id}.test`, icon: '', status: 'UP',
    favorite: false, iconLight: false, iconDark: false, categoryId,
  };
}

// Catalog order is the categories' sortIndex, NOT the array order.
const CATS: Category[] = [
  { id: 'c-photos', name: 'Photos', sortIndex: 1 },
  { id: 'c-media', name: 'Media', sortIndex: 0 },
  { id: 'c-ops', name: 'Monitoring', sortIndex: 2 },
  { id: 'c-empty', name: 'Empty', sortIndex: 3 },
];
const SVCS: Service[] = [
  svc('plex', 'Plex', 'c-media'),
  svc('jellyfin', 'Jellyfin', 'c-media'),
  svc('abs', 'Audiobookshelf', 'c-media'),
  svc('kavita', 'Kavita', 'c-media'),
  svc('immich', 'Immich', 'c-photos'),
  svc('photoprism', 'PhotoPrism', 'c-photos'),
  svc('ente', 'Ente', 'c-photos'),
  svc('grafana', 'Grafana', 'c-ops'),
  svc('gatus', 'Gatus', 'c-ops'),
  svc('khan', 'Khan Academy', null),
];

const MAYA: Account = {
  id: 'k-maya', name: 'Maya', role: 'kid', lastSeenAt: null, avatarColor: 'teal', appCount: 5, deviceCount: 1,
};
const IPAD: KidDevice = {
  id: 'h1',
  userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  createdAt: '2026-10-22T09:00:00Z',
  lastSeenAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
};

beforeEach(() => {
  vi.mocked(services).mockResolvedValue(SVCS);
  vi.mocked(categories).mockResolvedValue(CATS);
  vi.mocked(kidServices).mockResolvedValue(['plex', 'jellyfin', 'abs', 'kavita', 'immich']);
  vi.mocked(kidSessions).mockResolvedValue([IPAD]);
  vi.mocked(setKidServices).mockResolvedValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
});

function renderEditor(kid?: Account) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const onDeleted = vi.fn();
  const utils = render(<KidEditor kid={kid} onClose={onClose} onSaved={onSaved} onDeleted={onDeleted} />);
  return { ...utils, onClose, onSaved, onDeleted };
}

async function ready() {
  await screen.findByTestId('kid-checklist');
}

const section = (name: string) => screen.getByTestId(`kid-section-${name}`);
const sectionNames = () => screen.getAllByTestId(/^kid-section-/).map((el) => el.getAttribute('data-testid')!.slice(12));

describe('Add a kid (UX §3)', () => {
  it('is titled "Add a kid", focuses the name, defaults a color, and keeps Save disabled', async () => {
    renderEditor();
    expect(screen.getByRole('dialog', { name: 'Add a kid' })).toBeInTheDocument();
    await ready();
    expect(screen.getByLabelText('Name')).toHaveFocus();
    const radios = within(screen.getByRole('radiogroup', { name: 'Color' })).getAllByRole('radio');
    expect(radios.map((r) => (r as HTMLInputElement).value)).toEqual(['blue', 'teal', 'green', 'orange', 'pink', 'purple']);
    expect(screen.getByRole('radio', { name: 'Blue' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('has no Devices, no Delete and no sign-in-here while adding', async () => {
    renderEditor();
    await ready();
    expect(screen.queryByTestId('kid-devices')).toBeNull();
    expect(screen.queryByRole('button', { name: /^delete/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /sign in this device/i })).toBeNull();
    expect(kidSessions).not.toHaveBeenCalled();
    expect(kidServices).not.toHaveBeenCalled();
  });

  it('groups the checklist by section in catalog order, Uncategorized last, empty sections dropped', async () => {
    renderEditor();
    await ready();
    expect(sectionNames()).toEqual(['Media', 'Photos', 'Monitoring', 'Uncategorized']);
  });

  it('starts every section collapsed when nothing is ticked, each with a "none" header', async () => {
    renderEditor();
    await ready();
    const media = section('Media');
    expect(within(media).getByRole('button', { name: /media/i, expanded: false })).toBeInTheDocument();
    expect(within(media).queryByRole('checkbox', { name: 'Plex' })).toBeNull();
    expect(within(media).getByRole('checkbox', { name: /select all in media/i })).toHaveAttribute('aria-checked', 'false');
    expect(media).toHaveTextContent('none (4)');
  });

  it('shows "0 of 10", the empty-dashboard warning and the OQ-1 line', async () => {
    renderEditor();
    await ready();
    expect(screen.getByTestId('kid-app-count')).toHaveTextContent('0 of 10');
    expect(screen.getByTestId('kid-zero-warning')).toHaveTextContent('This kid will see an empty dashboard.');
    expect(screen.getByText('New apps you add later stay hidden until you tick them.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Name'), 'Leo');
    expect(screen.getByTestId('kid-zero-warning')).toHaveTextContent('Leo will see an empty dashboard.');
    expect(screen.getByText(/apps leo can see/i)).toBeInTheDocument();
  });

  it('saves a name, a color and the ticked apps, then closes', async () => {
    const created: Account = { id: 'k-new', name: 'Leo', role: 'kid', lastSeenAt: null, avatarColor: 'pink', appCount: 0, deviceCount: 0 };
    vi.mocked(createKid).mockResolvedValue({ ok: true, status: 201, account: created });
    const { onSaved, onClose } = renderEditor();
    await ready();
    await userEvent.type(screen.getByLabelText('Name'), '  Leo ');
    await userEvent.click(screen.getByRole('radio', { name: 'Pink' }));
    await userEvent.click(within(section('Media')).getByRole('checkbox', { name: /select all in media/i }));
    expect(screen.getByTestId('kid-app-count')).toHaveTextContent('4 of 10');
    expect(screen.queryByTestId('kid-zero-warning')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(createKid).toHaveBeenCalledWith('Leo', 'pink');
    expect(setKidServices).toHaveBeenCalledWith('k-new', ['plex', 'jellyfin', 'abs', 'kavita']);
    expect(onSaved).toHaveBeenLastCalledWith({ ...created, appCount: 4 });
  });

  it('a kid with zero apps is created without a services write', async () => {
    vi.mocked(createKid).mockResolvedValue({ ok: true, status: 201, account: { ...MAYA, id: 'k-new', name: 'Leo', appCount: 0 } });
    const { onClose } = renderEditor();
    await ready();
    await userEvent.type(screen.getByLabelText('Name'), 'Leo');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(setKidServices).not.toHaveBeenCalled();
  });

  it('a duplicate name (409) shows inline under the field and keeps the editor open', async () => {
    vi.mocked(createKid).mockResolvedValue({ ok: false, status: 409, error: 'a kid with that name already exists' });
    const { onClose } = renderEditor();
    await ready();
    await userEvent.type(screen.getByLabelText('Name'), 'Maya');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const err = await screen.findByText('Another kid already has this name.');
    const input = screen.getByLabelText('Name');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toContain(err.id);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a 400 from the server is a name error too', async () => {
    vi.mocked(createKid).mockResolvedValue({ ok: false, status: 400, error: 'name must be 1-40 characters' });
    renderEditor();
    await ready();
    await userEvent.type(screen.getByLabelText('Name'), 'Leo');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Use 1–40 characters, with no special control characters.')).toBeInTheDocument();
  });

  it('any other failure is a general error', async () => {
    vi.mocked(createKid).mockResolvedValue({ ok: false, status: 0, error: 'network error' });
    renderEditor();
    await ready();
    await userEvent.type(screen.getByLabelText('Name'), 'Leo');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save. Try again.");
  });

  it('a blank name is caught before any request', async () => {
    renderEditor();
    await ready();
    await userEvent.click(within(section('Photos')).getByRole('checkbox', { name: /select all in photos/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Enter a name.')).toBeInTheDocument();
    expect(createKid).not.toHaveBeenCalled();
  });

  it('a name over 40 characters is caught before any request', async () => {
    renderEditor();
    await ready();
    const input = screen.getByLabelText('Name');
    await userEvent.click(input);
    await userEvent.paste('x'.repeat(41));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Use 40 characters or fewer.')).toBeInTheDocument();
    expect(createKid).not.toHaveBeenCalled();
  });

  it('created but the apps write failed: says so, becomes an edit, and Save retries only the apps', async () => {
    const created: Account = { id: 'k-new', name: 'Leo', role: 'kid', lastSeenAt: null, avatarColor: 'blue', appCount: 0, deviceCount: 0 };
    vi.mocked(createKid).mockResolvedValue({ ok: true, status: 201, account: created });
    vi.mocked(setKidServices).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    vi.mocked(kidSessions).mockResolvedValue([]);
    const { onClose, onSaved } = renderEditor();
    await ready();
    await userEvent.type(screen.getByLabelText('Name'), 'Leo');
    await userEvent.click(within(section('Photos')).getByRole('checkbox', { name: /select all in photos/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Saved Leo, but couldn't save their apps. Try again.");
    expect(onSaved).toHaveBeenCalledWith(created);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Leo' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(createKid).toHaveBeenCalledTimes(1);
    expect(setKidServices).toHaveBeenCalledTimes(2);
  });
});

describe('App checklist (UX §3)', () => {
  it('chips are real checkboxes with visible labels; ticking updates the count', async () => {
    renderEditor();
    await ready();
    await userEvent.click(within(section('Photos')).getByRole('button', { name: /photos/i, expanded: false }));
    const immich = screen.getByRole('checkbox', { name: 'Immich' });
    expect(immich.tagName).toBe('INPUT');
    await userEvent.click(immich);
    expect(immich).toBeChecked();
    expect(screen.getByTestId('kid-app-count')).toHaveTextContent('1 of 10');
    await userEvent.click(immich);
    expect(screen.getByTestId('kid-app-count')).toHaveTextContent('0 of 10');
  });

  it('the section header is tri-state: none → all → none, and some reads mixed', async () => {
    renderEditor();
    await ready();
    const photos = section('Photos');
    await userEvent.click(within(photos).getByRole('button', { name: /photos/i }));
    const tri = within(photos).getByRole('checkbox', { name: /select all in photos/i });
    await userEvent.click(tri);
    expect(tri).toHaveAttribute('aria-checked', 'true');
    expect(photos).toHaveTextContent('all (3)');
    await userEvent.click(within(photos).getByRole('checkbox', { name: 'Ente' }));
    expect(tri).toHaveAttribute('aria-checked', 'mixed');
    expect(photos).toHaveTextContent('some (2 of 3)');
    // From "some", the header selects the whole section.
    await userEvent.click(tri);
    expect(tri).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(tri);
    expect(tri).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('kid-app-count')).toHaveTextContent('0 of 10');
  });

  it('the tri-state works from the keyboard (Space)', async () => {
    renderEditor();
    await ready();
    const tri = within(section('Media')).getByRole('checkbox', { name: /select all in media/i });
    tri.focus();
    await userEvent.keyboard(' ');
    expect(tri).toHaveAttribute('aria-checked', 'true');
  });

  it('a section can be expanded and collapsed', async () => {
    renderEditor();
    await ready();
    const toggle = within(section('Media')).getByRole('button', { name: /media/i });
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('checkbox', { name: 'Plex' })).toBeInTheDocument();
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('checkbox', { name: 'Plex' })).toBeNull();
  });

  it('search filters chips across sections and expands any section with a match', async () => {
    renderEditor();
    await ready();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search apps' }), 'jelly');
    expect(sectionNames()).toEqual(['Media']);
    expect(screen.getByRole('checkbox', { name: 'Jellyfin' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Plex' })).toBeNull();
    // The running count still counts the whole catalog.
    expect(screen.getByTestId('kid-app-count')).toHaveTextContent('0 of 10');
    await userEvent.clear(screen.getByRole('searchbox', { name: 'Search apps' }));
    expect(sectionNames()).toEqual(['Media', 'Photos', 'Monitoring', 'Uncategorized']);
    expect(screen.queryByRole('checkbox', { name: 'Jellyfin' })).toBeNull();
  });

  it('search with no match says so', async () => {
    renderEditor();
    await ready();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search apps' }), 'zzz');
    expect(screen.getByText('No apps match “zzz”.')).toBeInTheDocument();
  });

  it('says so when the catalog has no apps at all', async () => {
    vi.mocked(services).mockResolvedValue([]);
    renderEditor();
    await ready();
    expect(screen.getByText('The catalog has no apps yet.')).toBeInTheDocument();
    expect(screen.getByTestId('kid-app-count')).toHaveTextContent('0 of 0');
  });
});

describe('Edit a kid (UX §3)', () => {
  it('is titled with the kid’s name and loads the allow-list into the checklist', async () => {
    renderEditor(MAYA);
    expect(screen.getByRole('dialog', { name: 'Maya' })).toBeInTheDocument();
    await ready();
    expect(kidServices).toHaveBeenCalledWith('k-maya');
    expect(screen.getByLabelText('Name')).toHaveValue('Maya');
    expect(screen.getByRole('radio', { name: 'Teal' })).toBeChecked();
    expect(screen.getByTestId('kid-app-count')).toHaveTextContent('5 of 10');
    expect(screen.getByText(/apps maya can see/i)).toBeInTheDocument();
    // Sections with a ticked app start expanded; the rest collapsed.
    expect(within(section('Media')).getByRole('button', { name: /media/i })).toHaveAttribute('aria-expanded', 'true');
    expect(within(section('Photos')).getByRole('button', { name: /photos/i })).toHaveAttribute('aria-expanded', 'true');
    expect(within(section('Monitoring')).getByRole('button', { name: /monitoring/i })).toHaveAttribute('aria-expanded', 'false');
    expect(within(section('Media')).getByRole('checkbox', { name: /select all in media/i })).toHaveAttribute('aria-checked', 'true');
    expect(within(section('Photos')).getByRole('checkbox', { name: /select all in photos/i })).toHaveAttribute('aria-checked', 'mixed');
    expect(section('Photos')).toHaveTextContent('some (1 of 3)');
    expect(screen.getByRole('checkbox', { name: 'Immich' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Ente' })).not.toBeChecked();
  });

  it('Save stays disabled until something changes', async () => {
    renderEditor(MAYA);
    await ready();
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Ente' }));
    expect(save).toBeEnabled();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Ente' }));
    expect(save).toBeDisabled();
  });

  it('a color change PATCHes only the color', async () => {
    vi.mocked(updateKid).mockResolvedValue({ ok: true, status: 200, account: { ...MAYA, avatarColor: 'purple' } });
    const { onSaved, onClose } = renderEditor(MAYA);
    await ready();
    await userEvent.click(screen.getByRole('radio', { name: 'Purple' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(updateKid).toHaveBeenCalledWith('k-maya', { avatarColor: 'purple' });
    expect(setKidServices).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledWith({ ...MAYA, avatarColor: 'purple' });
  });

  it('a rename PATCHes only the trimmed name', async () => {
    vi.mocked(updateKid).mockResolvedValue({ ok: true, status: 200, account: { ...MAYA, name: 'Maya B' } });
    const { onClose } = renderEditor(MAYA);
    await ready();
    await userEvent.type(screen.getByLabelText('Name'), ' B ');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(updateKid).toHaveBeenCalledWith('k-maya', { name: 'Maya B' });
  });

  it('an apps change PUTs the whole set and nothing else', async () => {
    const { onSaved, onClose } = renderEditor(MAYA);
    await ready();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Plex' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(updateKid).not.toHaveBeenCalled();
    expect(setKidServices).toHaveBeenCalledWith('k-maya', ['jellyfin', 'abs', 'kavita', 'immich']);
    expect(onSaved).toHaveBeenCalledWith({ ...MAYA, appCount: 4 });
  });

  it('saving down to zero apps is allowed, with the warning showing', async () => {
    vi.mocked(kidServices).mockResolvedValue(['immich']);
    const { onClose } = renderEditor(MAYA);
    await ready();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Immich' }));
    expect(screen.getByTestId('kid-zero-warning')).toHaveTextContent('Maya will see an empty dashboard.');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(setKidServices).toHaveBeenCalledWith('k-maya', []);
  });

  it('a failed apps write keeps the editor open with an error', async () => {
    vi.mocked(setKidServices).mockResolvedValue(false);
    const { onClose } = renderEditor(MAYA);
    await ready();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Plex' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save Maya's apps. Try again.");
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a failed rename (409) is inline and stops before the apps write', async () => {
    vi.mocked(updateKid).mockResolvedValue({ ok: false, status: 409, error: 'dup' });
    renderEditor(MAYA);
    await ready();
    await userEvent.clear(screen.getByLabelText('Name'));
    await userEvent.type(screen.getByLabelText('Name'), 'Leo');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Plex' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Another kid already has this name.')).toBeInTheDocument();
    expect(setKidServices).not.toHaveBeenCalled();
  });

  it('if the allow-list cannot load, the editor refuses to save rather than overwrite it', async () => {
    vi.mocked(kidServices).mockRejectedValue(new Error('boom'));
    renderEditor(MAYA);
    expect(await screen.findByText("Couldn't load Maya's apps. Close this and try again.")).toBeInTheDocument();
    expect(screen.queryByTestId('kid-checklist')).toBeNull();
    await userEvent.click(screen.getByRole('radio', { name: 'Purple' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('a kid color outside the six swatches still shows as selected', async () => {
    renderEditor({ ...MAYA, avatarColor: 'yellow' });
    await ready();
    expect(screen.getByRole('radio', { name: 'Yellow' })).toBeChecked();
  });
});

describe('Dirty-form discard confirm (UX §3)', () => {
  it('closing a clean editor closes at once', async () => {
    const { onClose } = renderEditor(MAYA);
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closing with unsaved changes asks "Discard changes to Maya?"', async () => {
    const { onClose } = renderEditor(MAYA);
    await ready();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Ente' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Discard changes to Maya?')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByText('Discard changes to Maya?')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Close Maya' }));
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape asks first when dirty; a second Escape keeps editing', async () => {
    const { onClose } = renderEditor(MAYA);
    await ready();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Ente' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.getByText('Discard changes to Maya?')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText('Discard changes to Maya?')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Escape closes a clean editor without reaching the Admin Panel underneath', async () => {
    const outer = vi.fn();
    window.addEventListener('keydown', outer);
    const { onClose } = renderEditor(MAYA);
    await ready();
    screen.getByLabelText('Name').focus();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
    window.removeEventListener('keydown', outer);
  });

  it('the new-kid discard prompt reads "Discard this new kid?"', async () => {
    renderEditor();
    await ready();
    await userEvent.type(screen.getByLabelText('Name'), 'Leo');
    await userEvent.click(screen.getByRole('button', { name: 'Close Add a kid' }));
    expect(screen.getByText('Discard this new kid?')).toBeInTheDocument();
  });

  it('a click on the scrim is a close attempt too', async () => {
    const { onClose } = renderEditor(MAYA);
    await ready();
    await userEvent.click(screen.getByTestId('kid-editor-overlay'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('Delete a kid (UX §3)', () => {
  it('asks first, then deletes, reports the id and closes', async () => {
    vi.mocked(deleteKid).mockResolvedValue(true);
    const { onDeleted, onClose } = renderEditor(MAYA);
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Delete Maya' }));
    expect(screen.getByText('Delete Maya? Their devices are signed out and their favorites are removed.')).toBeInTheDocument();
    expect(deleteKid).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Delete Maya' }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith('k-maya'));
    expect(onClose).toHaveBeenCalled();
  });

  it('Cancel on the confirm keeps the kid', async () => {
    renderEditor(MAYA);
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Delete Maya' }));
    await userEvent.click(within(screen.getByTestId('kid-delete-confirm')).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByTestId('kid-delete-confirm')).toBeNull();
    expect(deleteKid).not.toHaveBeenCalled();
  });

  it('a failed delete says so and keeps the editor open', async () => {
    vi.mocked(deleteKid).mockResolvedValue(false);
    const { onClose, onDeleted } = renderEditor(MAYA);
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Delete Maya' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete Maya' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't delete Maya. Try again.");
    expect(onClose).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });
});

describe('Devices (UX §3, AC-012)', () => {
  it('lists each device with what it is, when it signed in and when it was last used', async () => {
    renderEditor(MAYA);
    const row = await screen.findByTestId('kid-device-row');
    expect(row).toHaveTextContent('iPad · Safari');
    expect(row).toHaveTextContent(/signed in Oct 22/);
    expect(row).toHaveTextContent('last used 2h ago');
  });

  it('Sign out revokes that device at once (no confirm) and updates the count', async () => {
    vi.mocked(revokeKidSession).mockResolvedValue(true);
    const { onSaved, onClose } = renderEditor(MAYA);
    await screen.findByTestId('kid-device-row');
    await userEvent.click(screen.getByRole('button', { name: 'Sign out iPad · Safari' }));
    await waitFor(() => expect(screen.queryByTestId('kid-device-row')).toBeNull());
    expect(revokeKidSession).toHaveBeenCalledWith('k-maya', 'h1');
    expect(screen.getByText('No devices yet')).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledWith({ ...MAYA, deviceCount: 0 });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a failed sign-out keeps the row and says so', async () => {
    vi.mocked(revokeKidSession).mockResolvedValue(false);
    renderEditor(MAYA);
    await screen.findByTestId('kid-device-row');
    await userEvent.click(screen.getByRole('button', { name: 'Sign out iPad · Safari' }));
    expect(await screen.findByText("Couldn't sign that device out. Try again.")).toBeInTheDocument();
    expect(screen.getByTestId('kid-device-row')).toBeInTheDocument();
  });

  it('"No devices yet" is the empty state', async () => {
    vi.mocked(kidSessions).mockResolvedValue([]);
    renderEditor(MAYA);
    expect(await screen.findByText('No devices yet')).toBeInTheDocument();
  });

  it('a failed device load says so', async () => {
    vi.mocked(kidSessions).mockRejectedValue(new Error('x'));
    renderEditor(MAYA);
    expect(await screen.findByText("Couldn't load devices.")).toBeInTheDocument();
  });
});

describe('Sign in this device as … (UX §4, TASK-404)', () => {
  it('is disabled with "Save first" while the editor has unsaved changes', async () => {
    renderEditor(MAYA);
    await ready();
    const btn = screen.getByRole('button', { name: 'Sign in this device as Maya' });
    expect(btn).toBeEnabled();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Ente' }));
    expect(btn).toBeDisabled();
    const hint = screen.getByText('Save first');
    expect(btn.getAttribute('aria-describedby')).toBe(hint.id);
  });

  it('opens a confirm with the exact UX §4 copy and a primary that names the kid', async () => {
    renderEditor(MAYA);
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in this device as Maya' }));
    const dlg = screen.getByRole('alertdialog', { name: 'Sign in this device as Maya?' });
    expect(dlg).toHaveTextContent(
      "You'll be signed out here, and this device will show Maya's dashboard. It stays signed in until you sign it out from Accounts on another device.",
    );
    expect(dlg).toHaveTextContent('To manage Homepad again on this device, sign out of Maya and sign in as yourself.');
    expect(within(dlg).getByRole('button', { name: 'Sign in as Maya' })).toBeInTheDocument();
    expect(within(dlg).queryByRole('button', { name: /confirm/i })).toBeNull();
    expect(within(dlg).getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('Cancel closes only the confirm', async () => {
    const { onClose } = renderEditor(MAYA);
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in this device as Maya' }));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Maya' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Escape closes only the confirm', async () => {
    const { onClose } = renderEditor(MAYA);
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in this device as Maya' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('on success the page reloads into the kid’s dashboard (the server swapped the session)', async () => {
    vi.mocked(signInHere).mockResolvedValue(true);
    renderEditor(MAYA);
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in this device as Maya' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sign in as Maya' }));
    await waitFor(() => expect(reloadPage).toHaveBeenCalledTimes(1));
    expect(signInHere).toHaveBeenCalledWith('k-maya');
  });

  it('on failure it says so and does not reload', async () => {
    vi.mocked(signInHere).mockResolvedValue(false);
    renderEditor(MAYA);
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in this device as Maya' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sign in as Maya' }));
    expect(await within(screen.getByRole('alertdialog')).findByRole('alert')).toHaveTextContent(
      "Couldn't sign this device in. Try again.",
    );
    expect(reloadPage).not.toHaveBeenCalled();
  });
});

describe('Kid editor — accessibility (UX §6)', () => {
  it('the edit view has no axe violations', async () => {
    renderEditor(MAYA);
    await ready();
    await screen.findByTestId('kid-device-row');
    expect(await axe(document.body)).toHaveNoViolations();
  });

  it('the add view and the sign-in confirm have no axe violations', async () => {
    const { unmount } = renderEditor();
    await ready();
    expect(await axe(document.body)).toHaveNoViolations();
    unmount();
    renderEditor(MAYA);
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in this device as Maya' }));
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
