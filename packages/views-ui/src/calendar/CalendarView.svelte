<script lang="ts" generics="TData = unknown">
/**
 * Host adapter over `@texuli/data/calendar/view` `CalendarView`.
 * Forwards Texuli host-parity props (onChange, onCreate, now, showYear,
 * readOnly, canMove, min/max, slotMinutes). Bridges CalendarChange into host
 * `writes` via splitSeries for keel/crud series services.
 * `phone` swaps the grid for a lazy phone agenda (event `chip` snippet,
 * “+N more events” per day); `agendaDays` and `labels` pass straight through.
 */
import type { PrototypeRuntime } from '@protoyard/core';
import { getRuntime, runService, useClock } from '@protoyard/renderer-svelte';
import {
  type CalendarSeries,
  type IsoDate,
  type Occurrence,
  splitSeries,
} from '@protoyard/views/calendar';
import {
  type CalendarLabels,
  DEFAULT_CALENDAR_LABELS,
  CalendarView as TexuliCalendar,
  type CalendarChange as TexuliCalendarChange,
} from '@texuli/data/calendar/view';
import type { Snippet } from 'svelte';
import QueryState from '../states/QueryState.svelte';
import type { CalendarChange, CalendarChipState, CalendarSlot, CalendarTone } from './types.ts';

let {
  query,
  anchor = $bindable<IsoDate | undefined>(undefined),
  timeZone = 'UTC',
  locale = 'en-US',
  label = 'Calendar',
  view = $bindable<'month' | 'week' | 'day' | 'agenda'>('week'),
  weekStartsOn,
  getTitle,
  getTone,
  onOpen,
  onChange,
  onCreate,
  newId,
  readOnly = false,
  canMove,
  min,
  max,
  slotMinutes = 15,
  showYear = 'always' as const,
  phone = false,
  agendaDays,
  maxPerDay = 3,
  chip,
  labels,
  onRetry,
  runtime,
  now,
  class: className,
}: {
  query: {
    readonly current: CalendarSeries<TData>[] | undefined;
    readonly loading: boolean;
    readonly error: unknown;
  };
  anchor?: IsoDate;
  timeZone?: string;
  locale?: string;
  label?: string;
  view?: 'month' | 'week' | 'day' | 'agenda';
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  getTitle?: (occurrence: Occurrence<TData>) => string;
  getTone?: (occurrence: Occurrence<TData>) => CalendarTone;
  onOpen?: (occurrence: Occurrence<TData>) => void;
  onChange?: (change: CalendarChange<TData>) => unknown;
  onCreate?: (slot: CalendarSlot) => unknown;
  newId?: (series: CalendarSeries<TData>) => string;
  readOnly?: boolean;
  canMove?: (occurrence: Occurrence<TData>) => boolean;
  min?: IsoDate;
  max?: IsoDate;
  slotMinutes?: number;
  /** Texuli range titles: pass `always` for "May 31 – Jun 6, 2026". */
  showYear?: 'auto' | 'always';
  /**
   * Phone agenda: a day-by-day list (lazy chunk) instead of the month/week
   * grid. Events render through `chip`; days past `maxPerDay` collapse
   * behind “+N more events”. Moving events is not offered in this mode.
   */
  phone?: boolean;
  /** Days in the agenda (Texuli agenda view and the phone agenda; default 14 and 7). */
  agendaDays?: number;
  /** Phone agenda: events shown per day before “+N more events” (default 3). */
  maxPerDay?: number;
  /** Phone agenda: the content of each event button (title, time, badges…). */
  chip?: Snippet<[Occurrence<TData>, CalendarChipState]>;
  /** Texuli calendar copy overrides (also used by the phone agenda). */
  labels?: Partial<CalendarLabels>;
  onRetry?: () => unknown;
  runtime?: PrototypeRuntime;
  now?: Date | string;
  class?: string;
} = $props();

/** The runtime prop, else the mounted prototype's runtime (templates pass none). */
function runtimeInScope(): PrototypeRuntime | undefined {
  if (runtime) return runtime;
  try {
    return getRuntime();
  } catch {
    return undefined;
  }
}

// svelte-ignore state_referenced_locally -- only subscribe when a runtime is in scope
const clockRuntime = now !== undefined ? undefined : runtimeInScope();
const clock = clockRuntime ? useClock(clockRuntime) : null;

function toIsoDate(value: Date | string): IsoDate {
  if (typeof value === 'string') return value.slice(0, 10) as IsoDate;
  return value.toISOString().slice(0, 10) as IsoDate;
}

function toInstant(value: Date | string): Date {
  return typeof value === 'string' ? new Date(value) : value;
}

const clockNow = $derived(now !== undefined ? toInstant(now) : (clock?.now ?? new Date(0)));
/** Instant for Texuli `now` (ISO string); drives the now-line and today. */
const nowProp = $derived(clockNow.getTime() > 0 ? clockNow.toISOString() : undefined);
const todayIso = $derived(toIsoDate(clockNow));

// Seed anchor once from the prop or the simulated clock; later clock jumps leave
// the visible week put (time-travel now-line test) until the user hits Today.
let localAnchor = $state<IsoDate>(
  (typeof anchor === 'string' ? anchor : undefined) ?? toIsoDate(clockNow)
);
let seededFromClock = $state(Boolean(anchor));
$effect(() => {
  if (anchor) {
    localAnchor = anchor;
    seededFromClock = true;
  }
});
$effect(() => {
  if (seededFromClock || anchor) return;
  if (!todayIso || todayIso === '1970-01-01') return;
  localAnchor = todayIso;
  seededFromClock = true;
});

async function handleChange(tx: TexuliCalendarChange<TData>): Promise<void> {
  if (!onChange) return;
  const events = query.current ?? [];
  const series = events.find((row) => row.id === tx.id);
  let writes: NonNullable<CalendarChange<TData>['writes']> = { put: [], delete: [] };
  let scope: NonNullable<CalendarChange<TData>['scope']> = tx.recurring ? 'this' : 'all';
  if (series) {
    try {
      const makeId = (): string => newId?.(series) ?? `${series.id}~${Date.now().toString(36)}`;
      writes = splitSeries(
        series,
        tx.occurrenceId,
        scope,
        { start: tx.start, end: tx.end },
        { timeZone, newId: makeId }
      );
    } catch {
      writes = {
        put: [{ ...series, start: tx.start, end: tx.end, allDay: tx.allDay }],
        delete: [],
      };
    }
  }
  await runService(() =>
    onChange({
      id: tx.id,
      occurrenceId: tx.occurrenceId,
      start: tx.start,
      end: tx.end,
      allDay: tx.allDay,
      recurring: tx.recurring,
      occurrence: tx.occurrence,
      scope,
      writes,
    })
  );
}

function handleCreate(slot: CalendarSlot): void {
  void createSlot(slot);
}

async function createSlot(slot: CalendarSlot): Promise<void> {
  if (!onCreate) return;
  await runService(() => onCreate(slot));
}

const allLabels = $derived<CalendarLabels>({ ...DEFAULT_CALENDAR_LABELS, ...labels });
// The phone agenda is its own chunk: desktop calendars never download it.
const phoneAgenda = $derived(phone ? import('./PhoneAgenda.svelte') : null);
</script>

<!-- Host shell only: Texuli CalendarView owns `section[data-calendar]`. -->
<QueryState
  {query}
  label={`Loading ${label.toLowerCase()}`}
  onRetry={onRetry ? () => { void onRetry(); } : undefined}
  isEmpty={() => false}
>
  {#snippet children(events)}
    {#if phoneAgenda}
      {#await phoneAgenda then { default: PhoneAgenda }}
        <PhoneAgenda
          {events}
          bind:anchor={localAnchor}
          today={todayIso}
          {label}
          {locale}
          {timeZone}
          agendaDays={agendaDays ?? 7}
          {maxPerDay}
          labels={allLabels}
          {getTitle}
          {getTone}
          {onOpen}
          onCreate={onCreate && !readOnly ? createSlot : undefined}
          {chip}
          class={className}
        />
      {/await}
    {:else}
    <TexuliCalendar
      {events}
      anchor={localAnchor}
      today={todayIso}
      now={nowProp}
      {label}
      {locale}
      {timeZone}
      bind:view
      {weekStartsOn}
      {getTitle}
      {getTone}
      {onOpen}
      onChange={onChange && !readOnly ? handleChange : undefined}
      onCreate={onCreate && !readOnly ? handleCreate : undefined}
      {readOnly}
      {canMove}
      {min}
      {max}
      {slotMinutes}
      {showYear}
      {agendaDays}
      {labels}
      class={className}
    />
    {/if}
  {/snippet}
</QueryState>
