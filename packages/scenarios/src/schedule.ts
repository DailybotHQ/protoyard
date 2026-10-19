import { createRng, type GenerateContext, MS_PER_DAY, type Rng } from '@protoyard/core';

/**
 * Bookings and recurring blocks for calendars, timelines and booking flows.
 * Each (resource, day) has its own rng, so a day's slots never depend on the
 * window you ask for, and slots of one resource never overlap.
 */

type ScenarioCtx = Pick<GenerateContext, 'scenario'>;

export type Recurrence = 'daily' | 'weekly' | 'monthly';

/** A fixed block that repeats (stand-up, weekly review, monthly maintenance). */
export interface RecurringBlock {
  label: string;
  every: Recurrence;
  /** UTC start, minutes after midnight (for example 9 × 60 + 30). */
  startMinute: number;
  durationMinutes: number;
  /** Weekly blocks: UTC weekday, 0 = Sunday (default 1, Monday). */
  weekday?: number;
  /** Monthly blocks: day of the month (default 1). */
  dayOfMonth?: number;
  /** Only these resources (default all). */
  resources?: readonly string[];
}

export interface ScheduleOptions {
  ctx: ScenarioCtx;
  /** Resource ids: rooms, stylists, vehicles, providers… */
  resources: readonly string[];
  /** `{ from, to }` or days around the scenario reference time (default 14 / 14). */
  window?: { from: Date; to: Date } | { daysBefore?: number; daysAfter?: number };
  /** UTC opening hours `[open, close)` (default 9–17). */
  businessHours?: readonly [number, number];
  /** UTC weekdays that are open, 0 = Sunday (default Monday–Friday). */
  openDays?: readonly number[];
  /** Grid size in minutes (default 30). */
  slotMinutes?: number;
  /** Booking lengths in grid slots, picked uniformly (default 1, 2 or 4). */
  durations?: readonly number[];
  /**
   * Share of free grid slots that start a booking, in [0, 1], or a function of the day.
   * Default: the scenario's `generators.schedule.occupancy`, else 0.5.
   */
  occupancy?: number | ((day: { isoDay: string; resourceId: string }) => number);
  recurring?: readonly RecurringBlock[];
}

export interface ScheduledSlot {
  /** `slot:<resource>:<YYYY-MM-DD>:<index>`, stable. */
  id: string;
  resourceId: string;
  start: string;
  end: string;
  durationMinutes: number;
  /** The recurring block's label, or null for an ordinary booking. */
  recurring: string | null;
  /** Relative to the scenario reference time. */
  status: 'past' | 'in-progress' | 'upcoming';
}

const MS_PER_MINUTE = 60_000;

export function scheduleRng(ctx: ScenarioCtx, resourceId: string, isoDay: string): Rng {
  return createRng(
    `protoyard:schedule:${ctx.scenario.id}:${ctx.scenario.seed}:${resourceId}:${isoDay}`
  );
}

function windowBounds(ctx: ScenarioCtx, window: ScheduleOptions['window']): [number, number] {
  if (window && 'from' in window) return [window.from.getTime(), window.to.getTime()];
  const ref = Math.floor(Date.parse(ctx.scenario.referenceTime) / MS_PER_DAY) * MS_PER_DAY;
  return [
    ref - (window?.daysBefore ?? 14) * MS_PER_DAY,
    ref + ((window?.daysAfter ?? 14) + 1) * MS_PER_DAY,
  ];
}

/** `generators.schedule.occupancy` from the scenario (the `busy-week` preset sets 0.9), else 0.5. */
export function scenarioOccupancy(ctx: ScenarioCtx): number {
  const knob = (ctx.scenario.generators.schedule as { occupancy?: unknown } | undefined)?.occupancy;
  return typeof knob === 'number' ? knob : 0.5;
}

function recursOn(block: RecurringBlock, day: Date): boolean {
  if (block.every === 'daily') return true;
  if (block.every === 'weekly') return day.getUTCDay() === (block.weekday ?? 1);
  return day.getUTCDate() === (block.dayOfMonth ?? 1);
}

/**
 * Non-overlapping slots per resource inside the window, recurring blocks
 * first, then bookings that fill free grid time at the requested occupancy.
 * Recurring blocks also appear on closed days (maintenance windows).
 */
export function schedule(options: ScheduleOptions): ScheduledSlot[] {
  const slotMinutes = options.slotMinutes ?? 30;
  const [open, close] = options.businessHours ?? [9, 17];
  if (!(open >= 0 && close <= 24 && close > open)) {
    throw new RangeError('schedule(): businessHours must satisfy 0 <= open < close <= 24');
  }
  if (!(Number.isInteger(slotMinutes) && slotMinutes > 0 && slotMinutes <= 240)) {
    throw new RangeError('schedule(): slotMinutes must be an integer between 1 and 240');
  }
  const durations = (options.durations ?? [1, 2, 4]).filter((d) => Number.isInteger(d) && d > 0);
  if (durations.length === 0) throw new RangeError('schedule(): durations needs a positive slot');
  const openDays = new Set(options.openDays ?? [1, 2, 3, 4, 5]);
  const [fromMs, toMs] = windowBounds(options.ctx, options.window);
  const refMs = Date.parse(options.ctx.scenario.referenceTime);
  const gridPerDay = Math.floor(((close - open) * 60) / slotMinutes);

  const slots: ScheduledSlot[] = [];
  for (const resourceId of options.resources) {
    for (
      let dayMs = Math.floor(fromMs / MS_PER_DAY) * MS_PER_DAY;
      dayMs < toMs;
      dayMs += MS_PER_DAY
    ) {
      const day = new Date(dayMs);
      const isoDay = day.toISOString().slice(0, 10);
      const rng = scheduleRng(options.ctx, resourceId, isoDay);
      const taken: Array<[number, number]> = [];
      const daySlots: Array<Omit<ScheduledSlot, 'id' | 'status'>> = [];

      for (const block of options.recurring ?? []) {
        if (block.resources && !block.resources.includes(resourceId)) continue;
        if (!recursOn(block, day)) continue;
        const start = dayMs + block.startMinute * MS_PER_MINUTE;
        const end = start + block.durationMinutes * MS_PER_MINUTE;
        if (taken.some(([s, e]) => start < e && end > s)) continue;
        taken.push([start, end]);
        daySlots.push({
          resourceId,
          start: new Date(start).toISOString(),
          end: new Date(end).toISOString(),
          durationMinutes: block.durationMinutes,
          recurring: block.label,
        });
      }

      if (openDays.has(day.getUTCDay())) {
        const occupancyOption = options.occupancy ?? scenarioOccupancy(options.ctx);
        const occupancy = Math.min(
          1,
          Math.max(
            0,
            typeof occupancyOption === 'number'
              ? occupancyOption
              : occupancyOption({ isoDay, resourceId })
          )
        );
        let cell = 0;
        while (cell < gridPerDay) {
          const length = rng.pick(durations);
          const startsBooking = rng.chance(occupancy);
          const start = dayMs + (open * 60 + cell * slotMinutes) * MS_PER_MINUTE;
          const end = start + length * slotMinutes * MS_PER_MINUTE;
          const fits = cell + length <= gridPerDay && !taken.some(([s, e]) => start < e && end > s);
          if (startsBooking && fits) {
            taken.push([start, end]);
            daySlots.push({
              resourceId,
              start: new Date(start).toISOString(),
              end: new Date(end).toISOString(),
              durationMinutes: length * slotMinutes,
              recurring: null,
            });
            cell += length;
          } else {
            cell += 1;
          }
        }
      }

      daySlots
        .sort((a, b) => a.start.localeCompare(b.start))
        .forEach((slot, index) => {
          const start = Date.parse(slot.start);
          const end = Date.parse(slot.end);
          if (end <= fromMs || start >= toMs) return;
          slots.push({
            id: `slot:${resourceId}:${isoDay}:${index}`,
            ...slot,
            status: end <= refMs ? 'past' : start <= refMs ? 'in-progress' : 'upcoming',
          });
        });
    }
  }
  return slots;
}
