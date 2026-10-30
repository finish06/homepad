import { describe, expect, it, vi } from 'vitest';
import { trapTab } from './trapTab';

function keyEvent(shiftKey: boolean) {
  return { key: 'Tab', shiftKey, preventDefault: vi.fn() } as unknown as React.KeyboardEvent;
}

describe('trapTab', () => {
  it('does nothing without a root or without focusable children', () => {
    const e = keyEvent(false);
    trapTab(e, null);
    const empty = document.createElement('div');
    trapTab(e, empty);
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it('leaves a Tab in the middle alone', () => {
    const root = document.createElement('div');
    root.innerHTML = '<button>a</button><button>b</button><button>c</button>';
    document.body.append(root);
    (root.children[1] as HTMLElement).focus();
    const e = keyEvent(false);
    trapTab(e, root);
    expect(e.preventDefault).not.toHaveBeenCalled();
    root.remove();
  });
});
