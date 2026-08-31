# Spec: Status Alert History (v17)

**Version:** 1.0.0
**Created:** 2026-06-26
**Author:** Walt (product lead)
**Status:** Shipped — v12.1.0 (2026-06-28, PR #168)
**Repo:** `Code/homepad` (frontend only; no backend changes)

---

## 1. Overview

### The problem

Status-change toast notifications (cap5) auto-dismiss in four seconds. A user in another browser
tab, momentarily distracted, or monitoring multiple dashboards has no way to review which services
changed state since they last looked. The toast is gone, and the catalog looks exactly the same as
always — UP dots are green, DOWN dots are red, but there's no signal about what *just changed* and
when.

### The solution

A **session-persistent in-memory alert history** — a log of status change events captured by the
existing 60-second polling cycle — accessible from a **bell icon in the app header**. The bell
shows an unread-count badge so users know at a glance whether anything happened while they were
away. Clicking it opens a compact overlay listing every transition in reverse chronological order,
with service names, status-change arrows, and timestamps.

No backend changes. No persistence across page reloads. Deliberately lightweight: the history lives
for the current page session only, and the only state that matters is "was the user paying
attention?"

### User story

As a homelab operator, when I return to homepad after being away, I want to immediately know
whether any service changed state while I wasn't watching — and be able to review exactly what
changed, in what order, without opening a terminal or checking a monitoring dashboard.

### Why this now

- Cap5 toasts are the right design for *live* interruptions. Alert History is the right design for
  *async review*. They are complementary, not redundant.
- The 60-second poll already diffs service states to fire toasts; the data for a history log is
  already being produced. This feature is essentially a running ledger of what ServicesProvider
  already detects.
- The overlay/panel pattern and the status-dot color system are fully established — no new design
  language needed. Implementation risk is low; user value is high.

---

## 2. Feature summary

| Component | Description |
|---|---|
| Bell icon | Added to `AppHeader`, right of the ⌘K trigger button and left of the avatar. Small, quiet icon — no visual weight when badge is 0. |
| Unread badge | Numeric bubble on the bell when count > 0. Capped at "99+" display. Clears on panel open. |
| Alert History panel | Same overlay pattern as the ⌘K launcher (`.launcher-overlay` scrim + panel shell). Keyboard-accessible, Escape-to-close, focus-returning. |
| Event row | Timestamp · Service name (clickable → opens in new tab) · Status transition arrow (from-dot → to-dot using existing status colors) |
| Empty state | "No alerts yet. Status changes will appear here while this page is open." |
| History scope | In-memory only. Last 50 events. Resets on page reload or logout. |

---

## 3. Data model

```typescript
// One captured status-change event
interface AlertEvent {
  id: string;           // unique per event (crypto.randomUUID() or Date.now() + index)
  serviceId: string;
  serviceName: string;
  serviceUrl: string;
  prevStatus: ServiceStatus;  // same type as existing status field
  newStatus: ServiceStatus;
  ts: number;           // epoch ms when the poll that detected this change completed
}
```

**Storage:** A React context (`AlertHistoryContext`) exposes the event log as `AlertEvent[]`, the
unread badge count as a number, and a `clearBadge()` function. The provider wraps the `Home`
component (alongside existing providers). The event log is `useState<AlertEvent[]>([])` — in-memory,
no localStorage.

**Sourcing events:** ServicesProvider's existing status-diff logic (the same code path that fires
toast notifications) calls `pushAlertEvent(event)` from the context whenever it detects a
transition. Initial page load (first poll, no previous state to diff) does NOT fire events.

**Ring buffer:** When the log would exceed 50 entries, the oldest entry is dropped before appending
the new one.

---

## 4. Acceptance criteria

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-001 | A bell icon button (`data-testid="alert-bell"`) appears in `AppHeader`, to the right of the ⌘K trigger and to the left of the avatar. It is visible to all logged-in users regardless of admin/user role. | Must |
| AC-002 | When unread count is 0, the bell icon shows no badge. When unread count is ≥ 1, a numeric bubble appears on the bell showing the count. When count > 99, the bubble shows `99+`. The bell has `aria-label="Alert history"` when badge is 0 and `aria-label="Alert history, N unread"` (where N is the count) when badge > 0. | Must |
| AC-003 | A status change event is recorded whenever ServicesProvider's polling detects that a service's `status` field changed from one non-null value to another (covering all transitions: UP↔DOWN, UP↔DEGRADED, DOWN↔UNKNOWN, NOT_MONITORED→UP, etc.). A service whose status is identical across two consecutive polls does NOT generate an event. | Must |
| AC-004 | The first poll after page load (no prior state to compare against) does NOT generate any alert events, even if services are DOWN. Events are only generated from poll-to-poll state transitions. | Must |
| AC-005 | The in-memory log holds at most 50 events. Adding a 51st event drops the oldest. Older events are never surfaced in the UI once dropped. | Should |
| AC-006 | Clicking the bell icon opens the Alert History panel. The panel has `role="dialog"`, `aria-modal="true"`, and visible title "Alert History". The panel closes on: Escape key, backdrop click (if rendered), ✕ close button click, or a second bell click. Focus returns to the bell button on close. | Must |
| AC-007 | On panel open, the unread badge resets to 0. The event list itself is NOT cleared — events remain visible after the badge clears. | Must |
| AC-008 | Inside the panel, events are rendered newest-first. Each event row contains: (a) the service name as readable text, (b) a status-transition indicator showing the previous and new status using colored dots matching the existing tile dot color system (`emerald-500` UP, `red-500` DOWN, `amber-400` DEGRADED, neutral UNKNOWN, neutral dashed NOT_MONITORED), with an arrow between them (e.g. `● → ●`), (c) a relative or absolute timestamp (e.g. "2 min ago" or "14:35"), (d) an external-link icon or "Visit" button that opens `serviceUrl` in a new tab (`target="_blank" rel="noopener noreferrer"`). | Must |
| AC-009 | The panel is reachable entirely by keyboard: Tab from adjacent header elements reaches the bell button; Enter or Space opens the panel; Tab/arrow keys navigate focusable elements within the panel; Escape closes and returns focus to the bell. | Must |
| AC-010 | When the log is empty (no events recorded this session), the panel body shows: "No alerts yet. Status changes will appear here while this page is open." in muted, centered text. | Must |
| AC-011 | The panel's visual chrome matches the existing overlay style (`.launcher-overlay` scrim + panel shell with `14px border-radius`, dark shadow, white/`neutral-900` surface, `border-neutral-200/neutral-700` border). Max-height `clamp(320px, 75vh, 560px)`. Content scrolls internally; header (title + close button) stays fixed. | Should |
| AC-012 | On mobile (< 640 px), the panel is near-full-screen width. Event rows remain readable at 390 px. No content is horizontally cut off. | Must |
| AC-013 | Alert history is in-memory only. On page unload (hard refresh, navigation away, logout) the history is lost. No localStorage, no IndexedDB, no backend call. | Must |
| AC-014 | The bell/panel does not conflict with existing overlays (z-index hierarchy: tiles `z-10`, header `z-20`, user-menu `z-50`, alert panel `z-60`, ⌘K launcher `z-60`). Only one overlay is open at a time — opening the alert panel closes any other open overlay, and vice versa. | Must |
| AC-015 | `npm test` passes. New Vitest tests cover at minimum: (a) bell renders with no badge at 0 events, (b) badge shows correct count at N > 0 events, (c) badge shows "99+" at 100 events, (d) panel opens on bell click, (e) panel title is "Alert History", (f) panel closes on Escape, (g) empty-state text renders when log is empty, (h) event rows render with service name, transition, and timestamp when events exist, (i) badge resets to 0 on panel open. **TDD: red tests committed first, then implementation.** | Must |

---

## 5. User test cases

### TC-001: Bell is quiet at rest

**Precondition:** User just logged in; no polling cycle has completed yet.

**Steps:** Look at the app header.

**Expected:** Bell icon is visible, no badge bubble. Icon does not attract undue attention.

**Maps to:** AC-001, AC-002

---

### TC-002: Service goes DOWN while user is watching

**Precondition:** A service transitions from UP to DOWN on the next poll.

**Steps:**
1. Wait for the 60-second poll to fire.
2. Observe the header bell.

**Expected:** Badge appears with count 1. (Toast may also appear per cap5 behavior, independently.)

**Maps to:** AC-003, AC-002

---

### TC-003: Away and back — reviewing missed alerts

**Precondition:** User switches to another tab; two services cycle DOWN and one recovers during
the interval (3 total status change events).

**Steps:**
1. Return to homepad tab.
2. Observe bell — shows badge "3".
3. Click bell.

**Expected:** Panel opens showing 3 events, newest first. Badge clears to 0. Event list remains.

**Maps to:** AC-006, AC-007, AC-008

---

### TC-004: Empty state

**Precondition:** User has been on homepad for 10 minutes; no service has changed state.

**Steps:**
1. Click the bell.

**Expected:** Panel opens. Body shows "No alerts yet. Status changes will appear here while this
page is open." in muted text. No event rows.

**Maps to:** AC-010

---

### TC-005: Visit service from alert

**Precondition:** Panel is open with at least one event.

**Steps:**
1. Click the external-link button on any event row.

**Expected:** Service URL opens in a new tab. Panel remains open.

**Maps to:** AC-008(d)

---

### TC-006: Keyboard access end-to-end

**Precondition:** User is on the dashboard, not in an overlay.

**Steps:**
1. Tab to the bell icon.
2. Press Enter.
3. Panel opens. Tab through event rows.
4. Press Escape.

**Expected:** Panel opens and closes correctly; focus returns to bell after Escape.

**Maps to:** AC-009, AC-006

---

## 6. Out of scope

- Persisting history to localStorage, IndexedDB, or backend — resets on reload by design.
- Marking individual events as read/unread — the whole log is marked read when the panel is opened.
- Filtering or searching the alert history.
- Push/browser notifications (Web Notifications API) — in-panel only.
- Audio or vibration alerts.
- Alert events for non-status changes (login events, settings changes, etc.).
- A separate dedicated "alerts" route or page.
- Email or external webhook delivery.
- Pagination of the event list beyond the 50-event cap.

---

## 7. Implementation guidance

### Provider location

A new `AlertHistoryContext` + `useAlertHistory` hook in `src/alerts.tsx`. The provider wraps
`Home` in `App.tsx`, alongside existing providers (ThemeProvider, LauncherProvider,
ServicesProvider). It exposes:

```typescript
interface AlertHistoryContext {
  events: AlertEvent[];          // newest-first, max 50
  unreadCount: number;           // events since last clearBadge()
  pushEvent: (e: AlertEvent) => void;
  clearBadge: () => void;
}
```

`ServicesProvider` imports `useAlertHistory` and calls `pushEvent()` from the same diff loop
that fires toasts. Stitch's call on exact wiring (callback prop vs. context hook vs. shared
event emitter) — any of these patterns is acceptable as long as the test coverage in AC-015 passes.

### Bell icon placement in `AppHeader.tsx`

`AppHeader` currently accepts props for edit-mode toggle and launcher trigger. Add props for
`alertCount: number` and `onAlertClick: () => void`. Render a `<button data-testid="alert-bell">`
between the existing ⌘K button and the avatar button.

### Panel component

`src/AlertHistoryPanel.tsx` — follows the same overlay pattern as `CommandLauncher.tsx`:

```tsx
<div className="launcher-overlay" onClick={handleBackdropClick}>
  <div role="dialog" aria-modal="true" aria-label="Alert History"
       className="launcher-panel alert-history-panel"
       onClick={e => e.stopPropagation()}>
    <header>Alert History <button onClick={onClose}>✕</button></header>
    <ul role="list">
      {events.map(e => <AlertRow key={e.id} event={e} />)}
    </ul>
  </div>
</div>
```

### Status dot colors in the panel

Reuse the same color mapping used in `Catalog.tsx` tiles and `StatusBar.tsx`:
- `UP` → `bg-emerald-500 shadow-[0_0_6px_#10b981]`
- `DOWN` → `bg-red-500 shadow-[0_0_6px_#ef4444]`
- `DEGRADED` → `bg-amber-400 shadow-[0_0_6px_#fbbf24]`
- `UNKNOWN` → `bg-neutral-300 dark:bg-neutral-500`
- `NOT_MONITORED` → `border-2 border-neutral-400 dark:border-neutral-500 rounded-full` (hollow ring)

Extract into a shared helper `statusDotClass(status: ServiceStatus): string` if not already one.

---

## 8. Success metric

After shipping, a homepad operator who returns from a 30-minute absence can look at the header bell,
see the badge count, open the history panel, and know the full picture of what changed state — all
within 10 seconds, without opening a terminal or navigating to a separate tool. Operators stop
saying "I saw a toast flash but didn't catch which service it was."
