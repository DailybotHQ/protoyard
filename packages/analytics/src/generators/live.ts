import { type DomainEvent, type GenerateContext } from '@protoyard/core';
import { dailyEvents } from '@protoyard/scenarios';
import { WEEKDAY_WEIGHT } from './random.ts';

export interface LiveCounterPayload {
  counter: string;
  delta: number;
}

export interface LiveCounterOptions {
  /** Counter name in the payload, e.g. `'active_users'`. */
  counter: string;
  /** Event type (default `analytics.counter`). */
  type?: string;
  /** Mean events per weekday (weekends are quieter). */
  perDay: number;
  /** Largest increment per event (default 3). */
  maxDelta?: number;
  hours?: readonly [number, number];
  from?: Date;
  to?: Date;
}

/**
 * Timeline events for live counters (`timeline(ctx)` in a prototype). Built
 * on `dailyEvents`: each day's count, times and deltas come from the
 * scenario seed and the day only, so advancing seven days at once yields the
 * same events, with the same ids, as advancing one day seven times.
 */
export function liveCounterEvents(
  ctx: Pick<GenerateContext, 'scenario'> & { from?: Date; to?: Date },
  options: LiveCounterOptions
): DomainEvent<LiveCounterPayload>[] {
  const maxDelta = Math.max(1, options.maxDelta ?? 3);
  return dailyEvents<LiveCounterPayload>(ctx, {
    ...(options.from ? { from: options.from } : {}),
    ...(options.to ? { to: options.to } : {}),
    ...(options.hours ? { hours: options.hours } : {}),
    perDay: ({ day, rng }) =>
      Math.round(
        options.perDay * (WEEKDAY_WEIGHT[day.getUTCDay()] as number) * (0.8 + 0.4 * rng.next())
      ),
    make: ({ rng }) => ({
      type: options.type ?? 'analytics.counter',
      payload: { counter: options.counter, delta: rng.int(1, maxDelta) },
    }),
  });
}
