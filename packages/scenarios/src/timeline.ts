import {
  createRng,
  type DomainEvent,
  eventId,
  type GenerateContext,
  MS_PER_DAY,
  MS_PER_HOUR,
  type Rng,
} from '@protoyard/core';

/**
 * Timeline helpers for `scenarios.advance()`. The key property is window
 * independence: everything about a day (how many events, when, what) is
 * derived from scenario seed + day, never from the requested window. So
 * advancing 7 days at once or 1 day seven times yields the very same events,
 * with the same ids, and replaying a window is a no-op.
 */

export interface DaySlot {
  /** UTC midnight of the day. */
  day: Date;
  /** `YYYY-MM-DD` */
  isoDay: string;
  /** Position of the event within its day (stable, sorted by time). */
  index: number;
  /** Instant of the event. */
  at: Date;
  /** Rng private to this slot — stable whatever the window. */
  rng: Rng;
}

export interface DailyEventsOptions<TPayload> {
  /** Exclusive start. Defaults to `ctx.from` for timeline contexts. */
  from?: Date;
  /** Inclusive end. Defaults to `ctx.to` for timeline contexts. */
  to?: Date;
  /** Events per day, or a function of the day (use `day.rng`, not Math.random). */
  perDay: number | ((day: { day: Date; isoDay: string; rng: Rng }) => number);
  /** Builds the event for a slot; return `null` to leave the slot empty. */
  make: (slot: DaySlot) => { type: string; payload: TPayload; actorId?: string } | null;
  /** UTC hour range events fall into (default business hours 8–18). */
  hours?: readonly [number, number];
}

type TimelineLike = Pick<GenerateContext, 'scenario'> & { from?: Date; to?: Date };

export function dayRng(ctx: Pick<GenerateContext, 'scenario'>, isoDay: string): Rng {
  return createRng(`protoyard:timeline:${ctx.scenario.id}:${ctx.scenario.seed}:${isoDay}`);
}

export function dailyEvents<TPayload = unknown>(
  ctx: TimelineLike,
  options: DailyEventsOptions<TPayload>
): DomainEvent<TPayload>[] {
  const from = options.from ?? ctx.from;
  const to = options.to ?? ctx.to;
  if (!from || !to) throw new RangeError('dailyEvents(): "from" and "to" are required');
  const fromMs = from.getTime();
  const toMs = to.getTime();
  if (toMs <= fromMs) return [];
  const [startHour, endHour] = options.hours ?? [8, 18];
  if (!(startHour >= 0 && endHour <= 24 && endHour > startHour)) {
    throw new RangeError('dailyEvents(): hours must satisfy 0 <= start < end <= 24');
  }

  const events: DomainEvent<TPayload>[] = [];
  const firstDay = Math.floor(fromMs / MS_PER_DAY) * MS_PER_DAY;
  for (let dayMs = firstDay; dayMs <= toMs; dayMs += MS_PER_DAY) {
    const day = new Date(dayMs);
    const isoDay = day.toISOString().slice(0, 10);
    const rng = dayRng(ctx, isoDay);
    const count = Math.max(
      0,
      Math.floor(
        typeof options.perDay === 'number'
          ? options.perDay
          : options.perDay({ day, isoDay, rng: rng.fork('count') })
      )
    );
    const spanMs = (endHour - startHour) * MS_PER_HOUR;
    const times = Array.from({ length: count }, () =>
      Math.floor(dayMs + startHour * MS_PER_HOUR + rng.next() * spanMs)
    ).sort((a, b) => a - b);

    times.forEach((atMs, index) => {
      if (atMs <= fromMs || atMs > toMs) return;
      const at = new Date(atMs);
      const made = options.make({ day, isoDay, index, at, rng: rng.fork(`slot:${index}`) });
      if (!made) return;
      events.push({
        id: eventId(ctx.scenario.id, day, index),
        type: made.type,
        at: at.toISOString(),
        ...(made.actorId ? { actorId: made.actorId } : {}),
        payload: made.payload,
        source: 'timeline',
      });
    });
  }
  return events;
}
