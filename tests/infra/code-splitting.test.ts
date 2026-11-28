import { readFileSync, readdirSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// v14.0.1 optimize — the on-demand overlays (admin Settings, the app Library,
// the custom-app form, the per-tile Edit modal, the inline iframe overlay) are
// only ever mounted after a user action, never on first paint. Static-importing
// them pulled every one — plus their transitive deps — into the single main JS
// chunk, bloating the initial download for a dashboard that most users never
// open a modal on.
//
// This guards the fix: each of those overlays must be React.lazy(() => import())
// so Rollup emits it as its own async chunk, kept OUT of the main bundle until
// the surface is actually opened. A regression to a static `import Foo from` on
// any of these silently re-bloats the initial chunk with no visible symptom —
// exactly the kind of drift a meta-test exists to catch (cf. dockerfile-cachebust
// / version-sha-buildarg). Named for the observed property, not a theory: "these
// overlays load as separate chunks."

function read(file: string): string {
  return readFileSync(resolve(process.cwd(), 'src', file), 'utf8');
}

function listSrc(): string[] {
  const root = resolve(process.cwd(), 'src');
  return (readdirSync(root, { recursive: true }) as string[])
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => f.split(sep).join('/'))
    .sort();
}

describe('code-splitting — on-demand overlays are lazy chunks', () => {
  it('App.tsx lazy-loads Settings, Library, and the custom-app form', () => {
    const src = read('app/App.tsx');
    expect(src).toMatch(/import\s*\{[^}]*\blazy\b[^}]*\}\s*from ['"]react['"]/);
    expect(src).toMatch(/import\s*\{[^}]*\bSuspense\b[^}]*\}\s*from ['"]react['"]/);
    expect(src).toMatch(/lazy\(\s*\(\)\s*=>\s*import\(['"][./a-z]*\/SettingsPanel['"]\)\s*\)/);
    expect(src).toMatch(/lazy\(\s*\(\)\s*=>\s*import\(['"][./a-z]*\/LibraryBrowse['"]\)\s*\)/);
    expect(src).toMatch(/lazy\(\s*\(\)\s*=>\s*import\(['"][./a-z]*\/ServiceForm['"]\)\s*\)/);
    // No lingering static default-imports of the split modules.
    expect(src).not.toMatch(/^import SettingsPanel from/m);
    expect(src).not.toMatch(/^import LibraryBrowse from/m);
    expect(src).not.toMatch(/^import ServiceForm from/m);
  });

  // The changelog overlay opens only from the footer version badge, and it
  // carries src/changelog.json (~47 kB raw, every release ever shipped). Static,
  // that data rode in the entry chunk for every dashboard load.
  it('App.tsx lazy-loads the changelog overlay', () => {
    const src = read('app/App.tsx');
    expect(src).toMatch(/lazy\(\s*\(\)\s*=>\s*import\(['"][./a-z]*\/ChangelogOverlay['"]\)\s*\)/i);
    expect(src).not.toMatch(/^import ChangelogOverlay from/m);
  });

  // The data must reach the bundle only through the lazy overlay. Any other
  // src module importing it would pull the whole file back into the entry.
  it('only ChangelogOverlay imports changelog.json', () => {
    const importers = listSrc().filter((f) => !/\.test\.tsx?$/.test(f) && /changelog\.json['"]/.test(read(f)));
    expect(importers).toEqual(['app/ChangelogOverlay.tsx']);
  });

  // SPEC-status-widgets — the clock and weather bodies (and their icons)
  // render only when an admin turned one on, so they are a lazy chunk too.
  // SPEC-health-widget §4.5 — the widget area (entry) loads them; health
  // (StatusBar) stays in the entry with it.
  it('WidgetArea.tsx lazy-loads the clock and weather bodies', () => {
    const src = read('app/WidgetArea.tsx');
    expect(src).toMatch(/^import StatusBar from '\.\/StatusBar';$/m);
    expect(src).toMatch(/lazy\(\s*\(\)\s*=>\s*import\(['"][./a-z]*\/GlanceStrip['"]\)\s*\)/i);
    expect(src).not.toMatch(/^import GlanceStrip from/m);
  });

  // SPEC-password-reset-link UX §1 — the reset screen mounts only from a
  // /#reset= link, like the Join screen from /#invite=.
  it('App.tsx lazy-loads the Join and reset screens', () => {
    const src = read('app/App.tsx');
    expect(src).toMatch(/lazy\(\s*\(\)\s*=>\s*import\(['"][./a-z]*\/JoinScreen['"]\)\s*\)/i);
    expect(src).toMatch(/lazy\(\s*\(\)\s*=>\s*import\(['"][./a-z]*\/ResetPasswordScreen['"]\)\s*\)/i);
    expect(src).not.toMatch(/^import JoinScreen from/m);
    expect(src).not.toMatch(/^import ResetPasswordScreen from/m);
  });

  // SPEC-password-reset-link — the password calls are only reachable from lazy
  // chunks (the reset screen, the reset-link dialog, My settings).
  it('only lazy chunks import the password API', () => {
    const entryish = ['app/App.tsx', 'grid/AppGrid.tsx', 'services.tsx', 'launcher/CommandLauncher.tsx', 'api.ts'];
    for (const f of entryish) expect(read(f), f).not.toMatch(/passwordApi/);
  });

  // SPEC-status-widgets AC-033 — the admin widget calls are only reachable from
  // the lazy editors, never from an entry module.
  it('only the lazy editors import the admin widget API', () => {
    const entryish = ['app/App.tsx', 'grid/AppGrid.tsx', 'services.tsx', 'launcher/CommandLauncher.tsx', 'api.ts'];
    for (const f of entryish) expect(read(f), f).not.toMatch(/widgetAdminApi/);
  });

  it('AppGrid.tsx lazy-loads the tile-edit modal and the inline iframe overlay', () => {
    const src = read('grid/AppGrid.tsx');
    expect(src).toMatch(/import\s*\{[^}]*\blazy\b[^}]*\}\s*from ['"]react['"]/);
    expect(src).toMatch(/import\s*\{[^}]*\bSuspense\b[^}]*\}\s*from ['"]react['"]/);
    expect(src).toMatch(/lazy\(\s*\(\)\s*=>\s*import\(['"][./a-z]*\/TileEditModal['"]\)\s*\)/);
    expect(src).toMatch(/lazy\(\s*\(\)\s*=>\s*import\(['"][./a-z]*\/IframeOverlay['"]\)\s*\)/);
    expect(src).not.toMatch(/^import TileEditModal from/m);
    expect(src).not.toMatch(/^import IframeOverlay from/m);
  });

  // SPEC-iframe-sandbox-optin (UX §1 "Bundle") — the sandbox rule is used only
  // by the two lazy surfaces, so it costs the entry chunk nothing. AppGrid must
  // not import it to precompute anything.
  it('only the overlay and the tile editor import lib/sandbox', () => {
    const importers = ['grid/IframeOverlay.tsx', 'grid/TileEditModal.tsx'];
    for (const f of importers) expect(read(f), f).toMatch(/from ['"]\.\.\/lib\/sandbox['"]/);
    const entryish = ['app/App.tsx', 'grid/AppGrid.tsx', 'services.tsx', 'launcher/CommandLauncher.tsx', 'api.ts', 'main.tsx'];
    for (const f of entryish) expect(read(f), f).not.toMatch(/lib\/sandbox/);
  });

  // SPEC-backup-import — the two flows load on demand: from the Admin Panel's
  // Backup and import section, and (the import) from the admin empty state.
  it('BackupSection and App.tsx lazy-load the restore and import modals', () => {
    const section = read('library/backup/BackupSection.tsx');
    expect(section).toMatch(/lazy\(\s*\(\)\s*=>\s*import\(['"]\.\/RestoreModal['"]\)\s*\)/);
    expect(section).toMatch(/lazy\(\s*\(\)\s*=>\s*import\(['"]\.\/HomepageImportModal['"]\)\s*\)/);
    expect(section).not.toMatch(/^import (RestoreModal|HomepageImportModal) from/m);
    const app = read('app/App.tsx');
    expect(app).toMatch(/lazy\(\s*\(\)\s*=>\s*import\(['"][./a-z]*\/backup\/HomepageImportModal['"]\)\s*\)/);
    expect(app).not.toMatch(/^import HomepageImportModal from/m);
  });

  // SPEC-household-manage-adults UX §1 — the adult row menu rides in the lazy
  // Admin Panel chunk, and its confirms load on demand from the menu, the way
  // BackupSection loads RestoreModal.
  it('AdultRowMenu lazy-loads its confirm; no entry module imports either', () => {
    const menu = read('accounts/AdultRowMenu.tsx');
    expect(menu).toMatch(/lazy\(\s*\(\)\s*=>\s*import\(['"]\.\/AdultConfirm['"]\)\s*\)/);
    expect(menu).not.toMatch(/^import AdultConfirm from/m);
    const entryish = ['app/App.tsx', 'app/UserMenu.tsx', 'grid/AppGrid.tsx', 'services.tsx', 'main.tsx'];
    for (const f of entryish) expect(read(f), f).not.toMatch(/AdultRowMenu|AdultConfirm/);
  });

  // SPEC-password-reset-link UX §1 — the reset-link dialog loads with lazy()
  // from the row menu, inside the Admin Panel chunk.
  it('AdultRowMenu lazy-loads the reset-link dialog; no entry module imports it', () => {
    const menu = read('accounts/AdultRowMenu.tsx');
    expect(menu).toMatch(/lazy\(\s*\(\)\s*=>\s*import\(['"]\.\/ResetLinkDialog['"]\)\s*\)/);
    expect(menu).not.toMatch(/^import ResetLinkDialog from/m);
    const entryish = ['app/App.tsx', 'app/UserMenu.tsx', 'grid/AppGrid.tsx', 'services.tsx', 'main.tsx'];
    for (const f of entryish) expect(read(f), f).not.toMatch(/ResetLinkDialog/);
  });
});
