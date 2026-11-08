import { useEffect, useRef, useState } from 'react';
import { fetchWidgetsInfo } from './widgetsInfo';
import { geocode, saveWidgetSettings, type Place, type WidgetSettingsPatch } from './widgetAdminApi';
import './widget-admin.css';

// SPEC-status-widgets AC-026 / UX §7 — Admin Panel → Widgets, after System
// (W-3). Clock, Weather and Web search, each saving on change like the System
// switches. Lives in the lazy SettingsPanel chunk; styles in widget-admin.css.

export const SEARCH_PRESETS: [string, string][] = [
  ['DuckDuckGo', 'https://duckduckgo.com/?q={query}'],
  ['Google', 'https://www.google.com/search?q={query}'],
  ['Bing', 'https://www.bing.com/search?q={query}'],
  ['Kagi', 'https://kagi.com/search?q={query}'],
  ['Startpage', 'https://www.startpage.com/do/search?q={query}'],
];

type State = {
  clockEnabled: boolean;
  clockHour12: boolean | null;
  weatherEnabled: boolean;
  weatherPlace: string;
  weatherUnits: 'c' | 'f';
  webSearchEnabled: boolean;
  webSearchUrl: string;
  kidWebSearch: boolean;
};

type Flag = 'idle' | 'saving' | 'saved' | 'error';

function customError(url: string): string {
  if (!url.startsWith('https://')) return 'The address needs to start with https://.';
  if (!url.includes('{query}')) return 'The address needs {query} where the search words go.';
  return '';
}

export default function WidgetsSettings({ onChanged }: { onChanged?: () => void }) {
  const [state, setState] = useState<State | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [flag, setFlag] = useState<Flag>('idle');
  const [placeQuery, setPlaceQuery] = useState('');
  const [places, setPlaces] = useState<Place[] | 'none' | 'unreachable' | null>(null);
  const [picked, setPicked] = useState('');
  const [custom, setCustom] = useState<string | null>(null);
  const [customErr, setCustomErr] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let live = true;
    void fetchWidgetsInfo().then((i) => {
      if (!live) return;
      if (!i) {
        setLoadFailed(true);
        return;
      }
      const url = i.search.url;
      setState({
        clockEnabled: i.clock.enabled,
        clockHour12: i.clock.hour12,
        weatherEnabled: i.weather.enabled,
        weatherPlace: i.weather.place,
        weatherUnits: i.weather.units,
        webSearchEnabled: i.search.enabled,
        webSearchUrl: url,
        kidWebSearch: i.search.kids === true,
      });
      if (!SEARCH_PRESETS.some(([, u]) => u === url)) setCustom(url);
    });
    return () => {
      live = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (loadFailed) {
    return (
      <section data-testid="settings-widgets" className="settings-section widget-config">
        <h3 className="settings-section-title">Widgets</h3>
        <p className="settings-error">Couldn’t load the widget settings.</p>
      </section>
    );
  }
  if (!state) {
    return (
      <section data-testid="settings-widgets" className="settings-section widget-config" aria-busy="true">
        <h3 className="settings-section-title">Widgets</h3>
      </section>
    );
  }
  const s = state;

  // Optimistic: the control moves at once, and a failed save puts it back.
  async function save(patch: WidgetSettingsPatch, local: Partial<State>): Promise<boolean> {
    const prev = s;
    setState({ ...s, ...local });
    setFlag('saving');
    const out = await saveWidgetSettings(patch);
    if (!out) {
      setState(prev);
      setFlag('error');
      return false;
    }
    setState((cur) => (cur ? { ...cur, ...out } : cur));
    setFlag('saved');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setFlag('idle'), 1600);
    onChanged?.();
    return true;
  }

  async function findPlaces(e: React.FormEvent) {
    e.preventDefault();
    const q = placeQuery.trim();
    if (q.length < 2) return;
    const r = await geocode(q);
    setPlaces(r === 'unreachable' ? r : r.length === 0 ? 'none' : r.slice(0, 5));
  }

  async function pick(p: Place) {
    const round = (n: number) => Math.round(n * 100) / 100;
    setPlaces(null);
    if (await save({ weatherPlace: p.name, weatherLat: round(p.lat), weatherLon: round(p.lon) }, { weatherPlace: p.name })) {
      setPicked(`${p.name}, ${p.country}`);
      setPlaceQuery('');
    }
  }

  const presetValue = custom !== null ? 'custom' : s.webSearchUrl;

  return (
    <section
      data-testid="settings-widgets"
      aria-labelledby="settings-widgets-h"
      className="settings-section widget-config"
    >
      <h3 id="settings-widgets-h" className="settings-section-title">
        Widgets
      </h3>
      <p className="settings-section-note">Shown at the top of everyone’s dashboard.</p>
      <span className="settings-save-flag" role="status" aria-live="polite" data-state={flag}>
        {flag === 'saving' ? 'Saving…' : flag === 'saved' ? 'Saved ✓' : flag === 'error' ? 'Couldn’t save — try again.' : ''}
      </span>
      <dl className="settings-kv">
        <div className="settings-kv-row settings-kv-row--control">
          <dt id="widgets-clock-label">Clock</dt>
          <dd>
            <Switch
              labelId="widgets-clock-label"
              on={s.clockEnabled}
              onClick={() => void save({ clockEnabled: !s.clockEnabled }, { clockEnabled: !s.clockEnabled })}
            />
          </dd>
        </div>
      </dl>
      <div className="widget-controls">
        <fieldset className="widget-radios">
          <legend className="settings-kv-help">Time</legend>
          {(
            [
              ['Device’s choice', null],
              ['12-hour', true],
              ['24-hour', false],
            ] as const
          ).map(([label, v]) => (
            <label key={label} className="widget-radio">
              <input
                type="radio"
                name="widgets-clock-format"
                checked={s.clockHour12 === v}
                onChange={() => void save({ clockHour12: v }, { clockHour12: v })}
              />
              {label}
            </label>
          ))}
        </fieldset>
      </div>

      <dl className="settings-kv">
        <div className="settings-kv-row settings-kv-row--control">
          <dt>
            <span id="widgets-weather-label">Weather</span>
            {!s.weatherPlace && <span className="settings-kv-help">Choose a place first.</span>}
          </dt>
          <dd>
            <Switch
              labelId="widgets-weather-label"
              on={s.weatherEnabled}
              disabled={!s.weatherPlace}
              onClick={() => void save({ weatherEnabled: !s.weatherEnabled }, { weatherEnabled: !s.weatherEnabled })}
            />
          </dd>
        </div>
      </dl>
      <div className="widget-controls">
        <form className="settings-inline-form" onSubmit={findPlaces}>
          <label htmlFor="widgets-place" className="settings-kv-help">
            Place
          </label>
          <input
            id="widgets-place"
            className="settings-number widget-place-input"
            type="text"
            autoComplete="off"
            value={placeQuery}
            onChange={(e) => setPlaceQuery(e.target.value)}
          />
          <button type="submit" className="settings-inline-save" disabled={placeQuery.trim().length < 2}>
            Find
          </button>
        </form>
        {Array.isArray(places) ? (
          <ul className="widget-places" aria-label="Places">
            {places.map((p, i) => (
              <li key={`${p.lat},${p.lon},${i}`}>
                <button type="button" className="widget-place" onClick={() => void pick(p)}>
                  {[p.name, p.region, p.country].filter(Boolean).join(', ')}
                </button>
              </li>
            ))}
          </ul>
        ) : places === 'none' ? (
          <p className="settings-kv-help">No places found. Try a nearby town.</p>
        ) : places === 'unreachable' ? (
          <p className="settings-error">Can’t reach the weather service from the server.</p>
        ) : (
          s.weatherPlace && <p className="widget-picked">{picked || s.weatherPlace} ✓</p>
        )}
        <fieldset className="widget-radios">
          <legend className="settings-kv-help">Units</legend>
          {(['c', 'f'] as const).map((u) => (
            <label key={u} className="widget-radio">
              <input
                type="radio"
                name="widgets-units"
                checked={s.weatherUnits === u}
                onChange={() => void save({ weatherUnits: u }, { weatherUnits: u })}
              />
              {u === 'c' ? '°C' : '°F'}
            </label>
          ))}
        </fieldset>
        <p className="settings-kv-help">Weather data by Open-Meteo.com.</p>
      </div>

      <dl className="settings-kv">
        <div className="settings-kv-row settings-kv-row--control">
          <dt id="widgets-search-label">Web search</dt>
          <dd>
            <Switch
              labelId="widgets-search-label"
              on={s.webSearchEnabled}
              onClick={() =>
                void save({ webSearchEnabled: !s.webSearchEnabled }, { webSearchEnabled: !s.webSearchEnabled })
              }
            />
          </dd>
        </div>
      </dl>
      <div className="widget-controls">
        <div className="settings-inline-form">
          <label htmlFor="widgets-provider" className="settings-kv-help">
            Search provider
          </label>
          <select
            id="widgets-provider"
            className="settings-number"
            value={presetValue}
            onChange={(e) => {
              const v = e.target.value;
              setCustomErr('');
              if (v === 'custom') {
                setCustom('');
                return;
              }
              setCustom(null);
              void save({ webSearchUrl: v }, { webSearchUrl: v });
            }}
          >
            {SEARCH_PRESETS.map(([name, url]) => (
              <option key={url} value={url}>
                {name}
              </option>
            ))}
            <option value="custom">Custom</option>
          </select>
        </div>
        {custom !== null && (
          <form
            className="settings-inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              const url = custom.trim();
              const err = customError(url);
              setCustomErr(err);
              if (!err) void save({ webSearchUrl: url }, { webSearchUrl: url });
            }}
          >
            <label htmlFor="widgets-custom" className="settings-kv-help">
              Custom address
            </label>
            <input
              id="widgets-custom"
              className="settings-number widget-place-input"
              type="url"
              placeholder="https://search.example/?q={query}"
              value={custom}
              aria-invalid={customErr ? true : undefined}
              onChange={(e) => setCustom(e.target.value)}
            />
            <button type="submit" className="settings-inline-save">
              Save address
            </button>
            {customErr && (
              <p className="settings-error" role="alert">
                {customErr}
              </p>
            )}
          </form>
        )}
        <label className="widget-check">
          <input
            type="checkbox"
            checked={s.kidWebSearch}
            onChange={() => void save({ kidWebSearch: !s.kidWebSearch }, { kidWebSearch: !s.kidWebSearch })}
          />
          Kids can search the web
        </label>
      </div>
    </section>
  );
}

function Switch({
  labelId,
  on,
  disabled,
  onClick,
}: {
  labelId: string;
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-labelledby={labelId}
      disabled={disabled}
      className="settings-switch"
      onClick={onClick}
    >
      <span className="settings-switch-thumb" aria-hidden="true" />
    </button>
  );
}
