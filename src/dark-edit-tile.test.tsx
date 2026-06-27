import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Catalog from './Catalog';
import { categories, services, getCollapsedCategories, type Category, type Service } from './api';

// Issue #163 (Walt's live UI review): the per-app edit-tile controls (the
// IconControls block under each app in edit mode — the Category <select>, the
// "Edit app" and "Delete service" buttons, and the section divider) do NOT
// honor dark mode. They carry only light-mode Tailwind utilities (white select
// bg, `border-neutral-200`, `text-neutral-700`), so against the dark tile the
// Category dropdown renders as a glaring white box and "Edit app" reads as dim
// gray — poor contrast. Same class as #158/#29: the missing `dark:` variant.
// We assert each control carries a `dark:` variant so it is re-tuned for the
// dark canvas; named for the observed symptom (controls don't honor dark mode),
// not a theorized cause.

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

describe('#163 — per-app edit-tile controls honor dark mode', () => {
  it('every edit-tile control carries a dark-mode variant (not washed out)', async () => {
    render(<Catalog isAdmin editMode />);
    await screen.findByTestId('icon-controls');

    const controls = ['icon-controls', 'category-select', 'edit-service', 'delete-service'];
    for (const testid of controls) {
      const el = screen.getByTestId(testid);
      expect(el.className, `${testid} must carry a dark: variant so it honors dark mode`).toMatch(
        /dark:/,
      );
    }
  });
});
