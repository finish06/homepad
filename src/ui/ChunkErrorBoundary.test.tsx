import { afterEach, describe, expect, it, vi } from 'vitest';
import { lazy, Suspense } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChunkErrorBoundary from './ChunkErrorBoundary';
import { reloadPage } from '../lib/reload';

// SPEC-ui-cleanup-18.3.0 AC-004 (#341) — a lazy chunk that fails to load must not
// take the app down with it. The boundary sits around each <Suspense>.

vi.mock('../lib/reload', () => ({ reloadPage: vi.fn() }));

// A lazy component whose chunk fetch rejects, as a dropped network or a deploy
// rollover would make it.
const failing = () =>
  lazy(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module: /assets/SettingsPanel-x.js')));

let errSpy: ReturnType<typeof vi.spyOn>;
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  errSpy?.mockRestore();
});
// React logs a caught render error to console.error; keep the run quiet.
const quiet = () => (errSpy = vi.spyOn(console, 'error').mockImplementation(() => {}));

describe('ChunkErrorBoundary', () => {
  it('renders its children when nothing fails', async () => {
    const Ok = lazy(async () => ({ default: () => <p>loaded</p> }));
    render(
      <ChunkErrorBoundary onClose={vi.fn()}>
        <Suspense fallback={null}>
          <Ok />
        </Suspense>
      </ChunkErrorBoundary>,
    );
    expect(await screen.findByText('loaded')).toBeInTheDocument();
  });

  it('a failed chunk shows a small dialog, and the rest of the tree survives', async () => {
    quiet();
    const Broken = failing();
    render(
      <div>
        <p>dashboard</p>
        <ChunkErrorBoundary onClose={vi.fn()}>
          <Suspense fallback={null}>
            <Broken />
          </Suspense>
        </ChunkErrorBoundary>
      </div>,
    );
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent("Couldn't load this");
    expect(screen.getByText('dashboard')).toBeInTheDocument();
  });

  it('Close calls onClose, the same exit as the overlay itself', async () => {
    quiet();
    const onClose = vi.fn();
    const Broken = failing();
    render(
      <ChunkErrorBoundary onClose={onClose}>
        <Suspense fallback={null}>
          <Broken />
        </Suspense>
      </ChunkErrorBoundary>,
    );
    await screen.findByRole('alertdialog');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(reloadPage).not.toHaveBeenCalled();
  });

  it('Reload reloads the page (React.lazy keeps the failed import, so only a reload retries it)', async () => {
    quiet();
    const Broken = failing();
    render(
      <ChunkErrorBoundary onClose={vi.fn()}>
        <Suspense fallback={null}>
          <Broken />
        </Suspense>
      </ChunkErrorBoundary>,
    );
    await screen.findByRole('alertdialog');
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it('with no onClose (a full screen), it shows the message and Reload only', async () => {
    quiet();
    const Broken = failing();
    render(
      <ChunkErrorBoundary>
        <Suspense fallback={null}>
          <Broken />
        </Suspense>
      </ChunkErrorBoundary>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load this");
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('silent mode renders nothing (decoration like the glance strip)', async () => {
    quiet();
    const Broken = failing();
    const { container } = render(
      <div data-testid="host">
        <ChunkErrorBoundary silent>
          <Suspense fallback={null}>
            <Broken />
          </Suspense>
        </ChunkErrorBoundary>
      </div>,
    );
    // Let the rejected import settle and the boundary catch it.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(container.querySelector('[data-testid="host"]')).toBeEmptyDOMElement();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
