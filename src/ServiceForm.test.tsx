import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ServiceForm from './ServiceForm';
import type { Service } from './api';

vi.mock('./api', () => ({
  createService: vi.fn(),
  updateService: vi.fn(),
}));

const noop = () => {};

function renderForm(service?: Service) {
  return render(<ServiceForm service={service} onClose={noop} onSaved={noop} />);
}

afterEach(() => {
  vi.clearAllMocks();
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
    renderForm({
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
    });
    const name = screen.getByTestId('field-name') as HTMLInputElement;
    const slug = screen.getByTestId('field-slug') as HTMLInputElement;

    await user.type(name, ' Media Server');

    expect(slug.value).toBe('plex');
  });
});
