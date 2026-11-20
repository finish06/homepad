import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import HomepageImportModal from './HomepageImportModal';
import { applyHomepageImport, previewHomepageImport, TransferError, type Plan } from './transferApi';
import { asResult, emptyPlan, importPlan, statusOnlyPlan } from '../../test/transferPlans';

expect.extend(toHaveNoViolations);

// SPEC-backup-import UX §4 (TASK-305) — Import from Homepage: Add files →
// Preview → Done. AC-019 (paste or upload, three files), AC-028 (parse errors
// next to the input, with the line), AC-023 (the Gatus snippet).

vi.mock('./transferApi', async (orig) => {
  const real = await orig<typeof import('./transferApi')>();
  return { ...real, previewHomepageImport: vi.fn(), applyHomepageImport: vi.fn() };
});

const SERVICES = `- Media:
    - Sonarr:
        icon: sonarr.png
        href: http://sonarr.home.arpa/
        siteMonitor: http://sonarr.home.arpa/
- Infra:
    - Router:
        href: http://192.0.2.1
        ping: 192.0.2.1
`;

function setup() {
  const onClose = vi.fn();
  const onApplied = vi.fn();
  render(<HomepageImportModal onClose={onClose} onApplied={onApplied} />);
  return { onClose, onApplied };
}

const servicesBox = () => screen.getByRole('textbox', { name: 'services.yaml' });

async function toPreview(plan: Plan) {
  vi.mocked(previewHomepageImport).mockResolvedValue(plan);
  fireEvent.change(servicesBox(), { target: { value: SERVICES } });
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
  await screen.findByRole('heading', { name: 'Import from Homepage, step 2 of 3' });
}

let writeText: ReturnType<typeof vi.fn>;
beforeEach(() => {
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('Homepage — step 1, Add files (UX §4.1, AC-019)', () => {
  it('names the dialog with its step, focuses the heading, and needs services.yaml', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Import from Homepage, step 1 of 3' })).toHaveFocus();
    expect(screen.getByText('(required)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled();
    fireEvent.change(servicesBox(), { target: { value: SERVICES } });
    expect(screen.getByRole('button', { name: 'Preview' })).toBeEnabled();
  });

  it('says what won’t come across, in two short sentences', () => {
    setup();
    expect(
      screen.getByText(
        "Apps found by Docker labels or Kubernetes aren't in these files, so they won't come across. Your current apps stay as they are.",
      ),
    ).toBeInTheDocument();
  });

  it('the optional files start collapsed and open on demand', () => {
    setup();
    const bm = screen.getByRole('button', { name: /bookmarks\.yaml/ });
    expect(bm).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('textbox', { name: 'bookmarks.yaml' })).toBeNull();
    fireEvent.click(bm);
    expect(bm).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('textbox', { name: 'bookmarks.yaml' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /settings\.yaml/ })).toHaveTextContent('(optional, for section order)');
  });

  it('sends all three texts to the preview', async () => {
    vi.mocked(previewHomepageImport).mockResolvedValue(importPlan());
    setup();
    fireEvent.change(servicesBox(), { target: { value: SERVICES } });
    fireEvent.click(screen.getByRole('button', { name: /bookmarks\.yaml/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'bookmarks.yaml' }), { target: { value: '- Links: []' } });
    fireEvent.click(screen.getByRole('button', { name: /settings\.yaml/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'settings.yaml' }), { target: { value: 'target: _self' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await screen.findByRole('heading', { name: /step 2 of 3/ });
    expect(previewHomepageImport).toHaveBeenCalledWith({ services: SERVICES, bookmarks: '- Links: []', settings: 'target: _self' });
  });

  it('Upload reads a .yaml file and shows its name and size', async () => {
    vi.mocked(previewHomepageImport).mockResolvedValue(importPlan());
    setup();
    const group = screen.getByRole('group', { name: 'services.yaml input' });
    fireEvent.click(within(group).getByRole('button', { name: 'Upload' }));
    expect(within(group).getByRole('button', { name: 'Upload' })).toHaveAttribute('aria-pressed', 'true');
    const file = new File([SERVICES], 'services.yaml', { type: 'application/yaml' });
    fireEvent.change(screen.getByLabelText('Choose services.yaml'), { target: { files: [file] } });
    expect(await screen.findByTestId('upload-meta-services')).toHaveTextContent('services.yaml');
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await waitFor(() => expect(previewHomepageImport).toHaveBeenCalledWith({ services: SERVICES }));
  });

  it('a YAML error shows under its own textarea, with the line selected (AC-028, TC-010)', async () => {
    vi.mocked(previewHomepageImport).mockRejectedValue(
      new TransferError('not_homepage_services', 422, 'not a list of groups', { file: 'services', line: 2 }),
    );
    setup();
    fireEvent.change(servicesBox(), { target: { value: 'services:\n  web:\n    image: nginx\n' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    const err = await screen.findByText(
      "This doesn't look like a Homepage services.yaml. It should be a list of groups. (line 2)",
    );
    const box = servicesBox() as HTMLTextAreaElement;
    expect(box).toHaveAttribute('aria-invalid', 'true');
    expect(box.getAttribute('aria-describedby')).toBe(err.id);
    expect(box).toHaveFocus();
    expect(box.value.slice(box.selectionStart, box.selectionEnd)).toBe('  web:');
    // TC-010 — Preview stays enabled for another try.
    expect(screen.getByRole('button', { name: 'Preview' })).toBeEnabled();
  });

  it('an error in a collapsed optional file opens it and shows there', async () => {
    vi.mocked(previewHomepageImport).mockRejectedValue(
      // The API's real shape: a full sentence, and the parser's words in detail.
      new TransferError('yaml_syntax', 400, "There's a problem on line 1: did not find expected key.", {
        file: 'bookmarks',
        line: 1,
        detail: 'did not find expected key',
      }),
    );
    setup();
    fireEvent.change(servicesBox(), { target: { value: SERVICES } });
    fireEvent.click(screen.getByRole('button', { name: /bookmarks\.yaml/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'bookmarks.yaml' }), { target: { value: '- [' } });
    fireEvent.click(screen.getByRole('button', { name: /bookmarks\.yaml/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(await screen.findByText("There's a problem on line 1: did not find expected key.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /bookmarks\.yaml/ })).toHaveAttribute('aria-expanded', 'true');
  });

  it('an error with no file shows above the buttons', async () => {
    vi.mocked(previewHomepageImport).mockRejectedValue(new TransferError('too_large', 413, 'too big'));
    setup();
    fireEvent.change(servicesBox(), { target: { value: SERVICES } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This file is too big.');
  });

  it('closing with text entered asks "Discard this import?"', () => {
    const { onClose } = setup();
    fireEvent.change(servicesBox(), { target: { value: SERVICES } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    const strip = screen.getByRole('group', { name: 'Discard this import?' });
    fireEvent.click(within(strip).getByRole('button', { name: 'Discard' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('Escape with nothing entered closes at once', () => {
    const { onClose } = setup();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('Homepage — step 2, Preview (UX §4.2)', () => {
  it('leads with the summary and groups apps by section in order', async () => {
    setup();
    await toPreview(importPlan());
    expect(screen.getByTestId('plan-summary')).toHaveTextContent('Add 3 sections · Add 4 apps · 1 already here · 1 skipped');
    const toggles = screen.getAllByTestId('plan-group-toggle').map((b) => b.textContent);
    expect(toggles.slice(0, 3)).toEqual(['Media (new section)', 'Infra (new section)', 'Infra / Core (new section)']);
    expect(screen.getByTestId('plan-row-app-Sonarr')).toHaveTextContent('Widget not imported.');
    expect(screen.getByTestId('plan-row-app-Plex')).toHaveTextContent('Shows initials (mdi-plex).');
    expect(screen.getByTestId('plan-row-app-Jellyfin')).toHaveTextContent('Already here');
    expect(screen.getByTestId('plan-row-app-Jellyfin')).toHaveTextContent('Already on your dashboard.');
  });

  it('shows the icon thumbnail, or the initials badge when there is no icon', async () => {
    setup();
    await toPreview(importPlan());
    const sonarr = within(screen.getByTestId('plan-row-app-Sonarr')).getByRole('presentation', { hidden: true });
    expect(sonarr).toHaveAttribute('src', 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/sonarr.png');
    const plex = within(screen.getByTestId('plan-row-app-Plex')).getByRole('presentation', { hidden: true });
    expect(plex.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
  });

  it('collects skips with their reason in Skipped', async () => {
    setup();
    await toPreview(importPlan());
    const skipped = screen.getByRole('button', { name: /Skipped \(1\)/ });
    expect(skipped).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('plan-row-app-Grafana')).toHaveTextContent('Link uses a Homepage variable. Add it by hand.');
  });

  it('shows the Status checks block with Copy and Download (AC-023)', async () => {
    setup();
    await toPreview(importPlan());
    expect(screen.getByText(/2 apps had siteMonitor or ping\./)).toBeInTheDocument();
    const box = screen.getByRole('textbox', { name: 'Gatus endpoints' }) as HTMLTextAreaElement;
    expect(box).toHaveAttribute('readonly');
    expect(box.value).toContain('name: Sonarr');
    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });
    expect(writeText).toHaveBeenCalledWith(importPlan().gatusSnippet);
    expect(screen.getByTestId('copy-status')).toHaveTextContent('Copied');
    expect(screen.getByTestId('copy-status')).toHaveAttribute('aria-live', 'polite');
    act(() => vi.advanceTimersByTime(2100));
    expect(screen.getByTestId('copy-status')).toHaveTextContent('');
    vi.useRealTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Download gatus-endpoints.yaml' }));
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it('lists what was not imported, in plain words', async () => {
    setup();
    await toPreview(importPlan());
    expect(screen.getByTestId('not-imported')).toHaveTextContent('Not imported: widgets, Docker stats, title, theme. (5 settings)');
  });

  it('the primary button names the count', async () => {
    setup();
    await toPreview(importPlan());
    expect(screen.getByRole('button', { name: 'Import 4 apps' })).toBeEnabled();
    expect(screen.getByText('Nothing changes until you select Import.')).toBeInTheDocument();
  });

  it('a re-import after a Gatus change offers to turn on status (TC-009)', async () => {
    setup();
    await toPreview(statusOnlyPlan());
    expect(screen.getByTestId('plan-row-app-Sonarr')).toHaveTextContent('Status turned on.');
    expect(screen.getByRole('button', { name: 'Turn on status for 2 apps' })).toBeEnabled();
  });

  it('nothing new: one message and Close; the snippet still shows', async () => {
    const p = emptyPlan('import', { gatusSnippet: 'endpoints:\n  - name: Router\n' });
    p.summary.unchanged = 4;
    const { onClose } = setup();
    await toPreview(p);
    expect(screen.getByText('Everything here is already on your dashboard.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Gatus endpoints' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Import/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('Back keeps the text', async () => {
    setup();
    await toPreview(importPlan());
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(servicesBox()).toHaveValue(SERVICES);
  });
});

describe('Homepage — Done (UX §4.3)', () => {
  it('imports with the hash and reports where the apps went', async () => {
    vi.mocked(applyHomepageImport).mockResolvedValue(asResult(importPlan()));
    const { onApplied, onClose } = setup();
    await toPreview(importPlan());
    fireEvent.click(screen.getByRole('button', { name: 'Import 4 apps' }));
    expect(await screen.findByRole('heading', { name: 'Import from Homepage, step 3 of 3' })).toHaveFocus();
    expect(applyHomepageImport).toHaveBeenCalledWith({ services: SERVICES }, 'hash-import-1');
    expect(screen.getByText('Imported 4 apps into 3 new sections.')).toBeInTheDocument();
    expect(screen.getByText(/They're at the end of your dashboard\./)).toHaveTextContent(
      "They're at the end of your dashboard. Other people see them A–Z until they arrange their own.",
    );
    expect(screen.getByText('Next: add the status checks to Gatus.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy snippet' }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(onApplied).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('leaves out the A–Z line when nobody else is here, and the Next line with no snippet', async () => {
    const p = importPlan({ otherAccounts: 0, gatusSnippet: undefined });
    vi.mocked(applyHomepageImport).mockResolvedValue(asResult(p));
    setup();
    await toPreview(p);
    fireEvent.click(screen.getByRole('button', { name: 'Import 4 apps' }));
    await screen.findByText('Imported 4 apps into 3 new sections.');
    expect(screen.queryByText(/A–Z/)).toBeNull();
    expect(screen.queryByText(/Next:/)).toBeNull();
  });

  it('a status-only import reports the status change', async () => {
    vi.mocked(applyHomepageImport).mockResolvedValue(asResult(statusOnlyPlan()));
    setup();
    await toPreview(statusOnlyPlan());
    fireEvent.click(screen.getByRole('button', { name: 'Turn on status for 2 apps' }));
    expect(await screen.findByText('Turned on status for 2 apps.')).toBeInTheDocument();
  });

  it('a stale preview (409) reloads the new plan', async () => {
    vi.mocked(applyHomepageImport).mockRejectedValueOnce(
      new TransferError('plan_changed', 409, 'changed', { plan: importPlan({ planHash: 'fresh' }) }),
    );
    setup();
    await toPreview(importPlan());
    fireEvent.click(screen.getByRole('button', { name: 'Import 4 apps' }));
    expect(await screen.findByText("Your dashboard changed since the preview. Here's the new one.")).toBeInTheDocument();
    vi.mocked(applyHomepageImport).mockResolvedValueOnce(asResult(importPlan()));
    fireEvent.click(screen.getByRole('button', { name: 'Import 4 apps' }));
    await screen.findByText('Imported 4 apps into 3 new sections.');
    expect(vi.mocked(applyHomepageImport).mock.calls[1][1]).toBe('fresh');
  });

  it('a failure says nothing was changed', async () => {
    vi.mocked(applyHomepageImport).mockRejectedValue(new TransferError('failed', 500, 'boom'));
    setup();
    await toPreview(importPlan());
    fireEvent.click(screen.getByRole('button', { name: 'Import 4 apps' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Import didn't finish. Nothing was changed.");
  });

  it('has no axe violations on every step', async () => {
    vi.mocked(applyHomepageImport).mockResolvedValue(asResult(importPlan()));
    setup();
    expect(await axe(document.body)).toHaveNoViolations();
    await toPreview(importPlan());
    expect(await axe(document.body)).toHaveNoViolations();
    fireEvent.click(screen.getByRole('button', { name: 'Import 4 apps' }));
    await screen.findByText('Imported 4 apps into 3 new sections.');
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
