// SPEC-status-widgets AC-011 — widget values update on the live 60s poll with no
// reload. mergeStatuses used to copy ONLY status and uptimeChecks, so a new
// per-tile field was silently dropped on every poll. It now carries `widget`,
// with the same render contract v13 set: a changed value gives exactly that
// tile a new object, and a poll where nothing changed returns the SAME array.
import { describe, expect, it } from 'vitest';
import { memo } from 'react';
import { render } from '@testing-library/react';
import { mergeStatuses } from './services';
import type { Service, TileWidget } from './api';

function widget(value: number, over: Partial<TileWidget> = {}): TileWidget {
  return {
    kind: 'sonarr',
    state: 'ok',
    asOf: '2026-11-07T14:02:11Z',
    fields: [
      { key: 'upcoming', label: 'this week', unit: 'count', value },
      { key: 'queued', label: 'in queue', unit: 'count', value: 1 },
    ],
    ...over,
  };
}

function svc(id: string, w?: TileWidget): Service {
  return {
    id,
    slug: id,
    name: `App ${id}`,
    description: '',
    url: `https://${id}.example.com`,
    icon: '',
    status: 'UP',
    favorite: false,
    iconLight: false,
    iconDark: false,
    ...(w ? { widget: w } : {}),
  };
}

describe('mergeStatuses carries widget (AC-011)', () => {
  it('a changed widget value replaces exactly that tile', () => {
    const cur = [svc('a', widget(3)), svc('b', widget(5)), svc('c')];
    const { next } = mergeStatuses(cur, [svc('a', widget(4)), svc('b', widget(5)), svc('c')]);
    expect(next).not.toBe(cur);
    expect(next[0].widget?.fields[0].value).toBe(4);
    expect(next[0]).not.toBe(cur[0]);
    expect(next[1]).toBe(cur[1]);
    expect(next[2]).toBe(cur[2]);
  });

  it('an unchanged poll returns the same array (no render)', () => {
    const cur = [svc('a', widget(3)), svc('b')];
    // Fresh objects with equal content — what JSON.parse of the next poll gives.
    const { next } = mergeStatuses(cur, [svc('a', widget(3)), svc('b')]);
    expect(next).toBe(cur);
  });

  // The server moves asOf on every successful fetch. An ok line never shows it,
  // so a fresh fetch with the same numbers must not re-render the tile.
  it('an ok widget whose asOf moved but whose numbers did not is unchanged', () => {
    const cur = [svc('a', widget(3))];
    const { next } = mergeStatuses(cur, [svc('a', widget(3, { asOf: '2026-11-07T14:03:11Z' }))]);
    expect(next).toBe(cur);
  });

  it('a stale widget whose asOf moved is a change (its description shows the age)', () => {
    const cur = [svc('a', widget(3, { state: 'stale' }))];
    const { next } = mergeStatuses(cur, [svc('a', widget(3, { state: 'stale', asOf: '2026-11-07T14:03:11Z' }))]);
    expect(next).not.toBe(cur);
    expect(next[0].widget?.asOf).toBe('2026-11-07T14:03:11Z');
  });

  it('a state change (ok → stale) is a change', () => {
    const cur = [svc('a', widget(3))];
    const { next } = mergeStatuses(cur, [svc('a', widget(3, { state: 'stale' }))]);
    expect(next[0].widget?.state).toBe('stale');
  });

  it('a ratio total change is a change', () => {
    const ratio = (total: number): TileWidget => ({
      kind: 'proxmox',
      state: 'ok',
      asOf: null,
      fields: [{ key: 'vms', label: 'VMs', unit: 'ratio', value: 5, total }],
    });
    const cur = [svc('a', ratio(7))];
    expect(mergeStatuses(cur, [svc('a', ratio(8))]).next[0].widget?.fields[0].total).toBe(8);
    expect(mergeStatuses(cur, [svc('a', ratio(7))]).next).toBe(cur);
  });

  it('a widget that appears or goes away is carried (removed → absent)', () => {
    const cur = [svc('a'), svc('b', widget(1))];
    const { next } = mergeStatuses(cur, [svc('a', widget(2)), svc('b')]);
    expect(next[0].widget?.fields[0].value).toBe(2);
    expect(next[1].widget).toBeUndefined();
    expect('widget' in next[1]).toBe(false);
  });

  it('a change in the number of fields is a change', () => {
    const cur = [svc('a', widget(3))];
    const fewer = widget(3);
    fewer.fields = fewer.fields.slice(0, 1);
    expect(mergeStatuses(cur, [svc('a', fewer)]).next[0].widget?.fields).toHaveLength(1);
  });

  it('only one memoised tile re-renders when one widget value changes', () => {
    const renders: Record<string, number> = {};
    const Tile = memo(function Tile({ s }: { s: Service }) {
      renders[s.id] = (renders[s.id] ?? 0) + 1;
      return <span>{s.widget?.fields[0]?.value ?? '-'}</span>;
    });
    const Grid = ({ items }: { items: Service[] }) => (
      <>
        {items.map((s) => (
          <Tile key={s.id} s={s} />
        ))}
      </>
    );
    const cur = [svc('a', widget(3)), svc('b', widget(5)), svc('c', widget(7))];
    const { rerender } = render(<Grid items={cur} />);
    const { next } = mergeStatuses(cur, [svc('a', widget(3)), svc('b', widget(6)), svc('c', widget(7))]);
    rerender(<Grid items={next} />);
    expect(renders).toEqual({ a: 1, b: 2, c: 1 });
  });
});
