import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import KidEditor from './KidEditor';
import { categories, createKid, kidServices, kidSessions, services } from '../api';

// SPEC-household-basics AC-031 (plan TASK-204) — at the account cap, saving a
// new kid shows "This Homepad has reached its limit of N accounts." inline,
// and the editor stays open with what was typed. A 409 for a taken name keeps
// its own message (KidEditor.test.tsx).

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

beforeEach(() => {
  vi.mocked(services).mockResolvedValue([]);
  vi.mocked(categories).mockResolvedValue([]);
  vi.mocked(kidServices).mockResolvedValue([]);
  vi.mocked(kidSessions).mockResolvedValue([]);
});

afterEach(() => vi.clearAllMocks());

describe('Add a kid at the account cap (AC-031)', () => {
  it('shows the limit inline, not under the name, and stays open', async () => {
    vi.mocked(createKid).mockResolvedValue({ ok: false, status: 409, error: 'account limit reached (limit 3)' });
    const onClose = vi.fn();
    render(<KidEditor onClose={onClose} onSaved={() => {}} onDeleted={() => {}} />);
    await screen.findByTestId('kid-checklist');
    await userEvent.type(screen.getByLabelText('Name'), 'Sam');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This Homepad has reached its limit of 3 accounts.');
    expect(screen.queryByText('Another kid already has this name.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Sam');
    await waitFor(() => expect(onClose).not.toHaveBeenCalled());
  });
});
