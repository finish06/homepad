import { lazy, Suspense } from 'react';
import StatusBar from './StatusBar';
import ChunkErrorBoundary from '../ui/ChunkErrorBoundary';
import { CONTENT_WIDTH } from '../lib/layout';
import type { Visible } from '../widgets/visibleWidgets';
import type { WidgetsInfo } from '../widgets/widgetsInfo';

// SPEC-health-widget §4.5 — one widget area for clock, weather and health,
// above the grid. It replaces 18.7's slim glance strip plus the separate health
// panel. Each widget is a slot with the same glass frame (`.widget`) and its
// own test id; which slots exist comes from visibleWidgets (AC-015), so this
// component, App and My settings can't disagree.
//
// Health stays in the entry chunk (StatusBar). The clock and weather bodies
// stay lazy (GlanceStrip), but their slots are here with fixed minimum
// heights, so a slot has its size before its chunk arrives (#745). A failed
// chunk keeps the silent boundary; the slot collapses only after the failure.
//
// The layout (one row at 1024px and up, health below from 721 to 1023px) is
// a proposal for Kare to sign off (OQ-3); it lives in index.css.
const GlanceStrip = lazy(() => import('./GlanceStrip'));

// The weather body draws only with a reading. While it is loading (or before
// the first info read answers, when the cache says weather is on) its slot is
// reserved; an error, or a first read that failed, drops the slot, since
// viewers never see a weather error.
function weatherSlot(info: WidgetsInfo | null, infoAnswered: boolean): boolean {
  if (!info) return !infoAnswered;
  const w = info.weather;
  if (w.state === 'loading') return true;
  return (w.state === 'ok' || w.state === 'stale') && typeof w.temp === 'number';
}

export default function WidgetArea({
  visible,
  info,
  infoAnswered = false,
  canRetry,
}: {
  visible: Visible;
  info: WidgetsInfo | null;
  // Whether /api/widgets/info has answered yet, good or not.
  infoAnswered?: boolean;
  canRetry: boolean;
}) {
  const clock = visible.clock;
  const weather = visible.weather && weatherSlot(info, infoAnswered);
  const healthOn = visible.health;
  // AC-023 — with nothing visible the area renders no element, so there is
  // no empty card and no gap above the grid.
  if (!clock && !weather && !healthOn) return null;

  return (
    <div className={CONTENT_WIDTH}>
      <div className="widget-area" data-testid="widget-area" data-health={healthOn ? 'on' : 'off'}>
        {clock && (
          <ChunkErrorBoundary silent>
            <div className="widget widget--clock" data-testid="widget-clock">
              <Suspense fallback={null}>
                <GlanceStrip info={info} part="clock" />
              </Suspense>
            </div>
          </ChunkErrorBoundary>
        )}
        {weather && (
          <ChunkErrorBoundary silent>
            <div className="widget widget--weather" data-testid="widget-weather">
              <Suspense fallback={null}>
                <GlanceStrip info={info} part="weather" />
              </Suspense>
            </div>
          </ChunkErrorBoundary>
        )}
        {healthOn && (
          <div className="widget widget--health" data-testid="widget-health">
            <StatusBar showDetails={visible.healthDetails} canRetry={canRetry} />
          </div>
        )}
      </div>
    </div>
  );
}
