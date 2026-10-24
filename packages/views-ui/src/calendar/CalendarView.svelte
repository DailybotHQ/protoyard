<script lang="ts" generics="TData = unknown">
/**
 * Host adapter over `@texuli/data/calendar/view` `CalendarView`.
 * Maps liveQuery `query` → `events`. Write APIs (`onChange` / `onCreate` / `newId`)
 * are accepted for host compatibility; Texuli's view is display-first today.
 */
import type { CalendarSeries, IsoDate } from '@protoyard/views/calendar';
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
  getTone: _getTone,
  onOpen,
  onChange: _onChange,
  onCreate: _onCreate,
  newId: _newId,
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
  getTitle?: (occurrence: any) => string;
  getTone?: (occurrence: any) => CalendarTone;
  onOpen?: (occurrence: unknown) => void;
  onChange?: (change: CalendarChange<TData>) => unknown;
  onCreate?: (slot: CalendarSlot) => unknown;
  newId?: (series: any) => string;
  onRetry?: () => void | Promise<void>;
  runtime?: unknown;
  now?: Date | string;
  class?: string;
} = $props();

const today = $derived(new Date().toISOString().slice(0, 10) as IsoDate);
let localAnchor = $state<IsoDate>(today);
$effect(() => {
  if (anchor) localAnchor = anchor;
});
</script>

<div data-calendar={label}>
  <QueryState {query} label={`Loading ${label.toLowerCase()}`} {onRetry} isEmpty={() => false}>
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
        {onOpen}
        class={className}
      />
    {/snippet}
  </QueryState>
</div>
