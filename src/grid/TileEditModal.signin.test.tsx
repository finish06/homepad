import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import TileEditModal from './TileEditModal';
import { updateService, type Service } from '../api';

// SPEC-iframe-sandbox-optin AC-005, AC-009 and UX §2 — the tile editor's
// "Let this app keep its sign-in" switch. It shows only for Inline overlay,
// greys out (aria-disabled, still focusable) for an address on this Homepad's
// own origin or one that can't be read, and Save sends iframeSameOrigin only
// when it changed and the switch was usable (UX I-2).

vi.mock('../api', () => ({
  updateService: vi.fn(),
  uploadIcon: vi.fn(),
  deleteIcon: vi.fn(),
  fetchIcon: vi.fn(),
}));

expect.extend(toHaveNoViolations);

const mUpdate = vi.mocked(updateService);

afterEach(() => {
  vi.clearAllMocks();
});

const LABEL = 'Let this app keep its sign-in';
const HELP = 'Turn this on if the app asks you to sign in every time, or stays blank. Only for apps you trust.';
const SAME = "Not available for pages on this Homepad's own address.";
const UNREAD = "Enter the app's full address first, like https://app.example.";

function svc(overrides: Partial<Service> = {}): Service {
  return {
    id: 'S1',
    slug: 'grafana',
    name: 'Grafana',
    url: 'https://grafana.home.example',
    description: '',
    icon: '',
    status: 'UP',
    favorite: false,
    iconLight: false,
    iconDark: false,
    categoryId: null,
    gatus_key: '',
    clickAction: 'iframe',
    ...overrides,
  };
}

function renderModal(service: Service = svc()) {
  const onClose = vi.fn();
  const onPatch = vi.fn();
  const onToast = vi.fn();
  render(
    <TileEditModal service={service} categories={[]} theme="light" onClose={onClose} onPatch={onPatch} onToast={onToast} />,
  );
  return { onClose, onPatch, onToast };
}

const theSwitch = () => screen.getByRole('switch', { name: LABEL });
const querySwitch = () => screen.queryByRole('switch', { name: LABEL });
const segment = (label: string) =>
  within(screen.getByRole('group', { name: 'Click action' })).getByRole('button', { name: label });
const setUrl = (value: string) => fireEvent.change(screen.getByTestId('tile-field-url'), { target: { value } });
const lastPatch = () => mUpdate.mock.calls[mUpdate.mock.calls.length - 1][1];

describe('SPEC-iframe-sandbox-optin — the switch (AC-005, UX §2)', () => {
  it('shows only for Inline overlay', async () => {
    const u = userEvent.setup();
    renderModal(svc({ clickAction: 'new_tab' }));
    expect(querySwitch()).toBeNull();
    await u.click(segment('Same tab'));
    expect(querySwitch()).toBeNull();
    await u.click(segment('Inline overlay'));
    expect(theSwitch()).toBeInTheDocument();
  });

  it('shows the saved value with the help line, usable, for another origin', () => {
    renderModal(svc({ iframeSameOrigin: true }));
    const sw = theSwitch();
    expect(sw).toHaveAttribute('aria-checked', 'true');
    expect(sw).not.toHaveAttribute('aria-disabled', 'true');
    expect(sw).toHaveAccessibleDescription(HELP);
    expect(sw.tagName).toBe('BUTTON');
    expect(sw).toHaveAttribute('type', 'button');
  });

  it('a new overlay app (no saved value) starts off', () => {
    renderModal(svc({ iframeSameOrigin: undefined }));
    expect(theSwitch()).toHaveAttribute('aria-checked', 'false');
  });

  it('a click toggles it', async () => {
    const u = userEvent.setup();
    renderModal();
    await u.click(theSwitch());
    expect(theSwitch()).toHaveAttribute('aria-checked', 'true');
    await u.click(theSwitch());
    expect(theSwitch()).toHaveAttribute('aria-checked', 'false');
  });

  it('Space toggles it; Enter does nothing', async () => {
    const u = userEvent.setup();
    renderModal();
    theSwitch().focus();
    await u.keyboard(' ');
    expect(theSwitch()).toHaveAttribute('aria-checked', 'true');
    await u.keyboard('{Enter}');
    expect(theSwitch()).toHaveAttribute('aria-checked', 'true');
    expect(mUpdate).not.toHaveBeenCalled();
  });

  it("greys out for an address on this Homepad's own origin, still focusable", async () => {
    const u = userEvent.setup();
    renderModal(svc({ url: `${window.location.origin}/grafana/`, iframeSameOrigin: true }));
    const sw = theSwitch();
    expect(sw).toHaveAttribute('aria-disabled', 'true');
    expect(sw).not.toBeDisabled();
    expect(sw).toHaveAttribute('aria-checked', 'false');
    expect(sw).toHaveAccessibleDescription(SAME);
    sw.focus();
    expect(sw).toHaveFocus();
    await u.click(sw);
    await u.keyboard(' ');
    expect(theSwitch()).toHaveAttribute('aria-checked', 'false');
  });

  it("greys out with the full-address reason when the address can't be read", () => {
    renderModal(svc({ url: 'grafana', iframeSameOrigin: true }));
    expect(theSwitch()).toHaveAttribute('aria-disabled', 'true');
    expect(theSwitch()).toHaveAttribute('aria-checked', 'false');
    expect(theSwitch()).toHaveAccessibleDescription(UNREAD);
  });

  it('checks the address live as it is typed, and restores the saved value', () => {
    renderModal(svc({ iframeSameOrigin: true }));
    setUrl(`${window.location.origin}/x`);
    expect(theSwitch()).toHaveAttribute('aria-disabled', 'true');
    expect(theSwitch()).toHaveAccessibleDescription(SAME);
    setUrl('https://graf');
    expect(theSwitch()).not.toHaveAttribute('aria-disabled', 'true');
    expect(theSwitch()).toHaveAttribute('aria-checked', 'true');
    setUrl('graf');
    expect(theSwitch()).toHaveAccessibleDescription(UNREAD);
    setUrl('https://grafana.home.example');
    expect(theSwitch()).toHaveAttribute('aria-checked', 'true');
    expect(theSwitch()).toHaveAccessibleDescription(HELP);
  });

  it('keeps its value when another click action is chosen and back', async () => {
    const u = userEvent.setup();
    renderModal();
    await u.click(theSwitch());
    await u.click(segment('New tab'));
    expect(querySwitch()).toBeNull();
    await u.click(segment('Inline overlay'));
    expect(theSwitch()).toHaveAttribute('aria-checked', 'true');
  });

  it('announces the help or reason politely, under the hint, and comes right after the segments in tab order', async () => {
    const u = userEvent.setup();
    renderModal();
    const hint = screen.getByTestId('tile-click-action-hint');
    const line = screen.getByTestId('tile-signin-help');
    expect(line).toHaveAttribute('aria-live', 'polite');
    expect(line).toHaveTextContent(HELP);
    expect(hint.parentElement).toContainElement(line);
    expect(hint.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    setUrl('g');
    expect(screen.getByTestId('tile-signin-help')).toHaveTextContent(UNREAD);
    setUrl('https://grafana.home.example');
    segment('Inline overlay').focus();
    await u.tab();
    expect(theSwitch()).toHaveFocus();
  });

  it('never says sandbox, origin, cookies or allow-same-origin', async () => {
    const u = userEvent.setup();
    renderModal();
    const text = () => screen.getByTestId('tile-edit-modal').textContent ?? '';
    for (const url of ['https://grafana.home.example', `${window.location.origin}/g`, 'g']) {
      setUrl(url);
      expect(text()).not.toMatch(/sandbox|origin|cookie|allow-same-origin/i);
    }
    await u.click(segment('New tab'));
  });

  // Scoped to the Click action field: the modal's own <form role="dialog">
  // trips axe's aria-allowed-role, which predates this switch.
  it('has no axe violations, usable and greyed out', async () => {
    renderModal();
    const field = () => screen.getByTestId('tile-signin-help').parentElement!;
    expect(await axe(field())).toHaveNoViolations();
    setUrl(`${window.location.origin}/g`);
    expect(await axe(field())).toHaveNoViolations();
  });
});

describe('SPEC-iframe-sandbox-optin — Save (AC-009, UX §2.4, I-2)', () => {
  it('sends iframeSameOrigin when it changed, and reflects the saved value', async () => {
    const u = userEvent.setup();
    mUpdate.mockResolvedValue({ ok: true, status: 200, service: svc({ iframeSameOrigin: true }) });
    const { onPatch } = renderModal();
    await u.click(theSwitch());
    await u.click(screen.getByTestId('tile-edit-save'));
    expect(lastPatch()).toEqual({ iframeSameOrigin: true });
    expect(onPatch).toHaveBeenCalledWith(expect.objectContaining({ iframeSameOrigin: true }));
  });

  it('reflects what the server saved, not the local switch', async () => {
    const u = userEvent.setup();
    mUpdate.mockResolvedValue({ ok: true, status: 200, service: svc({ iframeSameOrigin: false }) });
    const { onPatch } = renderModal();
    await u.click(theSwitch());
    await u.click(screen.getByTestId('tile-edit-save'));
    expect(onPatch).toHaveBeenCalledWith(expect.objectContaining({ iframeSameOrigin: false }));
  });

  it('sends nothing when it is back at the saved value', async () => {
    const u = userEvent.setup();
    mUpdate.mockResolvedValue({ ok: true, status: 200, service: svc() });
    renderModal(svc({ iframeSameOrigin: true }));
    await u.click(theSwitch());
    await u.click(theSwitch());
    await u.type(screen.getByTestId('tile-field-title'), '!');
    await u.click(screen.getByTestId('tile-edit-save'));
    expect(lastPatch()).not.toHaveProperty('iframeSameOrigin');
  });

  it('turns a new overlay app on together with its click action', async () => {
    const u = userEvent.setup();
    mUpdate.mockResolvedValue({ ok: true, status: 200, service: svc({ iframeSameOrigin: true }) });
    renderModal(svc({ clickAction: 'new_tab' }));
    await u.click(segment('Inline overlay'));
    await u.click(theSwitch());
    await u.click(screen.getByTestId('tile-edit-save'));
    expect(lastPatch()).toEqual({ clickAction: 'iframe', iframeSameOrigin: true });
  });

  it('greyed out sends nothing, even for an upgraded app saved as on (I-2)', async () => {
    const u = userEvent.setup();
    mUpdate.mockResolvedValue({ ok: true, status: 200, service: svc() });
    renderModal(svc({ url: `${window.location.origin}/grafana/`, iframeSameOrigin: true }));
    await u.type(screen.getByTestId('tile-field-title'), '!');
    await u.click(screen.getByTestId('tile-edit-save'));
    expect(lastPatch()).not.toHaveProperty('iframeSameOrigin');
  });

  it('a change made before the address greyed it out is not sent', async () => {
    const u = userEvent.setup();
    mUpdate.mockResolvedValue({ ok: true, status: 200, service: svc() });
    renderModal();
    await u.click(theSwitch());
    setUrl(`${window.location.origin}/grafana/`);
    await u.click(screen.getByTestId('tile-edit-save'));
    expect(lastPatch()).not.toHaveProperty('iframeSameOrigin');
    expect(lastPatch()).toHaveProperty('url');
  });

  it('a change is not sent when another click action is chosen', async () => {
    const u = userEvent.setup();
    mUpdate.mockResolvedValue({ ok: true, status: 200, service: svc() });
    renderModal();
    await u.click(theSwitch());
    await u.click(segment('Same tab'));
    await u.click(screen.getByTestId('tile-edit-save'));
    expect(lastPatch()).toEqual({ clickAction: 'same_tab' });
  });

  it('toggling makes the form dirty: closing asks "Discard changes?"', async () => {
    const u = userEvent.setup();
    const { onClose } = renderModal();
    await u.click(theSwitch());
    await u.click(screen.getByTestId('tile-edit-cancel'));
    expect(screen.getByTestId('tile-discard-confirm')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
