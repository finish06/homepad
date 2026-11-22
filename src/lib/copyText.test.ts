import { afterEach, describe, expect, it, vi } from 'vitest';
import { canCopy, copyText } from './copyText';

// #584 / #587 — the shared Copy helper. The Clipboard API first, then
// execCommand('copy'); false only when neither copied.

function clipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true });
}
function execCommand(value: unknown) {
  Object.defineProperty(document, 'execCommand', { value, configurable: true });
}

afterEach(() => {
  clipboard(undefined);
  delete (document as { execCommand?: unknown }).execCommand;
  delete (window as { isSecureContext?: unknown }).isSecureContext;
});

describe('copyText', () => {
  it('uses the Clipboard API when it is there', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    clipboard({ writeText });
    const exec = vi.fn();
    execCommand(exec);
    expect(await copyText('abc')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('abc');
    expect(exec).not.toHaveBeenCalled();
  });

  it('falls back to execCommand, with the text selected, and leaves nothing behind', async () => {
    let selected = '';
    execCommand(
      vi.fn(() => {
        const el = document.activeElement as HTMLTextAreaElement;
        selected = el.value.slice(el.selectionStart, el.selectionEnd);
        return true;
      }),
    );
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();
    expect(await copyText('snippet')).toBe(true);
    expect(selected).toBe('snippet');
    expect(document.querySelector('textarea')).toBeNull();
    expect(button).toHaveFocus();
    button.remove();
  });

  it('is false when execCommand throws or is missing', async () => {
    execCommand(
      vi.fn(() => {
        throw new Error('nope');
      }),
    );
    expect(await copyText('x')).toBe(false);
    delete (document as { execCommand?: unknown }).execCommand;
    expect(await copyText('x')).toBe(false);
  });
});

describe('canCopy', () => {
  it('needs a secure page and the Clipboard API', () => {
    clipboard({ writeText: vi.fn() });
    expect(canCopy()).toBe(false);
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    expect(canCopy()).toBe(true);
    clipboard(undefined);
    expect(canCopy()).toBe(false);
  });
});
