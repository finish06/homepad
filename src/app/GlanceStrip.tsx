import { useEffect, useState } from 'react';
import type { WeatherCondition, WidgetsInfo } from '../widgets/widgetsInfo';

// SPEC-status-widgets §2.1 / UX §4 — the glance strip: the clock on the left,
// the weather on the right (or on the left when it is alone). A lazy chunk:
// Home renders it only while the clock or the weather is on. Its styles are in
// index.css, because it paints with the dashboard.

// AC-027 — the clock is the browser's: the viewer's time zone, no network, and
// one update on each minute boundary (no seconds shown, so none rendered).
function useMinute(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const next = () => 60_000 - (Date.now() % 60_000);
    const tick = () => {
      setNow(new Date());
      t = setTimeout(tick, next());
    };
    t = setTimeout(tick, next());
    return () => clearTimeout(t);
  }, []);
  return now;
}

function Clock({ hour12 }: { hour12: boolean | null }) {
  const now = useMinute();
  const minute = new Date(now);
  minute.setSeconds(0, 0);
  return (
    <div className="glance-clock" data-testid="glance-clock">
      {/* Not a live region: announcing every minute would be noise (UX §10). */}
      <time className="glance-time" data-testid="glance-time" dateTime={minute.toISOString()}>
        {now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: hour12 ?? undefined })}
      </time>
      <span className="glance-date glance-date-long" data-testid="glance-date-long">
        {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
      </span>
      <span className="glance-date glance-date-short" data-testid="glance-date-short">
        {now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
      </span>
    </div>
  );
}

const CONDITION_WORD: Record<WeatherCondition, string> = {
  clear: 'Clear',
  partly_cloudy: 'Partly cloudy',
  cloudy: 'Cloudy',
  fog: 'Fog',
  rain: 'Rain',
  snow: 'Snow',
  storm: 'Storm',
};

// Seven conditions, with day and night forms of clear and partly cloudy. Inline
// SVG strokes, so the strip makes no image request.
const SUN = 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4';
const MOON = 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z';
const CLOUD = 'M7 19h10a4 4 0 0 0 .4-8A6 6 0 0 0 6 11.6 3.7 3.7 0 0 0 7 19z';
const LOW_CLOUD = 'M8 16h9a3.5 3.5 0 0 0 .3-7A5 5 0 0 0 8 9.8 3.1 3.1 0 0 0 8 16z';
const SMALL_SUN = 'M7 4v1M2.5 8.5h1M3.8 5.3l.7.7M10.2 5.3l-.7.7M5 10a2.5 2.5 0 1 1 4.6-1.9';
const SMALL_MOON = 'M9.5 10A3.8 3.8 0 0 1 5 4.6 3.8 3.8 0 1 0 9.5 10z';
const ICON: Record<WeatherCondition, [string, string]> = {
  clear: [SUN, MOON],
  partly_cloudy: [`${SMALL_SUN}${LOW_CLOUD}`, `${SMALL_MOON}${LOW_CLOUD}`],
  cloudy: [CLOUD, CLOUD],
  fog: ['M4 9h16M3 13h18M5 17h14', 'M4 9h16M3 13h18M5 17h14'],
  rain: [`${LOW_CLOUD}M9 19l-1 2M13 19l-1 2M17 19l-1 2`, ''],
  snow: [`${LOW_CLOUD}M9 20h.01M13 20h.01M17 20h.01`, ''],
  storm: [`${LOW_CLOUD}M13 16l-2 3h3l-2 3`, ''],
};

function WeatherIcon({ condition, isDay }: { condition: WeatherCondition; isDay: boolean }) {
  const [day, night] = ICON[condition] ?? ICON.cloudy;
  return (
    <svg
      className="glance-icon"
      data-testid="glance-weather-icon"
      data-condition={condition}
      data-day={String(isDay)}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={isDay || !night ? day : night} />
    </svg>
  );
}

function Weather({ w }: { w: WidgetsInfo['weather'] }) {
  if ((w.state !== 'ok' && w.state !== 'stale') || typeof w.temp !== 'number') return null;
  const deg = (n: number) => `${Math.round(n)}°`;
  const condition = w.condition ?? 'cloudy';
  const hasRange = typeof w.high === 'number' && typeof w.low === 'number';
  // UX §10 — one sentence for screen readers; the visible parts are hidden.
  const alt =
    `${CONDITION_WORD[condition]}, ${Math.round(w.temp)} degrees.` +
    (hasRange ? ` High ${Math.round(w.high!)}, low ${Math.round(w.low!)}.` : '') +
    (w.place ? ` ${w.place}.` : '');
  return (
    <div className="glance-weather" data-testid="glance-weather">
      <span className="sr-only">{alt}</span>
      <span className="glance-weather-read" aria-hidden="true">
        <WeatherIcon condition={condition} isDay={w.isDay !== false} />
        <span className="glance-temp" data-testid="glance-temp">
          {w.state === 'stale' ? `◷ ${deg(w.temp)}` : deg(w.temp)}
        </span>
        {w.place && <span className="glance-meta glance-place">{w.place}</span>}
        {hasRange && <span className="glance-meta glance-range">{`H ${deg(w.high!)}  L ${deg(w.low!)}`}</span>}
      </span>
      {/* The data licence (CC BY 4.0) asks for credit; it is always visible. */}
      <a className="glance-credit" href="https://open-meteo.com/" target="_blank" rel="noreferrer noopener">
        Open-Meteo
      </a>
    </div>
  );
}

export default function GlanceStrip({ info }: { info: WidgetsInfo }) {
  return (
    <div className="glance-strip" data-testid="glance-strip">
      {info.clock.enabled && <Clock hour12={info.clock.hour12} />}
      {info.weather.enabled && <Weather w={info.weather} />}
    </div>
  );
}
