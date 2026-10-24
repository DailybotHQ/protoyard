<script lang="ts">
import { ChevronLeft, ChevronRight } from '@lucide/svelte';
import { tick } from 'svelte';
import { cn } from '../../../lib/cn.ts';
import {
  addDays,
  addMonths,
  type DateRange,
  formatIsoDate,
  type IsoDate,
  isInRange,
  isoDateFromInstant,
  isWithinBounds,
  monthGrid,
  monthLabel,
  parseIsoDate,
  startOfWeek,
} from './dates.ts';
import { type IsoWeekday, orderedWeekdays, weekdayName } from './weekdays.ts';

/**
 * Calendar — one month as an ARIA grid with a single tab stop. Arrows move a
 * day or a week, Home/End go to the start or end of the week, PageUp/PageDown
 * change the month (with Shift, the year), Enter or Space picks the date.
 * Unavailable dates stay focusable but cannot be picked.
 */
interface Props {
  /** The picked date (single mode). */
  selected?: IsoDate | null;
  /** A range to highlight (range mode). */
  range?: DateRange | null;
  /** The focused date; its month is the one shown. */
  focusDate?: IsoDate | null;
  /** Marks today; pass the scenario clock's date for a deterministic prototype. */
  today?: IsoDate | null;
  min?: IsoDate | null;
  max?: IsoDate | null;
  isDateDisabled?: (date: IsoDate) => boolean;
  weekStartsOn?: IsoWeekday;
  locale?: string;
  /** Accessible name of the grid; the month is always announced alongside. */
  label?: string;
  class?: string;
  onselect?: (date: IsoDate) => void;
}

let {
  selected = null,
  range = null,
  focusDate = $bindable(null),
  today = null,
  min = null,
  max = null,
  isDateDisabled,
  weekStartsOn = 1,
  locale,
  label = 'Choose a date',
  class: className,
  onselect,
}: Props = $props();

const uid = $props.id();
const headingId = `calendar-heading-${uid}`;
let grid = $state<HTMLTableElement | null>(null);

// The real clock is only a last resort when the caller passes no date at all.
const anchor = $derived(
  focusDate ?? selected ?? range?.start ?? today ?? min ?? isoDateFromInstant(new Date())
);
const view = $derived(parseIsoDate(anchor) ?? { year: 1970, month: 1, day: 1 });
const weeks = $derived(monthGrid(view.year, view.month, weekStartsOn));
const heading = $derived(monthLabel(view.year, view.month, locale));
const columns = $derived(
  orderedWeekdays(weekStartsOn).map((day) => ({
    day,
    short: weekdayName(day, locale, 'narrow'),
    long: weekdayName(day, locale, 'long'),
  }))
);

function unavailable(date: IsoDate): boolean {
  return !isWithinBounds(date, { min, max }) || Boolean(isDateDisabled?.(date));
}

/** The button of the focused date, where keyboard focus belongs when the calendar opens. */
export function focusTarget(): HTMLButtonElement | null {
  return (
    grid?.querySelector<HTMLButtonElement>(`button[data-date="${focusDate ?? anchor}"]`) ?? null
  );
}

/** Moves keyboard focus to the focused date (or `date`) inside the grid. */
export async function focus(date?: IsoDate): Promise<void> {
  if (date) focusDate = date;
  else if (!focusDate) focusDate = anchor;
  await tick();
  grid?.querySelector<HTMLButtonElement>(`button[data-date="${focusDate}"]`)?.focus();
}

function onkeydown(event: KeyboardEvent, date: IsoDate) {
  const steps: Record<string, () => IsoDate> = {
    ArrowLeft: () => addDays(date, -1),
    ArrowRight: () => addDays(date, 1),
    ArrowUp: () => addDays(date, -7),
    ArrowDown: () => addDays(date, 7),
    Home: () => startOfWeek(date, weekStartsOn),
    End: () => addDays(startOfWeek(date, weekStartsOn), 6),
    PageUp: () => addMonths(date, event.shiftKey ? -12 : -1),
    PageDown: () => addMonths(date, event.shiftKey ? 12 : 1),
  };
  const step = steps[event.key];
  if (!step) return;
  event.preventDefault();
  void focus(step());
}

function pick(date: IsoDate) {
  focusDate = date;
  if (unavailable(date)) return;
  onselect?.(date);
}

function cellClasses(date: IsoDate, inMonth: boolean): string {
  const isSelected = date === selected || date === range?.start || date === range?.end;
  const between = !isSelected && range ? isInRange(date, range) : false;
  return cn(
    'relative mx-auto flex size-10 items-center justify-center rounded-md text-sm tabular-nums sm:size-9',
    'outline-none transition-colors duration-150 motion-reduce:transition-none',
    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
    inMonth ? 'text-foreground' : 'text-muted-foreground',
    !isSelected && 'hover:bg-muted',
    between && 'bg-primary/10 text-foreground',
    isSelected && 'bg-primary font-semibold text-primary-foreground hover:bg-primary-hover',
    date === today && !isSelected && 'font-semibold text-primary underline underline-offset-4',
    unavailable(date) && 'cursor-not-allowed line-through opacity-50 hover:bg-transparent'
  );
}
</script>

<div class={cn('ui-calendar w-full max-w-[20rem] select-none', className)}>
  <div class="mb-2 flex items-center justify-between gap-2">
    <button
      type="button"
      class="flex size-9 min-h-touch min-w-[44px] items-center justify-center rounded-md text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0 sm:min-w-0"
      aria-label="Previous month"
      onclick={() => (focusDate = addMonths(anchor, -1))}
    >
      <ChevronLeft class="size-4" aria-hidden="true" />
    </button>
    <div id={headingId} class="text-sm font-semibold text-foreground" aria-live="polite">
      {heading}
    </div>
    <button
      type="button"
      class="flex size-9 min-h-touch min-w-[44px] items-center justify-center rounded-md text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0 sm:min-w-0"
      aria-label="Next month"
      onclick={() => (focusDate = addMonths(anchor, 1))}
    >
      <ChevronRight class="size-4" aria-hidden="true" />
    </button>
  </div>
  <table
    bind:this={grid}
    role="grid"
    aria-label={`${label}, ${heading}`}
    class="w-full border-collapse"
  >
    <thead>
      <tr>
        {#each columns as column (column.day)}
          <th scope="col" abbr={column.long} class="pb-1 text-center text-xs font-medium text-muted-foreground">
            {column.short}
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each weeks as week (week[0]?.date)}
        <tr>
          {#each week as cell (cell.date)}
            {@const isSelected =
              cell.date === selected || cell.date === range?.start || cell.date === range?.end}
            <td role="gridcell" class="p-0.5 text-center" aria-selected={isSelected}>
              <button
                type="button"
                data-date={cell.date}
                tabindex={cell.date === anchor ? 0 : -1}
                aria-label={formatIsoDate(cell.date, locale)}
                aria-current={cell.date === today ? 'date' : undefined}
                aria-disabled={unavailable(cell.date) || undefined}
                class={cellClasses(cell.date, cell.inMonth)}
                onclick={() => pick(cell.date)}
                onkeydown={(event) => onkeydown(event, cell.date)}
              >
                {cell.day}
              </button>
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>
