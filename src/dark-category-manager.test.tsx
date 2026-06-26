import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Catalog from './Catalog';
import { categories, services, getCollapsedCategories, type Category, type Service } from './api';

// Issue #158 (Walt's live UI review): the edit-dashboard "Categories" section
// (the admin CategoryManager + its rows) does NOT honor dark mode — its inputs
// and Save/Delete/Add buttons carry only light-mode Tailwind utilities
// (transparent bg, `border-neutral-300`, `text-neutral-700`), so against the
// dark panel they read washed-out / low-contrast. Same class of fix as #29: the
// missing `.dark`/`dark:` variant. We assert each control carries a `dark:`
// variant so it is re-tuned for the dark canvas; named for the observed symptom
// (controls don't honor dark mode), not a theorized cause.

vi.mock('./api', () => ({
  services: vi.fn(),
  setFavorite: vi.fn(),
  setLayout: vi.fn(),
  uploadIcon: vi.fn(),
  deleteIcon: vi.fn(),
  deleteService: vi.fn(),
  createService: vi.fn(),
  updateService: vi.fn(),
  setThemePref: vi.fn(),
  categories: vi.fn(),
  createCategory: vi.fn(),
  renameCategory: vi.fn(),
  deleteCategory: vi.fn(),
  setCategoryOrder: vi.fn(),
  assignCategory: vi.fn(),
  getCollapsedCategories: vi.fn(),
  setCollapsedCategories: vi.fn(),
  listLibrary: vi.fn(),
  addFromLibrary: vi.fn(),
}));

const CAT: Category = { id: 'c1', name: 'Media', sortIndex: 0 };
const SVC: Service = {
  id: 's1',
  slug: 'plex',
  name: 'Plex',
  description: 'Media server',
  url: 'https://plex.example.com',
  icon: 'plex',
  status: 'UP',
  favorite: false,
  iconLight: false,
  iconDark: false,
  categoryId: 'c1',
  categoryName: 'Media',
};

beforeEach(() => {
  vi.mocked(services).mockResolvedValue([SVC]);
  vi.mocked(categories).mockResolvedValue([CAT]);
  vi.mocked(getCollapsedCategories).mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('#158 — edit-dashboard Categories honor dark mode', () => {
  it('every Categories control carries a dark-mode variant (not washed out)', async () => {
    render(<Catalog isAdmin editMode />);
    await screen.findByTestId('category-manager');

    const controls = [
      'category-name-input',
      'category-create',
      'category-rename-input',
      'category-rename',
      'category-delete',
    ];
    for (const testid of controls) {
      const el = screen.getByTestId(testid);
      expect(el.className, `${testid} must carry a dark: variant so it honors dark mode`).toMatch(
        /dark:/,
      );
    }
  });
});
