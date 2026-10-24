<script lang="ts" generics="TData = unknown">
/**
 * Host adapter over `@texuli/data/calendar/view` `CalendarView`.
 * Forwards reschedule props (onChange, readOnly, canMove, min, max, slotMinutes)
 * and keeps `Occurrence<TData>` on callbacks. When the host still expects
 * `change.writes`, builds SeriesWrites via splitSeries for the moved occurrence.
 *
 * `onCreate` stays on the host API for booking/crud/ui-kit; Texuli CalendarView
 * does not emit empty-slot creates yet, so the prop is not forwarded.
 */
import { runService } from '@protoyard/renderer-svelte';
import {
  type CalendarSeries,
  type IsoDate,
  type Occurrence,
  splitSeries,
} from '@protoyard/views/calendar';
import {
  CalendarView as TexuliCalendar,
  type CalendarChange as TexuliCalendarChange,
} from '@texuli/data/calendar/view';
import QueryState from '../states/QueryState.svelte';
import type { CalendarChange, CalendarSlot, CalendarTone } from './types.ts';

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
  onCreate: _onCreate,
  newId,
  readOnly = false,
  canMove,
  min,
  max,
  slotMinutes,
  onRetry,
  runtime: _runtime,
  now: _now,
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
  /** Host create-from-slot (booking/crud). Not emitted by Texuli CalendarView yet. */
  onCreate?: (slot: CalendarSlot) => unknown;
  /** Id for a series that a 'following' split creates; receives the source series. */
  newId?: (series: CalendarSeries<TData>) => string;
  readOnly?: boolean;
  canMove?: (occurrence: Occurrence<TData>) => boolean;
  min?: IsoDate;
  max?: IsoDate;
  slotMinutes?: number;
  onRetry?: () => unknown;
  runtime?: unknown;
  now?: Date | string;
  class?: string;
} = $props();

const today = $derived(new Date().toISOString().slice(0, 10) as IsoDate);
let localAnchor = $state<IsoDate>(
  (typeof anchor === 'string' ? anchor : undefined) ??
    (new Date().toISOString().slice(0, 10) as IsoDate)
);
$effect(() => {
  if (anchor) localAnchor = anchor;
});

async function handleChange(tx: TexuliCalendarChange<TData>): Promise<void> {
  if (!onChange) return;
  const events = query.current ?? [];
  const series = events.find((row) => row.id === tx.id);
  let writes: NonNullable<CalendarChange<TData>['writes']> = { put: [], delete: [] };
  let scope: NonNullable<CalendarChange<TData>['scope']> = tx.recurring ? 'this' : 'all';
  if (series) {
    try {
      // splitSeries wants `newId: () => string`; host newId may take the series.
      const makeId = (): string => newId?.(series) ?? `${series.id}~${Date.now().toString(36)}`;
      writes = splitSeries(
        series,
        tx.occurrenceId,
        scope,
        { start: tx.start, end: tx.end },
        { timeZone, newId: makeId }
      );
    } catch {
      // Non-series edge or occurrence not found: plain put of the moved master.
      writes = {
        put: [{ ...series, start: tx.start, end: tx.end, allDay: tx.allDay }],
        delete: [],
      };
    }
  }
  const payload: CalendarChange<TData> = {
    id: tx.id,
    occurrenceId: tx.occurrenceId,
    start: tx.start,
    end: tx.end,
    allDay: tx.allDay,
    recurring: tx.recurring,
    occurrence: tx.occurrence,
    scope,
    writes,
  };
  await runService(() => onChange(payload));
}
</script>

<div data-calendar={label}>
  <QueryState
    {query}
    label={`Loading ${label.toLowerCase()}`}
    onRetry={onRetry ? () => { void onRetry(); } : undefined}
    isEmpty={() => false}
  >
    {#snippet children(events)}
      <TexuliCalendar
        {events}
        anchor={localAnchor}
        today={today}
        {label}
        {locale}
        {timeZone}
        bind:view
        {weekStartsOn}
        {getTitle}
        {getTone}
        {onOpen}
        onChange={onChange ? handleChange : undefined}
        {readOnly}
        {canMove}
        {min}
        {max}
        {slotMinutes}
        class={className}
      />
    {/snippet}
  </QueryState>
</div>
