import {
  createRng,
  type DomainEvent,
  type EventApplyContext,
  eventId,
  type GenerateContext,
  MS_PER_DAY,
  MS_PER_HOUR,
  type Rng,
  type TimelineContext,
} from '@protoyard/core';

/**
 * Timeline helpers for `scenarios.advance()`. The key property is window
 * independence: everything about a day (how many events, when, what) is
 * derived from scenario seed + day, never from the requested window. So
 * advancing 7 days at once or 1 day seven times yields the very same events,
 * with the same ids, and replaying a window is a no-op.
 *
 * Named sources (`registerTimelineSource`) let several kits contribute
 * events without editing one monolith `timeline` function. Zone helpers take
 * an explicit IANA time zone so results never depend on the host zone.
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

// ---------------------------------------------------------------------------
// Explicit IANA time-zone helpers (host zone never consulted)
// ---------------------------------------------------------------------------

const ZONE_DAY_MS = 86_400_000;
const zoneFormatters = new Map<string, Intl.DateTimeFormat>();

export interface LocalWallTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function pad2(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

function parseIsoDay(day: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) throw new RangeError(`localTimeToUtc(): invalid day "${day}" (expected YYYY-MM-DD)`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const dayNum = Number(match[3]);
  const normalized = `${pad2(year, 4)}-${pad2(month)}-${pad2(dayNum)}`;
  // Reject impossible calendar dates (e.g. 2026-02-30) via UTC round-trip.
  const probe = new Date(Date.UTC(year, month - 1, dayNum));
  const reformatted = `${pad2(probe.getUTCFullYear(), 4)}-${pad2(probe.getUTCMonth() + 1)}-${pad2(probe.getUTCDate())}`;
  if (reformatted !== normalized) {
    throw new RangeError(`localTimeToUtc(): invalid day "${day}"`);
  }
  return { year, month, day: dayNum };
}

function parseHhmm(hhmm: string): { hour: number; minute: number; second: number } {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(hhmm);
  if (!match) {
    throw new RangeError(`localTimeToUtc(): invalid time "${hhmm}" (expected HH:mm or HH:mm:ss)`);
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] !== undefined ? Number(match[3]) : 0;
  if (hour > 23 || minute > 59 || second > 59) {
    throw new RangeError(`localTimeToUtc(): invalid time "${hhmm}"`);
  }
  return { hour, minute, second };
}

function requireTimeZone(timeZone: string): string {
  const zone = timeZone.trim();
  if (!zone) throw new RangeError('time zone is required (pass an explicit IANA id, e.g. "UTC")');
  try {
    // Throws RangeError for unknown zones in engines that ship the IANA DB.
    Intl.DateTimeFormat(undefined, { timeZone: zone });
  } catch {
    throw new RangeError(`unknown time zone "${timeZone}"`);
  }
  return zone;
}

function zoneFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = zoneFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    zoneFormatters.set(timeZone, f);
  }
  return f;
}

function wallTimeAt(instantMs: number, timeZone: string): LocalWallTime {
  const parts: Record<string, number> = {};
  for (const part of zoneFormatter(timeZone).formatToParts(instantMs)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year as number,
    month: parts.month as number,
    day: parts.day as number,
    hour: (parts.hour as number) % 24,
    minute: parts.minute as number,
    second: parts.second as number,
  };
}

function wallAsUtcMs(wall: LocalWallTime): number {
  return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
}

function offsetAt(instantMs: number, timeZone: string): number {
  return wallAsUtcMs(wallTimeAt(instantMs, timeZone)) - Math.floor(instantMs / 1000) * 1000;
}

/**
 * Instant (epoch ms) at which `timeZone` shows `wall`. A wall time skipped by
 * a spring-forward DST gap moves forward by the jump (02:30 → 03:30). A time
 * that happens twice on a fall-back day takes the earlier occurrence (RFC 5545).
 */
export function zonedInstantMs(wall: LocalWallTime, timeZone: string): number {
  const zone = requireTimeZone(timeZone);
  const local = wallAsUtcMs(wall);
  const before = offsetAt(local - ZONE_DAY_MS, zone);
  const after = offsetAt(local + ZONE_DAY_MS, zone);
  const exact = [local - before, local - after]
    .filter((candidate) => wallAsUtcMs(wallTimeAt(candidate, zone)) === local)
    .sort((a, b) => a - b);
  return exact[0] ?? local - before;
}

/**
 * UTC instant of a local wall-clock time `HH:mm` (or `HH:mm:ss`) on calendar
 * day `YYYY-MM-DD` in an explicit IANA `timeZone`. Never reads the host zone.
 */
export function localTimeToUtc(day: string, hhmm: string, timeZone: string): Date {
  const { year, month, day: dayNum } = parseIsoDay(day);
  const { hour, minute, second } = parseHhmm(hhmm);
  const ms = zonedInstantMs({ year, month, day: dayNum, hour, minute, second }, timeZone);
  return new Date(ms);
}

/**
 * Civil calendar day (`YYYY-MM-DD`) an instant falls on in `timeZone`. The
 * shared day key for schedules, reports and due events across kits.
 */
export function localDayOf(at: Date | string | number, timeZone: string): string {
  const zone = requireTimeZone(timeZone);
  const ms = typeof at === 'number' ? at : typeof at === 'string' ? Date.parse(at) : at.getTime();
  if (!Number.isFinite(ms)) throw new RangeError(`localDayOf(): invalid instant "${String(at)}"`);
  const wall = wallTimeAt(ms, zone);
  return `${pad2(wall.year, 4)}-${pad2(wall.month)}-${pad2(wall.day)}`;
}

/**
 * `[start, end)` of a civil day in `timeZone` (23 or 25 hours on DST edges).
 * `end` is the next local midnight.
 */
export function localDayBounds(
  day: string,
  timeZone: string
): { start: Date; end: Date; durationMs: number } {
  const { year, month, day: dayNum } = parseIsoDay(day);
  const startMs = zonedInstantMs(
    { year, month, day: dayNum, hour: 0, minute: 0, second: 0 },
    timeZone
  );
  // Next civil day via UTC calendar arithmetic (month overflow is fine).
  const next = new Date(Date.UTC(year, month - 1, dayNum + 1));
  const endMs = zonedInstantMs(
    {
      year: next.getUTCFullYear(),
      month: next.getUTCMonth() + 1,
      day: next.getUTCDate(),
      hour: 0,
      minute: 0,
      second: 0,
    },
    timeZone
  );
  return { start: new Date(startMs), end: new Date(endMs), durationMs: endMs - startMs };
}

// ---------------------------------------------------------------------------
// Deterministic timeline source registry
// ---------------------------------------------------------------------------

/** Default per-source event cap (keeps a runaway collector from unbounded output). */
export const DEFAULT_TIMELINE_SOURCE_MAX_EVENTS = 10_000;
/** Default total event cap across every source in one collect. */
export const DEFAULT_TIMELINE_COLLECT_MAX_EVENTS = 50_000;

export type TimelineSourceCollector = (
  ctx: TimelineContext
) => DomainEvent[] | Promise<DomainEvent[]>;

export type TimelineEventApplier = (
  event: DomainEvent,
  ctx: EventApplyContext
) => void | Promise<void>;

export interface TimelineSourceRegistration {
  /**
   * Stable source id (e.g. `billing`, `checkins`). Registration order is
   * preserved for diagnostics; final event order is always by `at` then `id`.
   */
  id: string;
  /** Emits the events for `(ctx.from, ctx.to]`. Must be window-independent. */
  collect: TimelineSourceCollector;
  /**
   * Optional appliers keyed by event `type`. Each type may belong to only one
   * registered source.
   */
  apply?: Readonly<Record<string, TimelineEventApplier>>;
  /**
   * Max events this source may contribute per collect (default
   * {@link DEFAULT_TIMELINE_SOURCE_MAX_EVENTS}). Excess is dropped after a
   * stable sort by `at` then `id`.
   */
  maxEvents?: number;
}

export interface CollectTimelineEventsOptions {
  /** Total cap after merge and sort (default {@link DEFAULT_TIMELINE_COLLECT_MAX_EVENTS}). */
  maxEvents?: number;
  /**
   * When true, only these source ids run (others are skipped). Useful in tests.
   * Unknown ids are ignored.
   */
  only?: readonly string[];
}

export interface CollectTimelineEventsResult {
  events: DomainEvent[];
  /** Source ids that contributed at least one kept event. */
  sources: string[];
  /** True when a per-source or total cap dropped events. */
  truncated: boolean;
}

interface StoredSource {
  id: string;
  collect: TimelineSourceCollector;
  maxEvents: number;
  types: readonly string[];
}

const SOURCES: StoredSource[] = [];
const SOURCE_BY_ID = new Map<string, StoredSource>();
const APPLIERS = new Map<string, { sourceId: string; apply: TimelineEventApplier }>();

function assertSourceId(id: string): string {
  const trimmed = id.trim();
  if (!trimmed) throw new RangeError('registerTimelineSource(): id is required');
  if (!/^[a-z][a-z0-9._-]*$/i.test(trimmed)) {
    throw new RangeError(
      `registerTimelineSource(): id "${id}" must start with a letter and use only letters, digits, ".", "_" or "-"`
    );
  }
  return trimmed;
}

function compareEvents(a: DomainEvent, b: DomainEvent): number {
  return a.at.localeCompare(b.at) || a.id.localeCompare(b.id);
}

function boundEvents(
  events: DomainEvent[],
  max: number
): { events: DomainEvent[]; truncated: boolean } {
  if (events.length <= max) return { events, truncated: false };
  const sorted = [...events].sort(compareEvents);
  return { events: sorted.slice(0, max), truncated: true };
}

/**
 * Registers a named timeline source. Call at module load so registration order
 * is stable. Throws when the id or any event type is already registered.
 * Returns an unregister function (for tests).
 */
export function registerTimelineSource(registration: TimelineSourceRegistration): () => void {
  const id = assertSourceId(registration.id);
  if (SOURCE_BY_ID.has(id)) {
    throw new Error(`Timeline source "${id}" is already registered.`);
  }
  if (typeof registration.collect !== 'function') {
    throw new TypeError(`registerTimelineSource("${id}"): collect must be a function`);
  }
  const maxEvents =
    registration.maxEvents === undefined
      ? DEFAULT_TIMELINE_SOURCE_MAX_EVENTS
      : Math.floor(registration.maxEvents);
  if (!(maxEvents >= 0)) {
    throw new RangeError(`registerTimelineSource("${id}"): maxEvents must be >= 0`);
  }

  const types: string[] = [];
  const applyEntries = Object.entries(registration.apply ?? {});
  for (const [type, apply] of applyEntries) {
    if (!type)
      throw new RangeError(`registerTimelineSource("${id}"): event type must be non-empty`);
    if (typeof apply !== 'function') {
      throw new TypeError(`registerTimelineSource("${id}"): apply["${type}"] must be a function`);
    }
    const existing = APPLIERS.get(type);
    if (existing) {
      throw new Error(
        `Timeline event type "${type}" is already registered by source "${existing.sourceId}".`
      );
    }
    types.push(type);
  }

  const stored: StoredSource = { id, collect: registration.collect, maxEvents, types };
  SOURCES.push(stored);
  SOURCE_BY_ID.set(id, stored);
  for (const [type, apply] of applyEntries) {
    APPLIERS.set(type, { sourceId: id, apply });
  }

  return () => unregisterTimelineSource(id);
}

/** Removes one source and its event-type appliers. No-op when unknown. */
export function unregisterTimelineSource(id: string): void {
  const stored = SOURCE_BY_ID.get(id);
  if (!stored) return;
  SOURCE_BY_ID.delete(id);
  const index = SOURCES.findIndex((s) => s.id === id);
  if (index >= 0) SOURCES.splice(index, 1);
  for (const type of stored.types) APPLIERS.delete(type);
}

/** Clears every registered source (test isolation). */
export function clearTimelineSources(): void {
  SOURCES.length = 0;
  SOURCE_BY_ID.clear();
  APPLIERS.clear();
}

/** Registered source ids in registration order. */
export function listTimelineSources(): readonly string[] {
  return SOURCES.map((s) => s.id);
}

/**
 * Runs every registered source for `ctx`, bounds each source, merges, sorts by
 * `at` then `id`, rejects duplicate ids, and applies the total cap.
 */
export async function collectTimelineEvents(
  ctx: TimelineContext,
  options: CollectTimelineEventsOptions = {}
): Promise<CollectTimelineEventsResult> {
  const totalMax =
    options.maxEvents === undefined
      ? DEFAULT_TIMELINE_COLLECT_MAX_EVENTS
      : Math.floor(options.maxEvents);
  if (!(totalMax >= 0)) throw new RangeError('collectTimelineEvents(): maxEvents must be >= 0');

  const only = options.only ? new Set(options.only) : null;
  const merged: DomainEvent[] = [];
  const contributed = new Set<string>();
  let truncated = false;

  for (const source of SOURCES) {
    if (only && !only.has(source.id)) continue;
    const raw = await source.collect(ctx);
    if (!Array.isArray(raw)) {
      throw new TypeError(`Timeline source "${source.id}" must return an array of DomainEvent`);
    }
    const bounded = boundEvents(raw, source.maxEvents);
    if (bounded.truncated) truncated = true;
    if (bounded.events.length > 0) contributed.add(source.id);
    for (const event of bounded.events) {
      if (!event || typeof event.id !== 'string' || typeof event.at !== 'string') {
        throw new TypeError(`Timeline source "${source.id}" returned an invalid DomainEvent`);
      }
      if (event.source !== 'timeline') {
        throw new TypeError(
          `Timeline source "${source.id}" event "${event.id}" must set source: "timeline"`
        );
      }
      merged.push(event);
    }
  }

  merged.sort(compareEvents);

  const seen = new Map<string, DomainEvent>();
  const unique: DomainEvent[] = [];
  for (const event of merged) {
    const prior = seen.get(event.id);
    if (prior) {
      throw new Error(
        `Duplicate timeline event id "${event.id}" (types "${prior.type}" and "${event.type}"). ` +
          'Event ids must be unique across every registered source.'
      );
    }
    seen.set(event.id, event);
    unique.push(event);
  }

  const capped = boundEvents(unique, totalMax);
  if (capped.truncated) truncated = true;

  return {
    events: capped.events,
    sources: [...contributed],
    truncated,
  };
}

/**
 * Dispatches one event to the applier registered for its `type`.
 * Returns `true` when a handler ran, `false` when the type is unknown.
 */
export async function applyTimelineEvent(
  event: DomainEvent,
  ctx: EventApplyContext
): Promise<boolean> {
  const entry = APPLIERS.get(event.type);
  if (!entry) return false;
  await entry.apply(event, ctx);
  return true;
}

/**
 * Convenience wiring for `definePrototype`:
 * `timeline` collects every registered source; `applyEvent` dispatches by type.
 */
export function timelineFromSources(options: CollectTimelineEventsOptions = {}): {
  timeline: (ctx: TimelineContext) => Promise<DomainEvent[]>;
  applyEvent: (event: DomainEvent, ctx: EventApplyContext) => Promise<void>;
} {
  return {
    async timeline(ctx) {
      return (await collectTimelineEvents(ctx, options)).events;
    },
    async applyEvent(event, ctx) {
      await applyTimelineEvent(event, ctx);
    },
  };
}
