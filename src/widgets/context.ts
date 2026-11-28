import { createContext } from 'react';
import type { WidgetsInfo } from './widgetsInfo';

// SPEC-status-widgets AC-031 / SPEC-health-widget OQ-2 — whether this viewer
// sees the numbers on tiles. Home provides visibleWidgets(...).tiles: the
// person hasn't hidden `tiles`, and never for a kid (Q3 a). Defaults to on, so
// an isolated grid render shows what the data says.
export const ShowWidgetsContext = createContext(true);

// GET /api/widgets/info, shared by the widget area and the ⌘K web row. null
// until it loads, or when it can't be read (both then render as off).
export const WidgetsInfoContext = createContext<WidgetsInfo | null>(null);
