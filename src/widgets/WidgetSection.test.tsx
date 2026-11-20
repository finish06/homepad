// SPEC-status-widgets AC-024 / UX §6 — the Widget section of the tile editor,
// driven through the real TileEditModal so the Save order is covered too.
//   AC-003 a key is write-only: never shown or prefilled; "Key saved" with
//          Replace and Remove.
//   AC-004 no server key → the key field is disabled with one line of help.
//   AC-005 an unreadable saved key → the editor asks for it again.
//   AC-021 Test connection tests the unsaved form; fixed copy per code.
//   AC-023 changing the type or the address host drops the saved key.
//   AC-025 a matching tile name suggests the type; the admin still chooses.
//   UX §6.2 one Save never half-applies: the widget goes first, and a widget
//          error keeps the modal open with the tile part unsaved.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TileEditModal from '../grid/TileEditModal';
import { updateService, type Service } from '../api';
import {
  deleteWidget,
  getWidget,
  putWidget,
  testWidget,
  widgetKinds,
  type KindsResponse,
  type WidgetConfig,
} from './widgetAdminApi';

vi.mock('../api', () => ({
  updateService: vi.fn(),
  uploadIcon: vi.fn(),
  deleteIcon: vi.fn(),
  fetchIcon: vi.fn(),
}));
vi.mock('./widgetAdminApi', () => ({
  widgetKinds: vi.fn(),
  getWidget: vi.fn(),
  putWidget: vi.fn(),
  deleteWidget: vi.fn(),
  testWidget: vi.fn(),
}));

const mUpdate = vi.mocked(updateService);
const mKinds = vi.mocked(widgetKinds);
const mGet = vi.mocked(getWidget);
const mPut = vi.mocked(putWidget);
const mDelete = vi.mocked(deleteWidget);
const mTest = vi.mocked(testWidget);

const KINDS: KindsResponse = {
  secretKeySet: true,
  kinds: [
    {
      kind: 'jellyfin',
      label: 'Jellyfin',
      auth: 'api_key',
      match: ['jellyfin'],
      help: 'In Jellyfin: Dashboard → API Keys → +.',
      fields: [
        { key: 'playing', label: 'playing', unit: 'count', default: true },
        { key: 'movies', label: 'movies', unit: 'count', default: true },
        { key: 'series', label: 'shows', unit: 'count', default: true },
        { key: 'episodes', label: 'episodes', unit: 'count', default: false },
        { key: 'songs', label: 'songs', unit: 'count', default: false },
        { key: 'books', label: 'books', unit: 'count', default: false },
      ],
    },
    {
      kind: 'sonarr',
      label: 'Sonarr',
      auth: 'api_key',
      match: ['sonarr'],
      help: 'In Sonarr: Settings → General → API Key.',
      fields: [
        { key: 'upcoming', label: 'this week', unit: 'count', default: true },
        { key: 'queued', label: 'in queue', unit: 'count', default: true },
        { key: 'missing', label: 'missing', unit: 'count', default: true },
      ],
    },
  ],
};

const SAVED: WidgetConfig = {
  kind: 'jellyfin',
  address: 'http://jellyfin.home.arpa:8096',
  username: '',
  hasSecret: true,
  fields: ['playing', 'movies'],
  intervalS: 60,
  insecureTls: false,
  enabled: true,
  state: 'ok',
  error: '',
  lastOkAt: null,
  lastCheckAt: null,
};

function svc(over: Partial<Service> = {}): Service {
  return {
    id: 'S1',
    slug: 'media',
    name: 'Media server',
    url: 'https://media.example.com',
    description: '',
    icon: '',
    status: 'UP',
    favorite: false,
    iconLight: false,
    iconDark: false,
    categoryId: null,
    categoryName: null,
    gatus_key: '',
    ...over,
  };
}

beforeEach(() => {
  mKinds.mockResolvedValue(KINDS);
  mGet.mockResolvedValue({ status: 'none' });
  mPut.mockResolvedValue({ ok: true, config: SAVED });
  mDelete.mockResolvedValue(true);
  mUpdate.mockImplementation(async (id) => ({ ok: true, status: 200, service: { ...svc(), id } }));
});
afterEach(() => vi.clearAllMocks());

async function open(service: Service = svc()) {
  const onPatch = vi.fn();
  const onClose = vi.fn();
  render(
    <TileEditModal service={service} categories={[]} theme="light" onClose={onClose} onPatch={onPatch} onToast={vi.fn()} />,
  );
  const section = await screen.findByTestId('widget-section');
  await waitFor(() => expect(within(section).getByLabelText('Type')).toBeEnabled());
  return { section, onPatch, onClose, user: userEvent.setup() };
}

const typeSelect = (s: HTMLElement) => within(s).getByLabelText('Type') as HTMLSelectElement;

describe('the section and its Type row (AC-024, AC-025)', () => {
  it('sits under a "Widget" heading, inside the admin styles root', async () => {
    const { section } = await open();
    expect(within(section).getByRole('heading', { name: 'Widget' })).toBeInTheDocument();
    expect(section).toHaveClass('widget-config');
  });

  it('with None it is just the Type row', async () => {
    const { section } = await open();
    const select = typeSelect(section);
    expect(select.value).toBe('');
    expect([...select.options].map((o) => o.text)).toEqual(['None', 'Jellyfin', 'Sonarr']);
    expect(within(section).queryByLabelText('Address')).not.toBeInTheDocument();
  });

  it('a matching tile name preselects the type with a "Suggested" tag', async () => {
    const { section } = await open(svc({ name: 'Jellyfin' }));
    expect(typeSelect(section).value).toBe('jellyfin');
    expect(within(section).getByText('Suggested')).toBeInTheDocument();
  });

  it('a suggestion alone saves nothing: the admin still chooses', async () => {
    const { user } = await open(svc({ name: 'Jellyfin' }));
    await user.click(screen.getByTestId('tile-edit-save'));
    await waitFor(() => expect(mUpdate).toHaveBeenCalled());
    expect(mPut).not.toHaveBeenCalled();
  });

  it('the slug matches too', async () => {
    const { section } = await open(svc({ name: 'TV', slug: 'sonarr' }));
    expect(typeSelect(section).value).toBe('sonarr');
  });

  it('a saved widget opens on its own type, with no Suggested tag', async () => {
    mGet.mockResolvedValue({ status: 'ok', config: { ...SAVED, kind: 'sonarr', fields: ['upcoming'] } });
    const { section } = await open(svc({ name: 'Jellyfin' }));
    expect(typeSelect(section).value).toBe('sonarr');
    expect(within(section).queryByText('Suggested')).not.toBeInTheDocument();
  });

  it('says so when the widget settings can’t be loaded', async () => {
    mKinds.mockResolvedValue(null);
    render(
      <TileEditModal service={svc()} categories={[]} theme="light" onClose={vi.fn()} onPatch={vi.fn()} onToast={vi.fn()} />,
    );
    expect(await screen.findByText('Couldn’t load the widget settings.')).toBeInTheDocument();
  });
});

describe('a new widget (UX §6.1)', () => {
  it('choosing a type reveals Address, the key, Show and Refresh', async () => {
    const { section, user } = await open();
    await user.selectOptions(typeSelect(section), 'jellyfin');
    const address = within(section).getByLabelText('Address');
    expect(address).toHaveAttribute('placeholder', 'https://media.example.com');
    expect(within(section).getByText(/Leave blank to use the tile’s link/)).toBeInTheDocument();
    expect(within(section).getByLabelText('API key')).toHaveValue('');
    expect(within(section).getByText('In Jellyfin: Dashboard → API Keys → +.')).toBeInTheDocument();
    expect((within(section).getByLabelText('Refresh') as HTMLSelectElement).value).toBe('60');
  });

  it('the defaults are ticked; at 3 the rest are disabled and "3 of 3" says why', async () => {
    const { section, user } = await open();
    await user.selectOptions(typeSelect(section), 'jellyfin');
    const chip = (name: string) => within(section).getByRole('checkbox', { name });
    expect(chip('playing')).toBeChecked();
    expect(chip('movies')).toBeChecked();
    expect(chip('shows')).toBeChecked();
    expect(chip('episodes')).toBeDisabled();
    expect(within(section).getByText('3 of 3')).toBeInTheDocument();
    expect(chip('episodes')).toHaveAccessibleDescription('3 of 3');
    await user.click(chip('movies'));
    expect(chip('episodes')).toBeEnabled();
    expect(within(section).getByText('2 of 3')).toBeInTheDocument();
  });

  it('Allow self-signed certificate appears only for an https address', async () => {
    const { section, user } = await open(svc({ url: 'http://media.home.arpa' }));
    await user.selectOptions(typeSelect(section), 'jellyfin');
    expect(within(section).queryByLabelText('Allow self-signed certificate')).not.toBeInTheDocument();
    await user.type(within(section).getByLabelText('Address'), 'https://jf.home.arpa');
    expect(within(section).getByLabelText('Allow self-signed certificate')).not.toBeChecked();
  });

  it('a blank address follows the tile link for the https check', async () => {
    const { section, user } = await open(svc({ url: 'https://media.example.com' }));
    await user.selectOptions(typeSelect(section), 'jellyfin');
    expect(within(section).getByLabelText('Allow self-signed certificate')).toBeInTheDocument();
  });

  it('Save sends the widget first, then the tile', async () => {
    const order: string[] = [];
    mPut.mockImplementation(async () => {
      order.push('widget');
      return { ok: true, config: SAVED };
    });
    mUpdate.mockImplementation(async (id) => {
      order.push('tile');
      return { ok: true, status: 200, service: { ...svc(), id } };
    });
    const { section, user, onClose } = await open();
    await user.selectOptions(typeSelect(section), 'jellyfin');
    await user.type(within(section).getByLabelText('API key'), 'k-123');
    await user.selectOptions(within(section).getByLabelText('Refresh'), '300');
    await user.click(screen.getByTestId('tile-edit-save'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(order).toEqual(['widget', 'tile']);
    expect(mPut).toHaveBeenCalledWith('S1', {
      kind: 'jellyfin',
      address: '',
      username: '',
      secret: 'k-123',
      fields: ['playing', 'movies', 'series'],
      intervalS: 300,
      insecureTls: false,
      enabled: true,
    });
  });

  it('a widget 422 keeps the modal open, shows the message, and saves no tile part', async () => {
    mPut.mockResolvedValue({ ok: false, status: 422, field: 'address', message: 'Use an http or https address.' });
    const { section, user, onClose } = await open();
    await user.selectOptions(typeSelect(section), 'jellyfin');
    await user.click(screen.getByTestId('tile-edit-save'));
    expect(await within(section).findByText('Use an http or https address.')).toBeInTheDocument();
    expect(mUpdate).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a widget save that fails outright also stops before the tile', async () => {
    mPut.mockResolvedValue({ ok: false, status: 500 });
    const { section, user } = await open();
    await user.selectOptions(typeSelect(section), 'jellyfin');
    await user.click(screen.getByTestId('tile-edit-save'));
    expect(await screen.findByText('Couldn’t save the widget. Try again.')).toBeInTheDocument();
    expect(mUpdate).not.toHaveBeenCalled();
  });

  it('an address that isn’t http(s) is caught before anything is sent', async () => {
    const { section, user } = await open();
    await user.selectOptions(typeSelect(section), 'jellyfin');
    await user.type(within(section).getByLabelText('Address'), 'ftp://jf.home.arpa');
    await user.click(screen.getByTestId('tile-edit-save'));
    expect(await within(section).findByText('Use an address that starts with http:// or https://.')).toBeInTheDocument();
    expect(mPut).not.toHaveBeenCalled();
    expect(mUpdate).not.toHaveBeenCalled();
  });

  it('a widget change makes the form dirty (Discard changes?)', async () => {
    const { section, user } = await open();
    await user.selectOptions(typeSelect(section), 'sonarr');
    await user.click(screen.getByTestId('tile-edit-cancel'));
    expect(screen.getByTestId('tile-discard-confirm')).toBeInTheDocument();
  });

  it('an untouched section is not dirty', async () => {
    mGet.mockResolvedValue({ status: 'ok', config: SAVED });
    const { user, onClose } = await open();
    await user.click(screen.getByTestId('tile-edit-cancel'));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('a saved key (AC-003, AC-023)', () => {
  beforeEach(() => mGet.mockResolvedValue({ status: 'ok', config: SAVED }));

  it('shows "Key saved" with Replace and Remove, and never a value', async () => {
    const { section } = await open();
    expect(within(section).getByText('Key saved')).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: 'Replace' })).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    expect(within(section).queryByLabelText('API key')).not.toBeInTheDocument();
  });

  it('Replace opens an empty field; Cancel there restores "Key saved"', async () => {
    const { section, user } = await open();
    await user.click(within(section).getByRole('button', { name: 'Replace' }));
    expect(within(section).getByLabelText('API key')).toHaveValue('');
    await user.click(within(section).getByRole('button', { name: 'Cancel' }));
    expect(within(section).getByText('Key saved')).toBeInTheDocument();
  });

  it('an untouched saved key is kept: Save sends no secret', async () => {
    const { section, user } = await open();
    await user.click(within(section).getByRole('checkbox', { name: 'shows' }));
    await user.click(screen.getByTestId('tile-edit-save'));
    await waitFor(() => expect(mPut).toHaveBeenCalled());
    expect(mPut.mock.calls[0][1]).not.toHaveProperty('secret');
    expect(mPut.mock.calls[0][1].fields).toEqual(['playing', 'movies', 'series']);
  });

  it('a replaced key is sent', async () => {
    const { section, user } = await open();
    await user.click(within(section).getByRole('button', { name: 'Replace' }));
    await user.type(within(section).getByLabelText('API key'), 'new-key');
    await user.click(screen.getByTestId('tile-edit-save'));
    await waitFor(() => expect(mPut).toHaveBeenCalled());
    expect(mPut.mock.calls[0][1].secret).toBe('new-key');
  });

  it('Remove clears the key on Save (secret: "")', async () => {
    const { section, user } = await open();
    await user.click(within(section).getByRole('button', { name: 'Remove' }));
    expect(within(section).getByText('The key is removed when you save.')).toBeInTheDocument();
    await user.click(screen.getByTestId('tile-edit-save'));
    await waitFor(() => expect(mPut).toHaveBeenCalled());
    expect(mPut.mock.calls[0][1].secret).toBe('');
  });

  it('changing the address host warns, and the key field opens empty', async () => {
    const { section, user } = await open();
    const address = within(section).getByLabelText('Address');
    await user.clear(address);
    await user.type(address, 'http://other.home.arpa:8096');
    expect(within(section).getByText('Changing this removes the saved key. Enter it again before you save.')).toBeInTheDocument();
    expect(within(section).getByLabelText('API key')).toHaveValue('');
    await user.click(screen.getByTestId('tile-edit-save'));
    await waitFor(() => expect(mPut).toHaveBeenCalled());
    expect(mPut.mock.calls[0][1]).not.toHaveProperty('secret');
  });

  it('a path-only change on the same host keeps the key', async () => {
    const { section, user } = await open();
    const address = within(section).getByLabelText('Address');
    await user.type(address, '/jellyfin');
    expect(within(section).queryByText(/removes the saved key/)).not.toBeInTheDocument();
    expect(within(section).getByText('Key saved')).toBeInTheDocument();
  });

  it('changing the type warns too', async () => {
    const { section, user } = await open();
    await user.selectOptions(typeSelect(section), 'sonarr');
    expect(within(section).getByText('Changing this removes the saved key. Enter it again before you save.')).toBeInTheDocument();
  });
});

describe('server key and saved-key problems (AC-004, AC-005)', () => {
  it('no server key: the key field is disabled, with how to turn it on', async () => {
    mKinds.mockResolvedValue({ ...KINDS, secretKeySet: false });
    const { section, user } = await open();
    await user.selectOptions(typeSelect(section), 'jellyfin');
    expect(within(section).getByLabelText('API key')).toBeDisabled();
    expect(within(section).getByText('To save keys, set HOMEPAD_SECRET_KEY on the server.')).toBeInTheDocument();
    expect(within(section).getByRole('link', { name: 'How ›' })).toHaveAttribute(
      'href',
      'https://github.com/finish06/homepad/blob/main/docs/widgets.md',
    );
    await user.click(screen.getByTestId('tile-edit-save'));
    await waitFor(() => expect(mPut).toHaveBeenCalled());
    expect(mPut.mock.calls[0][1]).not.toHaveProperty('secret');
  });

  it('an unreadable saved key: the editor asks for it again', async () => {
    mGet.mockResolvedValue({
      status: 'ok',
      config: { ...SAVED, state: 'error', error: 'secret_unreadable', lastCheckAt: new Date().toISOString() },
    });
    const { section } = await open();
    expect(within(section).getByText(/Homepad can’t read the saved key\. Enter it again\./)).toBeInTheDocument();
    expect(within(section).getByLabelText('API key')).toHaveValue('');
    expect(within(section).queryByText('Key saved')).not.toBeInTheDocument();
  });

  it('the last error is a plain line under the heading, with its age', async () => {
    mGet.mockResolvedValue({
      status: 'ok',
      config: {
        ...SAVED,
        state: 'stale',
        error: 'auth',
        lastCheckAt: new Date(Date.now() - 3 * 60_000 - 1000).toISOString(),
      },
    });
    const { section } = await open();
    expect(within(section).getByTestId('widget-last-error')).toHaveTextContent(
      'Last check, 3 min ago: Jellyfin didn’t accept the API key.',
    );
  });
});

describe('Test connection (AC-021, UX §6.4)', () => {
  it('tests the unsaved form, and shows the values as the tile will', async () => {
    let resolve!: (v: Awaited<ReturnType<typeof testWidget>>) => void;
    mTest.mockReturnValue(new Promise((r) => (resolve = r)));
    const { section, user } = await open();
    await user.selectOptions(typeSelect(section), 'jellyfin');
    await user.type(within(section).getByLabelText('API key'), 'k-1');
    const button = within(section).getByRole('button', { name: 'Test connection' });
    await user.click(button);
    expect(within(section).getByRole('button', { name: 'Testing…' })).toBeDisabled();
    expect(mTest).toHaveBeenCalledWith('S1', expect.objectContaining({ kind: 'jellyfin', secret: 'k-1' }));
    resolve({
      ok: true,
      version: '10.10.3',
      fields: [
        { key: 'playing', label: 'playing', unit: 'count', value: 0 },
        { key: 'movies', label: 'movies', unit: 'count', value: 1204 },
      ],
    });
    const result = await within(section).findByTestId('widget-test-result');
    expect(result).toHaveTextContent('✓ Connected to Jellyfin 10.10.3.');
    expect(result).toHaveTextContent('0 playing · 1,204 movies');
    expect(result.closest('[aria-live="polite"]')).not.toBeNull();
  });

  it('a blank key field means "use the saved key" (no secret sent)', async () => {
    mGet.mockResolvedValue({ status: 'ok', config: SAVED });
    mTest.mockResolvedValue({ ok: true, version: '', fields: [] });
    const { section, user } = await open();
    await user.click(within(section).getByRole('button', { name: 'Test connection' }));
    await waitFor(() => expect(mTest).toHaveBeenCalled());
    expect(mTest.mock.calls[0][1]).not.toHaveProperty('secret');
    expect(await within(section).findByTestId('widget-test-result')).toHaveTextContent('✓ Connected to Jellyfin.');
  });

  it.each([
    ['auth', '✕ Jellyfin didn’t accept the API key.'],
    ['unreachable', '✕ Can’t reach Jellyfin at this address.'],
    ['timeout', '✕ Jellyfin took too long to answer.'],
    ['tls', '✕ Jellyfin’s certificate isn’t trusted. If it uses a self-signed certificate, tick Allow self-signed certificate.'],
    ['redirect', '✕ That address sends Homepad somewhere else, often a login page. Use the app’s internal address.'],
    ['blocked_address', '✕ Homepad doesn’t fetch from this address.'],
    ['bad_response', '✕ Jellyfin answered, but not in a way Homepad understands. Check that the address points at Jellyfin.'],
    ['unsupported_version', '✕ Homepad needs Pi-hole 6 or newer.'],
    ['secret_unreadable', '✕ Homepad can’t read the saved key. Enter it again.'],
    ['no_secret_key', '✕ To save keys, set HOMEPAD_SECRET_KEY on the server.'],
    ['rate_limited', 'Wait a moment, then test again.'],
    ['request_failed', '✕ Couldn’t run the test. Try again.'],
    ['something_new', '✕ Couldn’t run the test. Try again.'],
  ])('%s → fixed copy, never the address or a status number', async (code, copy) => {
    mTest.mockResolvedValue({ ok: false, error: code });
    const { section, user } = await open();
    await user.selectOptions(typeSelect(section), 'jellyfin');
    await user.click(within(section).getByRole('button', { name: 'Test connection' }));
    const result = await within(section).findByTestId('widget-test-result');
    expect(result).toHaveTextContent(copy);
    expect(result.textContent).not.toMatch(/https?:|\d{3}/);
  });

  it('a 422 from the test shows the server’s field message', async () => {
    mTest.mockResolvedValue({ ok: false, error: 'invalid', message: 'Pick up to 3.' });
    const { section, user } = await open();
    await user.selectOptions(typeSelect(section), 'jellyfin');
    await user.click(within(section).getByRole('button', { name: 'Test connection' }));
    expect(await within(section).findByTestId('widget-test-result')).toHaveTextContent('✕ Pick up to 3.');
  });
});

describe('Remove widget (UX §6.1)', () => {
  beforeEach(() => mGet.mockResolvedValue({ status: 'ok', config: SAVED }));

  it('asks first, then deletes on Save and clears the tile line', async () => {
    const { section, user, onPatch } = await open();
    await user.click(within(section).getByRole('button', { name: 'Remove widget' }));
    expect(within(section).getByText('Remove the Jellyfin widget? Its saved key is deleted.')).toBeInTheDocument();
    await user.click(within(section).getByRole('button', { name: 'Remove' }));
    expect(within(section).getByText('The widget is removed when you save.')).toBeInTheDocument();
    await user.click(screen.getByTestId('tile-edit-save'));
    await waitFor(() => expect(mDelete).toHaveBeenCalledWith('S1'));
    expect(mPut).not.toHaveBeenCalled();
    await waitFor(() => expect(onPatch).toHaveBeenCalledWith(expect.objectContaining({ widget: undefined })));
  });

  it('Keep backs out of the confirm', async () => {
    const { section, user } = await open();
    await user.click(within(section).getByRole('button', { name: 'Remove widget' }));
    await user.click(within(section).getByRole('button', { name: 'Keep' }));
    expect(within(section).getByRole('button', { name: 'Remove widget' })).toBeInTheDocument();
  });

  it('Undo brings it back before Save', async () => {
    const { section, user } = await open();
    await user.click(within(section).getByRole('button', { name: 'Remove widget' }));
    await user.click(within(section).getByRole('button', { name: 'Remove' }));
    await user.click(within(section).getByRole('button', { name: 'Undo' }));
    expect(typeSelect(section).value).toBe('jellyfin');
  });

  it('a failed delete stops before the tile', async () => {
    mDelete.mockResolvedValue(false);
    const { section, user } = await open();
    await user.click(within(section).getByRole('button', { name: 'Remove widget' }));
    await user.click(within(section).getByRole('button', { name: 'Remove' }));
    await user.click(screen.getByTestId('tile-edit-save'));
    expect(await screen.findByText('Couldn’t save the widget. Try again.')).toBeInTheDocument();
    expect(mUpdate).not.toHaveBeenCalled();
  });

  it('choosing None on a saved widget also removes it', async () => {
    const { section, user } = await open();
    await user.selectOptions(typeSelect(section), '');
    await user.click(screen.getByTestId('tile-edit-save'));
    await waitFor(() => expect(mDelete).toHaveBeenCalledWith('S1'));
  });
});
