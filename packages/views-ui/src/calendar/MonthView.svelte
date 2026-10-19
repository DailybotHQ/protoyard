<script lang="ts">
import { Popover } from '@protoyard/ui';
import {
  type IsoDate,
  type MonthCell,
  monthGrid,
  parseIsoDate,
  type Weekday,
} from '@protoyard/views/calendar';
import EventChip from './EventChip.svelte';
import { type Formats, onDate } from './model.ts';
import type { CalendarItem } from './types.ts';

/** Six weeks × seven days. Up to three events per day, the rest behind "+N more". */
let {
  anchor,
  today,
  focusDate,
  items,
  fmt,
  timeZone,
  weekStartsOn,
  editable,
  canCreate,
  onOpen,
  onDragStart,
  onCreateDay,
  onFocusDate,
}: {
  anchor: IsoDate;
  today: IsoDate;
  focusDate: IsoDate;
  items: CalendarItem[];
  fmt: Formats;
  timeZone: string;
  weekStartsOn: Weekday;
  editable: boolean;
  canCreate: boolean;
  onOpen: (key: string) => void;
  onDragStart: (event: PointerEvent, key: string, kind: 'move' | 'resize') => void;
  onCreateDay: (date: IsoDate) => void;
  onFocusDate: (date: IsoDate) => void;
} = $props();

const MAX_VISIBLE = 3;
const weeks = $derived.by(() => {
  const { year, month } = parseIsoDate(anchor);
  return monthGrid(year, month, { weekStartsOn, today });
});
const byDate = $derived.by(() => {
  const map = new Map<IsoDate, CalendarItem[]>();
  for (const week of weeks)
    for (const cell of week) map.set(cell.date, onDate(items, cell.date, timeZone));
  return map;
});

function dayLabel(cell: MonthCell, count: number) {
  return `${fmt.longDate(cell.date)}, ${count === 0 ? 'no events' : `${count} event${count === 1 ? '' : 's'}`}${canCreate ? '. Enter adds an all-day event' : ''}`;
}
</script>

<div class="grid grid-cols-7 border-b border-border text-xs font-medium text-muted-foreground" aria-hidden="true">
  {#each weeks[0] ?? [] as cell (cell.date)}
    <div class="px-2 py-1.5">{fmt.weekday(cell.date)}</div>
  {/each}
</div>
<div class="grid grid-rows-6" role="grid" aria-label={fmt.monthTitle(anchor)} data-month-grid>
  {#each weeks as week, w (w)}
    <div class="grid min-h-24 grid-cols-7 border-b border-border last:border-b-0" role="row">
      {#each week as cell (cell.date)}
        {@const dayItems = byDate.get(cell.date) ?? []}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
          role="gridcell"
          tabindex="-1"
          class={['flex min-w-0 flex-col gap-1 border-r border-border p-1 last:border-r-0', !cell.inMonth && 'bg-muted/40']}
          data-date={cell.date}
          onclick={(e) => {
            if (canCreate && e.target === e.currentTarget) onCreateDay(cell.date);
          }}
        >
          <button
            type="button"
            class={[
              'grid size-7 place-items-center rounded-full text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring',
              cell.isToday ? 'bg-primary font-semibold text-primary-foreground' : cell.inMonth ? 'text-foreground' : 'text-muted-foreground',
            ]}
            tabindex={cell.date === focusDate ? 0 : -1}
            data-slot
            data-date={cell.date}
            data-focused={cell.date === focusDate || undefined}
            aria-current={cell.isToday ? 'date' : undefined}
            aria-label={dayLabel(cell, dayItems.length)}
            onfocus={() => onFocusDate(cell.date)}
            onclick={() => canCreate && onCreateDay(cell.date)}
          >
            {fmt.dayNumber(cell.date)}
          </button>
          {#each dayItems.slice(0, MAX_VISIBLE) as item (item.key)}
            <EventChip {item} {fmt} {editable} compact {onOpen} {onDragStart} />
          {/each}
          {#if dayItems.length > MAX_VISIBLE}
            <Popover side="bottom" align="start">
              {#snippet trigger({ props })}
                <button
                  {...props}
                  type="button"
                  class="self-start rounded px-1 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`${dayItems.length - MAX_VISIBLE} more events on ${fmt.longDate(cell.date)}`}
                >
                  +{dayItems.length - MAX_VISIBLE} more
                </button>
              {/snippet}
              <p class="mb-2 font-medium">{fmt.longDate(cell.date)}</p>
              <ul class="grid gap-1" aria-label={`Events on ${fmt.longDate(cell.date)}`}>
                {#each dayItems as item (item.key)}
                  <li><EventChip {item} {fmt} {onOpen} {onDragStart} /></li>
                {/each}
              </ul>
            </Popover>
          {/if}
        </div>
      {/each}
    </div>
  {/each}
</div>
