import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitForElementToBeRemoved } from '@testing-library/react';
import App from './App';
import { authConfig, me, setThemePref, type User } from './api';

// SPEC-app-grid §2 — App Grid REPLACES the v14 floating-panel Catalog layout.
// Issue #223 (QA): the swap was deferred — App.tsx still rendered <Catalog>. This
// is the RED gate for the swap: the authenticated dashboard must mount <AppGrid>
// and must NOT mount <Catalog>. Named for the observed symptom (which layout is
// on the page), not the mechanism.

vi.mock('./AppGrid', () => ({
  default: (props: { isAdmin?: boolean }) => (
    <div data-testid="app-grid-stub" data-admin={String(!!props.isAdmin)} />
  ),
}));

// If Catalog is still imported/rendered its stub would appear — assert it does not.
vi.mock('./Catalog', () => ({
  default: () => <div data-testid="catalog-stub" />,
}));

vi.mock('./api', () => ({
  authConfig: vi.fn(),
  me: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  setThemePref: vi.fn(),
  services: vi.fn(() => Promise.resolve([])),
  servicesWithStatus: vi.fn(() => Promise.resolve({ status: 200, services: [] })),
}));

const ADMIN: User = { id: 'a1', email: 'lilo@ohana.io', role: 'admin', themePref: 'system' };
const USER: User = { id: 'u1', email: 'nani@ohana.io', role: 'user', themePref: 'system' };

beforeEach(() => {
  vi.mocked(authConfig).mockResolvedValue({ oidcEnabled: false });
  vi.mocked(setThemePref).mockResolvedValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
  document.documentElement.classList.remove('dark');
});

async function dropLoading() {
  await waitForElementToBeRemoved(() => screen.queryByText(/loading/i));
}

describe('SPEC-app-grid §2 — App renders AppGrid, not Catalog (#223)', () => {
  it('mounts AppGrid for a signed-in user', async () => {
    vi.mocked(me).mockResolvedValue(USER);
    render(<App />);
    await dropLoading();
    expect(await screen.findByTestId('app-grid-stub')).toBeInTheDocument();
    expect(screen.queryByTestId('catalog-stub')).not.toBeInTheDocument();
  });

  it('passes isAdmin through to AppGrid', async () => {
    vi.mocked(me).mockResolvedValue(ADMIN);
    render(<App />);
    await dropLoading();
    expect(await screen.findByTestId('app-grid-stub')).toHaveAttribute('data-admin', 'true');
  });
});
