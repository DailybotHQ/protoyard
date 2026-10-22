import type { DomainEvent, EventApplyContext, Row, TimelineContext } from '@protoyard/core';
import { parseScenario } from '@protoyard/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyTimelineEvent,
  clearTimelineSources,
  collectTimelineEvents,
  DEFAULT_TIMELINE_SOURCE_MAX_EVENTS,
  dailyEvents,
  dayRng,
  listTimelineSources,
  localDayBounds,
  localDayOf,
  localTimeToUtc,
  registerTimelineSource,
  timelineFromSources,
  unregisterTimelineSource,
  zonedInstantMs,
} from '../src/timeline.ts';

const REF = '2026-10-14T12:00:00.000Z';
const scenario = parseScenario({
  id: 'timeline-demo',
  name: 'Timeline demo',
  seed: 42,
  referenceTime: REF,
});

function emptyCtx(from: string, to: string): TimelineContext {
  return {
    scenario,
    rng: dayRng({ scenario }, from.slice(0, 10)),
    faker: null as never,
    ids: { next: (k: string) => `${k}_1` } as never,
    time: null as never,
    scale: (n: number) => n,
    from: new Date(from),
    to: new Date(to),
    read: async () => [],
  };
}

function event(
  id: string,
  type: string,
  at: string,
  payload: Record<string, unknown> = {}
): DomainEvent {
  return { id, type, at, payload, source: 'timeline' };
}

afterEach(() => {
  clearTimelineSources();
});

describe('dailyEvents', () => {
  it('is window-independent and deterministic for the same seed', () => {
    const make = () =>
      dailyEvents(
        { scenario, from: new Date('2026-10-14T00:00:00Z'), to: new Date('2026-10-21T00:00:00Z') },
        {
          perDay: 2,
          make: ({ index, at }) => ({
            type: 'demo.tick',
            payload: { index, at: at.toISOString() },
          }),
        }
      );
    const week = make();
    expect(make()).toEqual(week);
    expect(week.length).toBeGreaterThan(0);

    const daily: DomainEvent[] = [];
    for (let d = 0; d < 7; d++) {
      const from = new Date(Date.UTC(2026, 9, 14 + d));
      const to = new Date(Date.UTC(2026, 9, 15 + d));
      daily.push(
        ...dailyEvents(
          { scenario, from, to },
          {
            perDay: 2,
            make: ({ index, at }) => ({
              type: 'demo.tick',
              payload: { index, at: at.toISOString() },
            }),
          }
        )
      );
    }
    expect(daily.map((e) => e.id)).toEqual(week.map((e) => e.id));
  });
});

describe('local time zone helpers', () => {
  it('requires an explicit IANA zone and rejects unknown ids', () => {
    expect(() => localTimeToUtc('2026-10-14', '09:00', '')).toThrow(/required/i);
    expect(() => localTimeToUtc('2026-10-14', '09:00', 'Not/AZone')).toThrow(/unknown time zone/i);
    expect(() => localDayOf(REF, '   ')).toThrow(/required/i);
  });

  it('converts fixed-offset and seasonal zones the way cast schedules need', () => {
    expect(localTimeToUtc('2026-10-14', '09:00', 'America/Bogota').toISOString()).toBe(
      '2026-10-14T14:00:00.000Z'
    );
    expect(localTimeToUtc('2026-10-14', '09:00', 'Europe/Madrid').toISOString()).toBe(
      '2026-10-14T07:00:00.000Z'
    );
    expect(localTimeToUtc('2026-10-14', '09:00', 'UTC').toISOString()).toBe(
      '2026-10-14T09:00:00.000Z'
    );
    expect(localTimeToUtc('2026-10-14', '09:00:30', 'UTC').toISOString()).toBe(
      '2026-10-14T09:00:30.000Z'
    );
  });

  it('moves a spring-forward gap forward and takes the earlier fall-back fold', () => {
    const ny = (month: number, day: number, hour: number, minute: number) =>
      new Date(
        zonedInstantMs({ year: 2026, month, day, hour, minute, second: 0 }, 'America/New_York')
      ).toISOString();
    // 2026-03-08 02:30 EST does not exist → 03:30 EDT = 07:30Z
    expect(ny(3, 8, 2, 30)).toBe('2026-03-08T07:30:00.000Z');
    expect(localTimeToUtc('2026-03-08', '02:30', 'America/New_York').toISOString()).toBe(
      '2026-03-08T07:30:00.000Z'
    );
    // 2026-11-01 01:30 happens twice → earlier (EDT) = 05:30Z
    expect(ny(11, 1, 1, 30)).toBe('2026-11-01T05:30:00.000Z');
    expect(localTimeToUtc('2026-11-01', '01:30', 'America/New_York').toISOString()).toBe(
      '2026-11-01T05:30:00.000Z'
    );
    // Berlin spring / fall
    expect(localTimeToUtc('2026-03-29', '02:30', 'Europe/Berlin').toISOString()).toBe(
      '2026-03-29T01:30:00.000Z'
    );
    expect(localTimeToUtc('2026-10-25', '02:30', 'Europe/Berlin').toISOString()).toBe(
      '2026-10-25T00:30:00.000Z'
    );
  });

  it('reports civil days and 23/25-hour DST day bounds', () => {
    // Just after local midnight in New York on a normal day.
    expect(localDayOf('2026-06-01T04:00:00.000Z', 'America/New_York')).toBe('2026-06-01');
    // 2026-03-08 01:30 EST is still the 8th; 03:30 EDT is still the 8th.
    expect(localDayOf('2026-03-08T06:30:00.000Z', 'America/New_York')).toBe('2026-03-08');
    expect(localDayOf('2026-03-08T07:30:00.000Z', 'America/New_York')).toBe('2026-03-08');
    // Late evening in Tokyo is the next UTC day.
    expect(localDayOf('2026-10-14T15:00:00.000Z', 'Asia/Tokyo')).toBe('2026-10-15');

    const spring = localDayBounds('2026-03-08', 'America/New_York');
    const fall = localDayBounds('2026-11-01', 'America/New_York');
    const normal = localDayBounds('2026-06-01', 'America/New_York');
    expect(spring.durationMs / 3_600_000).toBe(23);
    expect(fall.durationMs / 3_600_000).toBe(25);
    expect(normal.durationMs / 3_600_000).toBe(24);
  });
});

describe('timeline source registry', () => {
  it('registers by stable id, sorts by at then id, and dispatches appliers', async () => {
    const applied: string[] = [];
    registerTimelineSource({
      id: 'beta',
      collect: async () => [
        event('evt:b-late', 'beta.tick', '2026-10-14T12:00:00.000Z'),
        event('evt:b-early', 'beta.tick', '2026-10-14T09:00:00.000Z'),
      ],
      apply: {
        'beta.tick': async (e) => {
          applied.push(`beta:${e.id}`);
        },
      },
    });
    registerTimelineSource({
      id: 'alpha',
      collect: async () => [
        event('evt:a-mid', 'alpha.tick', '2026-10-14T10:00:00.000Z'),
        event('evt:a-same', 'alpha.tick', '2026-10-14T09:00:00.000Z'),
      ],
      apply: {
        'alpha.tick': async (e) => {
          applied.push(`alpha:${e.id}`);
        },
      },
    });

    expect(listTimelineSources()).toEqual(['beta', 'alpha']);

    const ctx = emptyCtx('2026-10-14T00:00:00.000Z', '2026-10-15T00:00:00.000Z');
    const once = await collectTimelineEvents(ctx);
    const twice = await collectTimelineEvents(ctx);
    expect(twice.events.map((e) => e.id)).toEqual(once.events.map((e) => e.id));
    expect(once.events.map((e) => e.id)).toEqual([
      'evt:a-same',
      'evt:b-early',
      'evt:a-mid',
      'evt:b-late',
    ]);
    expect(once.truncated).toBe(false);
    expect(once.sources.sort()).toEqual(['alpha', 'beta']);

    const store: EventApplyContext = {
      put: async () => undefined,
      get: async () => undefined,
      remove: async () => undefined,
    };
    for (const e of once.events) {
      expect(await applyTimelineEvent(e, store)).toBe(true);
    }
    expect(await applyTimelineEvent(event('x', 'unknown.kind', REF), store)).toBe(false);
    expect(applied).toEqual([
      'alpha:evt:a-same',
      'beta:evt:b-early',
      'alpha:evt:a-mid',
      'beta:evt:b-late',
    ]);
  });

  it('rejects duplicate source ids and event types', () => {
    registerTimelineSource({
      id: 'one',
      collect: async () => [],
      apply: { 'kit.ping': async () => undefined },
    });
    expect(() => registerTimelineSource({ id: 'one', collect: async () => [] })).toThrow(
      /already registered/
    );
    expect(() =>
      registerTimelineSource({
        id: 'two',
        collect: async () => [],
        apply: { 'kit.ping': async () => undefined },
      })
    ).toThrow(/kit\.ping/);
  });

  it('bounds per-source and total output and reports truncation', async () => {
    registerTimelineSource({
      id: 'noisy',
      maxEvents: 2,
      collect: async () => [
        event('n3', 'n.tick', '2026-10-14T12:00:00.000Z'),
        event('n1', 'n.tick', '2026-10-14T08:00:00.000Z'),
        event('n2', 'n.tick', '2026-10-14T10:00:00.000Z'),
      ],
    });
    registerTimelineSource({
      id: 'other',
      collect: async () => [
        event('o1', 'o.tick', '2026-10-14T09:00:00.000Z'),
        event('o2', 'o.tick', '2026-10-14T11:00:00.000Z'),
      ],
    });

    const ctx = emptyCtx('2026-10-14T00:00:00.000Z', '2026-10-15T00:00:00.000Z');
    const perSource = await collectTimelineEvents(ctx);
    expect(perSource.truncated).toBe(true);
    // noisy kept the two earliest after its own sort
    expect(perSource.events.map((e) => e.id)).toEqual(['n1', 'o1', 'n2', 'o2']);

    const total = await collectTimelineEvents(ctx, { maxEvents: 3 });
    expect(total.truncated).toBe(true);
    expect(total.events.map((e) => e.id)).toEqual(['n1', 'o1', 'n2']);
    expect(DEFAULT_TIMELINE_SOURCE_MAX_EVENTS).toBeGreaterThan(0);
  });

  it('throws on duplicate event ids across sources', async () => {
    registerTimelineSource({
      id: 'a',
      collect: async () => [event('same', 'a.t', '2026-10-14T09:00:00.000Z')],
    });
    registerTimelineSource({
      id: 'b',
      collect: async () => [event('same', 'b.t', '2026-10-14T10:00:00.000Z')],
    });
    await expect(
      collectTimelineEvents(emptyCtx('2026-10-14T00:00:00.000Z', '2026-10-15T00:00:00.000Z'))
    ).rejects.toThrow(/Duplicate timeline event id "same"/);
  });

  it('unregister and clear restore a clean registry', () => {
    const stop = registerTimelineSource({ id: 'temp', collect: async () => [] });
    expect(listTimelineSources()).toEqual(['temp']);
    stop();
    expect(listTimelineSources()).toEqual([]);
    registerTimelineSource({ id: 'again', collect: async () => [] });
    clearTimelineSources();
    expect(listTimelineSources()).toEqual([]);
    unregisterTimelineSource('missing'); // no-op
  });

  it('timelineFromSources wires collect + apply for definePrototype', async () => {
    const rows = new Map<string, Row>();
    registerTimelineSource({
      id: 'kit',
      collect: async () => [event('evt:1', 'kit.done', '2026-10-14T09:00:00.000Z', { n: 1 })],
      apply: {
        'kit.done': async (e, ctx) => {
          await ctx.put('notes', { id: e.id, n: (e.payload as { n: number }).n } as Row);
        },
      },
    });
    const { timeline, applyEvent } = timelineFromSources();
    const events = await timeline(emptyCtx('2026-10-14T00:00:00.000Z', '2026-10-15T00:00:00.000Z'));
    expect(events).toHaveLength(1);
    await applyEvent(events[0] as DomainEvent, {
      put: async (_t, row) => {
        rows.set(row.id, row);
      },
      get: async () => undefined,
      remove: async () => undefined,
    });
    expect(rows.get('evt:1')).toEqual({ id: 'evt:1', n: 1 });
  });
});
