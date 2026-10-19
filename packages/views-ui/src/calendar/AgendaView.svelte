<script lang="ts">
import { addDays, daysBetween, type IsoDate } from '@protoyard/views/calendar';
import EventChip from './EventChip.svelte';
import { type Formats, onDate } from './model.ts';
import type { CalendarItem } from './types.ts';

/**
 * Days with events, as a grouped list: the screen-reader- and phone-friendly
 * view (CalendarView's default below `sm`).
 */
let {
  startDate,
  endDate,
  today,
  focusDate,
  items,
  fmt,
  timeZone,
  editable,
  canCreate,
  onOpen,
  onDragStart,
  onCreateDay,
  onFocusDate,
}: {
  startDate: IsoDate;
  endDate: IsoDate;
  today: IsoDate;
  focusDate: IsoDate;
  items: CalendarItem[];
  fmt: Formats;
  timeZone: string;
  editable: boolean;
  canCreate: boolean;
  onOpen: (key: string) => void;
  onDragStart: (event: PointerEvent, key: string, kind: 'move' | 'resize') => void;
  onCreateDay: (date: IsoDate) => void;
  onFocusDate: (date: IsoDate) => void;
} = $props();

const days = $derived(
  Array.from({ length: Math.max(0, daysBetween(startDate, endDate)) }, (_, i) =>
    addDays(startDate, i)
  )
    .map((date) => ({ date, list: onDate(items, date, timeZone) }))
    .filter((day) => day.list.length > 0 || day.date === focusDate)
);
</script>

<div class="grid gap-4 p-3" data-agenda>
  {#if days.every((day) => day.list.length === 0)}
    <p class="text-sm text-muted-foreground">Nothing scheduled from {fmt.longDate(startDate)} to {fmt.longDate(addDays(endDate, -1))}.</p>
  {/if}
  {#each days as day (day.date)}
    <section aria-labelledby={`agenda-${day.date}`} class="grid gap-1.5">
      <h3 id={`agenda-${day.date}`} class="flex items-center gap-2 text-sm font-semibold">
        <button
          type="button"
          class="rounded outline-none focus-visible:ring-2 focus-visible:ring-ring"
          tabindex={day.date === focusDate ? 0 : -1}
          data-slot
          data-date={day.date}
          data-focused={day.date === focusDate || undefined}
          aria-current={day.date === today ? 'date' : undefined}
          aria-label={`${fmt.longDate(day.date)}${canCreate ? '. Enter adds an all-day event' : ''}`}
          onfocus={() => onFocusDate(day.date)}
          onclick={() => canCreate && onCreateDay(day.date)}
        >
          {fmt.longDate(day.date)}
        </button>
        {#if day.date === today}<span class="text-xs font-normal text-primary">Today</span>{/if}
      </h3>
      {#if day.list.length > 0}
        <ul class="grid gap-1">
          {#each day.list as item (item.key)}
            <li><EventChip {item} {fmt} {editable} {onOpen} {onDragStart} /></li>
          {/each}
        </ul>
      {/if}
    </section>
  {/each}
</div>
