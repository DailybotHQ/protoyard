<script lang="ts" generics="TData = unknown">
/**
 * Host adapter over `@texuli/data/calendar/view` `CalendarView`.
 * Maps liveQuery `query` → `events`. Edit APIs (`onChange` / `onCreate`) are
 * not on Texuli's view yet — callers that need writes keep using services
 * outside the view (documented adapter limit).
 */
import type { CalendarSeries, IsoDate } from '@protoyard/views/calendar';
import { CalendarView as TexuliCalendar } from '@texuli/data/calendar/view';
import QueryState from '../states/QueryState.svelte';
import type { CalendarChange, CalendarSlot, CalendarTone } from './types.ts';

let {
  query,
  timeZone = 'UTC',
  locale = 'en-US',
  label = 'Calendar',
  view = $bindable<'month' | 'week' | 'day' | 'agenda'>('week'),
  weekStartsOn,
  getTitle,
  getTone,
  onOpen,
  onChange: _onChange,
  onCreate: _onCreate,
  onRetry,
  runtime: _runtime,
  class: className,
}: {
  query: {
    readonly current: CalendarSeries<TData>[] | undefined;
    readonly loading: boolean;
    readonly error: unknown;
  };
  timeZone?: string;
  locale?: string;
  label?: string;
  view?: 'month' | 'week' | 'day' | 'agenda';
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  getTitle?: (occurrence: { seriesId: string; start: string }) => string;
  getTone?: (occurrence: { seriesId: string }) => CalendarTone;
  onOpen?: (occurrence: unknown) => void;
  onChange?: (change: CalendarChange<TData>) => unknown;
  onCreate?: (slot: CalendarSlot) => unknown;
  onRetry?: () => void | Promise<void>;
  runtime?: unknown;
  class?: string;
} = $props();

const today = $derived(new Date().toISOString().slice(0, 10) as IsoDate);
let anchor = $state<IsoDate>(today);
</script>

<QueryState
  {query}
  label={`Loading ${label.toLowerCase()}`}
  {onRetry}
  isEmpty={() => false}
>
  {#snippet children(events)}
    <TexuliCalendar
      {events}
      {anchor}
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
