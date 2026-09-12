import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Web Storage shim for Node 26+ local runs.
//
// Node 26 defines a *native* `localStorage` accessor on the global object that
// returns `undefined` unless the runtime was started with `--localstorage-file`.
// Because vitest's jsdom environment shares one global object with the Node
// realm, that native accessor wins over jsdom's own implementation — so both
// `localStorage` and `window.localStorage` read as `undefined`, and any bare
// access throws.
//
// The damage cascades well beyond the storage call itself: a throw inside a
// beforeEach/afterEach hook aborts that hook, so `cleanup()` never runs, so
// rendered trees accumulate in the document, and unrelated later tests fail with
// "Found multiple elements by: [data-testid=...]". That reads like a test
// isolation bug and is not one.
//
// CI runs Node 22, which has no native Web Storage global, so jsdom supplies a
// working implementation and the guard below skips — this shim is inert there.
// Delete it once the repo's local Node floor has a working native Web Storage.
// ---------------------------------------------------------------------------

class MemoryStorage implements Storage {
  #entries = new Map<string, string>();

  get length(): number {
    return this.#entries.size;
  }

  key(index: number): string | null {
    return [...this.#entries.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.#entries.has(String(key)) ? this.#entries.get(String(key))! : null;
  }

  setItem(key: string, value: string): void {
    this.#entries.set(String(key), String(value));
  }

  removeItem(key: string): void {
    this.#entries.delete(String(key));
  }

  clear(): void {
    this.#entries.clear();
  }
}

function installStorage(name: 'localStorage' | 'sessionStorage'): void {
  const existing = (globalThis as Record<string, unknown>)[name];
  if (existing) return; // jsdom (or a real runtime) already provided one.

  const storage = new MemoryStorage();
  const define = (target: object) =>
    Object.defineProperty(target, name, {
      value: storage,
      configurable: true,
      writable: true,
    });

  define(globalThis);
  // vitest's jsdom environment usually aliases `window` to the same object, but
  // define on both when they differ so neither access path is left undefined.
  if (typeof window !== 'undefined' && (window as unknown) !== (globalThis as unknown)) {
    define(window);
  }
}

installStorage('localStorage');
installStorage('sessionStorage');

afterEach(() => {
  cleanup();
});
