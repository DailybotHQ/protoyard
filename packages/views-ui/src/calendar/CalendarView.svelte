<script lang="ts" generics="TData = unknown">
/**
 * Host adapter over `@texuli/data/calendar/view` `CalendarView`.
 * Maps liveQuery `query` → `events`. Callbacks keep `Occurrence<TData>`.
 * `onChange` / `onCreate` / `newId` are forwarded when Texuli CalendarView
 * exposes them (FIX-calendar-reschedule); until then they remain host hooks.
 */
import type { CalendarSeries, IsoDate, Occurrence } from '@protoyard/views/calendar';
import { CalendarView as TexuliCalendar } from '@texuli/data/calendar/view';
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
  onCreate,
  newId,
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
  onCreate?: (slot: CalendarSlot) => unknown;
  newId?: (series: CalendarSeries<TData>) => string;
  onRetry?: () => unknown;
  runtime?: unknown;
  now?: Date | string;
  class?: string;
} = $props();

const today = $derived(new Date().toISOString().slice(0, 10) as IsoDate);
let localAnchor = $state<IsoDate>(today);
$effect(() => {
  if (anchor) localAnchor = anchor;
});

/**
 * Forward reschedule/create hooks to Texuli when present (lane D).
 * Typed loosely so a newer CalendarView with onChange does not break this adapter.
 */
const rescheduleProps = $derived.by(() => {
  const extra: Record<string, unknown> = {};
  if (onChange) extra.onChange = onChange;
  if (onCreate) extra.onCreate = onCreate;
  if (newId) extra.newId = newId;
  return extra;
});
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
        class={className}
        {...(rescheduleProps as object)}
      />
    {/snippet}
  </QueryState>
</div>
