import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

  // SPEC-status-widgets — the glance strip (clock, weather, its icons) renders
  // only when an admin turned one on, so it is a lazy chunk too.
  it('App.tsx lazy-loads the glance strip', () => {
    const src = read('app/App.tsx');
    expect(src).toMatch(/lazy\(\s*\(\)\s*=>\s*import\(['"][./a-z]*\/GlanceStrip['"]\)\s*\)/i);
    expect(src).not.toMatch(/^import GlanceStrip from/m);
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
});
