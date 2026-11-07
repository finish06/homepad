// SPEC-status-widgets AC-030 / UX §5 — ⌘K's web search row. With a non-empty
// query the last row is "Search the web for “x”"; Enter or a click opens the
// provider in a new tab with the query URL-encoded. With no app matches it is
// the only row and starts selected. Kids get it only when the server says so
// (search.enabled already reflects the kid switch), so the launcher just
// renders what it is handed.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import CommandLauncher from './CommandLauncher';
import LauncherTrigger from './LauncherTrigger';
import { LauncherProvider } from './launcher';
import { WidgetsInfoContext } from '../widgets/context';
import type { WidgetsInfo } from '../widgets/widgetsInfo';
import type { Service } from '../api';

function svc(id: string, name: string): Service {
  return {
    id,
    slug: id,
    name,
    description: '',
    url: `https://${id}.example.com`,
    icon: 'x',
    status: 'UP',
    favorite: false,
    iconLight: false,
    iconDark: false,
    categoryId: null,
    categoryName: 'Media',
  };
}

const CATALOG = [svc('jellyfin', 'Jellyfin'), svc('gitea', 'Gitea')];
const DDG = { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q={query}' };

function setup(webSearch: { name: string; url: string } | null = DDG) {
  render(
    <LauncherProvider>
      <CommandLauncher services={CATALOG} webSearch={webSearch} />
    </LauncherProvider>,
  );
  fireEvent.keyDown(document, { key: 'k', metaKey: true });
  return screen.getByTestId('launcher-input') as HTMLInputElement;
}

const type = (input: HTMLInputElement, value: string) => fireEvent.change(input, { target: { value } });

afterEach(() => vi.restoreAllMocks());

describe('the web search row (AC-030)', () => {
  it('is absent with an empty query', () => {
    setup();
    expect(screen.queryByTestId('launcher-web-row')).not.toBeInTheDocument();
  });

  it('is the last row with a non-empty query, after the app matches', () => {
    const input = setup();
    type(input, 'jelly fin subtitles');
    const options = screen.getAllByRole('option');
    const web = screen.getByTestId('launcher-web-row');
    expect(options[options.length - 1]).toBe(web);
    expect(web).toHaveTextContent('Search the web for “jelly fin subtitles”');
    expect(web).toHaveTextContent('DuckDuckGo');
  });

  it('opens the provider in a new tab with the query URL-encoded', () => {
    const input = setup();
    type(input, 'jelly fin & subs');
    const web = screen.getByTestId('launcher-web-row');
    expect(web).toHaveAttribute('href', 'https://duckduckgo.com/?q=jelly%20fin%20%26%20subs');
    expect(web).toHaveAttribute('target', '_blank');
    expect(web).toHaveAttribute('rel', 'noreferrer noopener');
  });

  it('trims the query it sends', () => {
    const input = setup();
    type(input, '  weather  ');
    expect(screen.getByTestId('launcher-web-row')).toHaveAttribute('href', 'https://duckduckgo.com/?q=weather');
  });

  it('with no app matches it is the only row, selected, and Enter searches', () => {
    const input = setup();
    type(input, 'zzqx');
    expect(screen.queryByTestId('launcher-no-results')).not.toBeInTheDocument();
    const web = screen.getByTestId('launcher-web-row');
    expect(screen.getAllByRole('option')).toEqual([web]);
    expect(web).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', web.id);
    const click = vi.spyOn(web, 'click').mockImplementation(() => {});
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('arrow keys reach it after the apps and wrap around', () => {
    const input = setup();
    type(input, 'jelly');
    const apps = screen.getAllByTestId('launcher-result');
    expect(apps).toHaveLength(1);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByTestId('launcher-web-row')).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(apps[0]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input, { key: 'End' });
    expect(screen.getByTestId('launcher-web-row')).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input, { key: 'Home' });
    expect(apps[0]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(screen.getByTestId('launcher-web-row')).toHaveAttribute('aria-selected', 'true');
  });

  it('the result count includes it', () => {
    const input = setup();
    type(input, 'jelly');
    expect(screen.getByTestId('launcher-live')).toHaveTextContent('2 results');
  });

  it('the box text says it searches the web too', () => {
    setup();
    expect(screen.getByTestId('launcher-input')).toHaveAttribute('placeholder', 'Search apps and the web');
  });

  it('off: no row, today’s placeholder and today’s empty state', () => {
    const input = setup(null);
    expect(input).toHaveAttribute('placeholder', 'Search services…');
    type(input, 'zzqx');
    expect(screen.queryByTestId('launcher-web-row')).not.toBeInTheDocument();
    expect(screen.getByTestId('launcher-no-results')).toBeInTheDocument();
  });

  it('a provider URL that is not http(s) is never rendered as a link', () => {
    const input = setup({ name: 'Bad', url: 'javascript:alert({query})' });
    type(input, 'x');
    expect(screen.getByTestId('launcher-web-row')).toHaveAttribute('href', '#');
  });
});

const INFO: WidgetsInfo = {
  clock: { enabled: false, hour12: null },
  weather: { enabled: false, state: 'loading', asOf: null, place: '', units: 'c' },
  search: { enabled: true, name: 'DuckDuckGo', url: DDG.url },
};

describe('the header pill (UX §5)', () => {
  function pill(info: WidgetsInfo | null) {
    render(
      <WidgetsInfoContext.Provider value={info}>
        <LauncherProvider>
          <LauncherTrigger />
        </LauncherProvider>
      </WidgetsInfoContext.Provider>,
    );
    return screen.getByTestId('launcher-trigger-hint');
  }

  it('reads "Search apps and the web" while web search is on', () => {
    expect(pill(INFO)).toHaveTextContent('Search apps and the web');
  });

  it('stays as today while it is off or unknown', () => {
    expect(pill({ ...INFO, search: { ...INFO.search, enabled: false } })).toHaveTextContent('Search…');
  });

  it('stays as today before the info loads', () => {
    expect(pill(null)).toHaveTextContent('Search…');
  });
});
