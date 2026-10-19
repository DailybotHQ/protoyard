<script lang="ts">
import { type IsoDate, layoutDay } from '@protoyard/views/calendar';
import { onMount } from 'svelte';
import EventChip from './EventChip.svelte';
import {
  type Formats,
  HOUR_PX,
  MINUTES_PER_DAY,
  nowMinute,
  onDate,
  SLOT_MINUTES,
  slotInstant,
} from './model.ts';
import type { CalendarItem } from './types.ts';

/**
 * Week (seven columns) or day (one) time grid. Only the hours in view (plus
 * two either side) are drawn, so long days and dense weeks stay light; events
 * and the now-line are positioned in wall-clock minutes of `timeZone`.
 */
let {
  dates,
  today,
  nowMs,
  focus,
  items,
  fmt,
  timeZone,
  editable,
  canCreate,
  onOpen,
  onDragStart,
  onCreateAt,
  onFocusSlot,
}: {
  dates: IsoDate[];
  today: IsoDate;
  nowMs: number;
  focus: { date: IsoDate; minute: number };
  items: CalendarItem[];
  fmt: Formats;
  timeZone: string;
  editable: boolean;
  canCreate: boolean;
  onOpen: (key: string) => void;
  onDragStart: (event: PointerEvent, key: string, kind: 'move' | 'resize') => void;
  onCreateAt: (date: IsoDate, minute: number) => void;
  onFocusSlot: (date: IsoDate, minute: number) => void;
} = $props();

const PX = HOUR_PX / 60;

let scroller = $state<HTMLDivElement | null>(null);
let scrollTop = $state(0);
let viewport = $state(0);

const visible = $derived.by(() => {
  // Without layout (tests, first paint) draw the whole day.
  if (viewport === 0) return { from: 0, to: MINUTES_PER_DAY };
  const from = Math.max(0, Math.floor(scrollTop / HOUR_PX) - 2) * 60;
  const to = Math.min(24, Math.ceil((scrollTop + viewport) / HOUR_PX) + 2) * 60;
  return { from, to };
});
const hours = $derived(
  Array.from({ length: 24 }, (_, h) => h).filter(
    (h) => h * 60 >= visible.from && h * 60 < visible.to
  )
);
const allDay = $derived(dates.map((date) => onDate(items, date, timeZone).filter((i) => i.allDay)));
const columns = $derived(
  dates.map((date) =>
    layoutDay(
      items.filter((i) => !i.allDay),
      { date, timeZone }
    ).filter((l) => l.event.grabbed || (l.endMinute > visible.from && l.startMinute < visible.to))
  )
);
const nowLine = $derived(
  dates.map((date) => (date === today ? nowMinute(nowMs, date, timeZone) : null))
);

onMount(() => {
  if (!scroller) return;
  const start = nowLine.find((m) => m !== null) ?? 8 * 60;
  scroller.scrollTop = Math.max(0, (start - 60) * PX);
  scrollTop = scroller.scrollTop;
  viewport = scroller.clientHeight;
});

function slotFromPointer(event: MouseEvent, date: IsoDate) {
  if (!canCreate || event.target !== event.currentTarget) return;
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const minute = Math.floor((event.clientY - rect.top) / PX / SLOT_MINUTES) * SLOT_MINUTES;
  onCreateAt(date, Math.min(MINUTES_PER_DAY - SLOT_MINUTES, Math.max(0, minute)));
}
</script>

<div class="grid border-b border-border" style={`grid-template-columns: 3.5rem repeat(${dates.length}, minmax(0, 1fr))`}>
  <div></div>
  {#each dates as date (date)}
    <div class={['px-1 py-1.5 text-center text-xs', date === today ? 'font-semibold text-primary' : 'text-muted-foreground']}>
      <span>{fmt.weekday(date)}</span>
      <span class="ml-1">{fmt.dayNumber(date)}</span>
    </div>
  {/each}
  <div class="self-center px-1 text-[0.65rem] text-muted-foreground">All day</div>
  {#each dates as date, d (date)}
    <div class="grid min-h-6 gap-0.5 border-l border-border p-0.5" data-allday={date}>
      {#each allDay[d] ?? [] as item (item.key)}
        <EventChip {item} {fmt} {editable} compact {onOpen} {onDragStart} />
      {/each}
    </div>
  {/each}
</div>

<div
  bind:this={scroller}
  class="relative h-[min(36rem,65vh)] overflow-y-auto"
  data-time-scroller
  onscroll={() => {
    if (!scroller) return;
    scrollTop = scroller.scrollTop;
    viewport = scroller.clientHeight;
  }}
>
  <div
    class="relative grid"
    style={`height: ${24 * HOUR_PX}px; grid-template-columns: 3.5rem repeat(${dates.length}, minmax(0, 1fr))`}
    data-columns={dates.length}
  >
    <div class="relative" aria-hidden="true">
      {#each hours as h (h)}
        <span class="absolute right-1 -translate-y-1/2 text-[0.65rem] text-muted-foreground" style={`top: ${h * HOUR_PX}px`}>
          {h === 0 ? '' : fmt.hour(h)}
        </span>
      {/each}
    </div>
    {#each dates as date, d (date)}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="relative border-l border-border" data-day-column={date} onclick={(e) => slotFromPointer(e, date)}>
        {#each hours as h (h)}
          <div class="pointer-events-none absolute inset-x-0 border-t border-border/60" style={`top: ${h * HOUR_PX}px`}></div>
        {/each}
        {#if focus.date === date}
          <button
            type="button"
            class="absolute inset-x-0.5 rounded border border-dashed border-transparent outline-none focus-visible:border-ring focus-visible:bg-primary/5"
            style={`top: ${focus.minute * PX}px; height: ${SLOT_MINUTES * PX}px`}
            data-slot
            data-focused
            data-date={date}
            data-minute={focus.minute}
            aria-label={`Empty slot, ${fmt.longDate(date)}, ${fmt.time(slotInstant(date, focus.minute, timeZone))}${canCreate ? '. Enter adds an event' : ''}`}
            onfocus={() => onFocusSlot(date, focus.minute)}
            onclick={() => canCreate && onCreateAt(date, focus.minute)}
          ></button>
        {/if}
        {#each columns[d] ?? [] as layout (layout.event.key)}
          <EventChip
            item={layout.event}
            {fmt}
            {editable}
            resizable
            compact={layout.endMinute - layout.startMinute < 45}
            {onOpen}
            {onDragStart}
            style={`position: absolute; top: ${layout.startMinute * PX}px; height: ${(layout.endMinute - layout.startMinute) * PX}px; left: ${(layout.column / layout.columnCount) * 100}%; width: calc(${100 / layout.columnCount}% - 2px)`}
          />
        {/each}
        {#if nowLine[d] !== null && nowLine[d] !== undefined}
          <div
            class="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-destructive"
            style={`top: ${(nowLine[d] as number) * PX}px`}
            data-now-line
            aria-hidden="true"
          ></div>
        {/if}
      </div>
    {/each}
  </div>
</div>
