import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import IframeOverlay from './IframeOverlay';
import type { Service } from './api';

// SPEC-tile-click-action-20260710 (v23) §5.4–5.5 — the in-app IframeOverlay a
// tile with clickAction='iframe' opens. jsdom has no real iframe network, so the
// 5s blocked-embed fallback is exercised with fake timers + a synthetic load
// event; the paint/stacking/focus-trap behavior is verified in the CDP gate.
// Tests are named for the observed symptom, not a theorized cause (retro lesson).

function svc(overrides: Partial<Service> = {}): Service {
  return {
    id: 'S1',
    slug: 'netdata',
    name: 'Netdata',
    url: 'https://netdata.example.com',
    description: '',
    icon: '',
    status: 'UP',
    favorite: false,
    iconLight: false,
    iconDark: false,
    clickAction: 'iframe',
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('IframeOverlay', () => {
  it('renders a header with the service title (AC-005)', () => {
    render(<IframeOverlay service={svc()} onClose={vi.fn()} />);
    expect(screen.getByTestId('iframe-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('iframe-overlay-title')).toHaveTextContent('Netdata');
  });

  it('renders the iframe with src, title and a restrictive sandbox (AC-005)', () => {
    render(<IframeOverlay service={svc()} onClose={vi.fn()} />);
    const frame = screen.getByTestId('iframe-overlay-frame') as HTMLIFrameElement;
    expect(frame).toHaveAttribute('src', 'https://netdata.example.com');
    expect(frame).toHaveAttribute('title', 'Netdata');
    expect(frame).toHaveAttribute('loading', 'lazy');
    expect(frame.getAttribute('sandbox') ?? '').toContain('allow-scripts');
    expect(frame.getAttribute('sandbox') ?? '').toContain('allow-same-origin');
  });

  it('shows a loading spinner until the frame loads (AC-005)', () => {
    render(<IframeOverlay service={svc()} onClose={vi.fn()} />);
    expect(screen.getByTestId('iframe-overlay-spinner')).toBeInTheDocument();
  });

  it('closes when the close button is clicked (AC-006)', () => {
    const onClose = vi.fn();
    render(<IframeOverlay service={svc()} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('iframe-overlay-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when Escape is pressed (AC-006)', () => {
    const onClose = vi.fn();
    render(<IframeOverlay service={svc()} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the backdrop is clicked (AC-006)', () => {
    const onClose = vi.fn();
    render(<IframeOverlay service={svc()} onClose={onClose} />);
    fireEvent.mouseDown(screen.getByTestId('iframe-overlay'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT close when the panel body is clicked (AC-006)', () => {
    const onClose = vi.fn();
    render(<IframeOverlay service={svc()} onClose={onClose} />);
    fireEvent.mouseDown(screen.getByTestId('iframe-overlay-panel'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows the blocked-embed fallback when the frame does not load within 5s (AC-008)', () => {
    vi.useFakeTimers();
    render(<IframeOverlay service={svc()} onClose={vi.fn()} />);
    expect(screen.queryByTestId('iframe-overlay-fallback')).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    const fallback = screen.getByTestId('iframe-overlay-fallback');
    expect(fallback).toHaveTextContent(/can't be embedded/i);
    const open = screen.getByTestId('iframe-overlay-fallback-open') as HTMLAnchorElement;
    expect(open).toHaveAttribute('href', 'https://netdata.example.com');
    expect(open).toHaveAttribute('target', '_blank');
  });

  it('clears the timeout and hides the spinner when the frame loads in time (AC-009)', () => {
    vi.useFakeTimers();
    render(<IframeOverlay service={svc()} onClose={vi.fn()} />);

    act(() => {
      fireEvent.load(screen.getByTestId('iframe-overlay-frame'));
    });
    expect(screen.queryByTestId('iframe-overlay-spinner')).not.toBeInTheDocument();

    // Advancing past the 5s deadline must NOT surface the fallback — onLoad
    // cleared the timer.
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(screen.queryByTestId('iframe-overlay-fallback')).not.toBeInTheDocument();
  });
});
