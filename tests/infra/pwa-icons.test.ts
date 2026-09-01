// PWA icon + favicon wiring. Asserts the *built* artifacts (dist/) the
// browser actually receives — index.html links the full favicon set and the
// web manifest, and manifest.webmanifest is emitted and lists the three PWA
// icons (192 any / 512 any / 512 maskable). Run after `npm run build`, which
// CI does before `vitest run`.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const dist = resolve(process.cwd(), 'dist');
const read = (p: string) => readFileSync(resolve(dist, p), 'utf8');

describe('PWA icons + favicons (built output)', () => {
  it('built dist/ exists (run `npm run build` first)', () => {
    expect(existsSync(dist)).toBe(true);
  });

  describe('index.html link tags', () => {
    const html = () => read('index.html');

    it('AC1 — links the SVG favicon (image/svg+xml)', () => {
      expect(html()).toMatch(
        /<link[^>]+rel=["']icon["'][^>]+type=["']image\/svg\+xml["'][^>]+href=["']\/favicon\.svg["']/,
      );
    });

    it('AC1 — links the favicon.ico fallback', () => {
      expect(html()).toMatch(/<link[^>]+href=["']\/favicon\.ico["']/);
    });

    it('AC1 — links the 16/32/48 PNG favicons with sizes', () => {
      const h = html();
      for (const px of [16, 32, 48]) {
        expect(h).toMatch(
          new RegExp(
            `<link[^>]+rel=["']icon["'][^>]+sizes=["']${px}x${px}["'][^>]+href=["']/favicon-${px}\\.png["']`,
          ),
        );
      }
    });

    it('AC1 — links the apple-touch-icon', () => {
      expect(html()).toMatch(
        /<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']\/apple-touch-icon\.png["']/,
      );
    });

    it('AC2 — links the web manifest', () => {
      expect(html()).toMatch(
        /<link[^>]+rel=["']manifest["'][^>]+href=["']\/manifest\.webmanifest["']/,
      );
    });

    it('AC3 — exposes icon-hero as the social-preview image', () => {
      const h = html();
      expect(h).toMatch(
        /<meta[^>]+property=["']og:image["'][^>]+content=["'][^"']*icon-hero-1024\.png["']/,
      );
      expect(h).toMatch(
        /<meta[^>]+name=["']twitter:image["'][^>]+content=["'][^"']*icon-hero-1024\.png["']/,
      );
    });
  });

  describe('manifest.webmanifest', () => {
    const manifest = () => JSON.parse(read('manifest.webmanifest'));

    it('AC2 — is served from the site root and names the app', () => {
      const m = manifest();
      expect(m.name).toBe('homepad');
      expect(m.short_name).toBeTruthy();
      expect(m.theme_color).toMatch(/^#/);
      expect(m.background_color).toMatch(/^#/);
    });

    it('AC2 — lists the 192 (any), 512 (any) and 512 (maskable) icons', () => {
      const icons: Array<{ src: string; sizes: string; purpose?: string }> =
        manifest().icons;
      const has = (src: string, sizes: string, purpose?: string) =>
        icons.some(
          (i) =>
            i.src.includes(src) &&
            i.sizes === sizes &&
            (purpose ? (i.purpose ?? '').includes(purpose) : true),
        );

      expect(has('icon-192.png', '192x192')).toBe(true);
      expect(has('icon-512.png', '512x512')).toBe(true);
      expect(has('icon-maskable-512.png', '512x512', 'maskable')).toBe(true);
    });
  });
});
