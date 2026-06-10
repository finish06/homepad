// Icon helpers for the v2 app-icons feature: a bundled local default, the
// client-side upload validation (mirrors the authoritative server checks so the
// admin gets instant feedback), and the theme-aware precedence resolver.

import type { IconVariant, Service } from './api';

// Bundled local default — a neutral monochrome placeholder shipped *in the JS
// bundle* as a data URI. It is the fallback when a tile resolves to nothing and
// the <img> onError target, so a tile NEVER renders a broken image. Being a
// data URI it is purely local: zero network, no CDN that can 404 or be offline
// on the LAN (this is the fix for the broken-image case the seeded catalog
// shows today).
export const DEFAULT_ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Crect width='48' height='48' rx='10' fill='%23e5e7eb'/%3E%3Crect x='15' y='15' width='18' height='18' rx='4' fill='%239ca3af'/%3E%3C/svg%3E";

// Validation caps — mirror the backend (spec Q2/Q3/Q4): PNG-only, ≤ 512×512,
// ≤ 256 KB. The server re-validates authoritatively; these are fast feedback.
export const MAX_ICON_BYTES = 256 * 1024;
export const MAX_ICON_DIM = 512;

// PNG magic bytes: \x89PNG\r\n\x1a\n.
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// validateIconFile returns a human-readable error string if the file fails any
// client-side check, or null if it passes. Same order as the backend so the
// message the admin sees matches what the server would have said:
// size → PNG magic-byte sniff → dimensions.
export async function validateIconFile(file: File): Promise<string | null> {
  if (file.size > MAX_ICON_BYTES) {
    return `Icon must be ≤ 256 KB (this is ${Math.ceil(file.size / 1024)} KB).`;
  }

  const head = new Uint8Array(await readBytes(file));
  if (head.length < PNG_SIGNATURE.length || PNG_SIGNATURE.some((b, i) => head[i] !== b)) {
    return 'Icon must be a PNG image.';
  }

  let width: number;
  let height: number;
  try {
    ({ width, height } = await readDimensions(file));
  } catch {
    return 'Icon must be a valid PNG image.';
  }
  if (width > MAX_ICON_DIM || height > MAX_ICON_DIM) {
    return `Icon must be ≤ 512×512 px (this is ${width}×${height}).`;
  }
  return null;
}

// Read a file's bytes. Real browsers have Blob.arrayBuffer; jsdom doesn't, so
// fall back to FileReader there.
function readBytes(file: Blob): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

async function readDimensions(file: File): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const dims = { width: bitmap.width, height: bitmap.height };
  bitmap.close?.();
  return dims;
}

// iconSrc resolves a tile's icon URL under the active theme via the
// deterministic precedence chain (spec): uploaded variant-T → uploaded other
// variant → legacy `icon` text (selfh.st CDN) → bundled local default. `rev`
// busts the browser cache after an upload/delete so a replaced icon re-renders.
export function iconSrc(service: Service, theme: IconVariant, rev: number): string {
  const order: IconVariant[] = theme === 'light' ? ['light', 'dark'] : ['dark', 'light'];
  for (const variant of order) {
    const present = variant === 'light' ? service.iconLight : service.iconDark;
    if (present) {
      const bust = rev > 0 ? `?v=${rev}` : '';
      return `/api/services/${service.id}/icon/${variant}${bust}`;
    }
  }
  if (service.icon) {
    return `https://cdn.jsdelivr.net/gh/selfhst/icons/svg/${service.icon}.svg`;
  }
  return DEFAULT_ICON;
}
