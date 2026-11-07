// SPEC-status-widgets §7.3 — the session read of the info widgets (clock,
// weather, web search), plus the one small fetch helper the widget modules
// share. Kept apart from ../api on purpose: many suites replace ../api with a
// factory mock, and a module those mocks don't know about must not break them.

export type WeatherCondition = 'clear' | 'partly_cloudy' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm';

export type WidgetsInfo = {
  clock: { enabled: boolean; hour12: boolean | null };
  weather: {
    enabled: boolean;
    state: 'loading' | 'ok' | 'stale' | 'error';
    asOf: string | null;
    place: string;
    units: 'c' | 'f';
    temp?: number;
    high?: number;
    low?: number;
    condition?: WeatherCondition;
    isDay?: boolean;
  };
  // `kids` is present for an admin session only (the kid web-search switch).
  search: { enabled: boolean; name: string; url: string; kids?: boolean };
};

export type Call = { status: number; data: unknown };

// call — JSON in, JSON out. A network failure is status 0, never a throw, so
// every caller has one failure path.
export async function call(path: string, method = 'GET', body?: unknown): Promise<Call> {
  const init: RequestInit = { method, credentials: 'include' };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  try {
    const res = await fetch(path, init);
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      /* empty or non-JSON body */
    }
    return { status: res.status, data };
  } catch {
    return { status: 0, data: null };
  }
}

// fetchWidgetsInfo — null on any failure or an unexpected shape, which every
// consumer treats as "all off": the strip never shows an error to viewers.
export async function fetchWidgetsInfo(): Promise<WidgetsInfo | null> {
  const { status, data } = await call('/api/widgets/info');
  const d = data as Partial<WidgetsInfo> | null;
  if (status !== 200 || !d || !d.clock || !d.weather || !d.search) return null;
  return d as WidgetsInfo;
}

// saveShowWidgets — PATCH /api/me {showWidgets}; true on 200.
export async function saveShowWidgets(show: boolean): Promise<boolean> {
  return (await call('/api/me', 'PATCH', { showWidgets: show })).status === 200;
}
