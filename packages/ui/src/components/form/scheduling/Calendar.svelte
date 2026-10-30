<script lang="ts">
import type { DateInvalidHandler } from '@texuli/primitives/date-picker';
import { tick } from 'svelte';
import { Calendar as TexuliCalendar } from 'texuli/date';
import { cn } from '../../../lib/cn.ts';
import type { DateRange, IsoDate } from './dates.ts';
import { texuliUnavailable, texuliWeekStart } from './texuli-date.ts';
import type { IsoWeekday } from './weekdays.ts';

/**
 * Calendar — one month as an ARIA grid, on Texuli's styled `Calendar`
 * (`texuli/date`): a single tab stop, arrows move a day or a week, Home/End
 * go to the start or end of the week, PageUp/PageDown change the month (with
 * Shift, the year), Enter or Space picks the date. Unavailable dates are
 * disabled. Pass `today` (the scenario clock's date) and the clock is never
 * read. With `range`, the span is highlighted and two picks choose a range.
 */
interface Props {
  /** The picked date (single mode). */
  selected?: IsoDate | null;
  /** A range to highlight (range mode). */
  range?: DateRange | null;
  /**
   * The focused date (bindable), which sets the month shown: setting it moves
   * the calendar, and arrows, paging and the month buttons write it back.
   * When empty, the calendar opens on `selected` (or the range start, else
   * `today`).
   */
  focusDate?: IsoDate | null;
  /** Marks today; pass the scenario clock's date for a deterministic prototype. */
  today?: IsoDate | null;
  min?: IsoDate | null;
  max?: IsoDate | null;
  isDateDisabled?: (date: IsoDate) => boolean;
  weekStartsOn?: IsoWeekday;
  locale?: string;
  /** Accessible name of the calendar group; the grid is named by its month. */
  label?: string;
  /** Range mode: the longest range in days, both ends included. */
  maxDays?: number;
  /** Range mode: a refused range (`start/end`, `'too-long'`). */
  onInvalid?: DateInvalidHandler;
  /** Range mode: the range after each pick (the first pick leaves `end` null). */
  onRangeChange?: (range: DateRange) => void;
  class?: string;
  /** The date picked (in range mode, the day of each of the two picks). */
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
  maxDays,
  onInvalid,
  onRangeChange,
  class: className,
  onselect,
}: Props = $props();

let root = $state<HTMLDivElement | null>(null);
/** The start chosen by the first of two range picks, to tell which day the second chose. */
let pendingStart: IsoDate | null = null;

function dayButton(date: IsoDate): HTMLButtonElement | null {
  return root?.querySelector<HTMLButtonElement>(`[data-calendar-date="${date}"]`) ?? null;
}

/** The day that holds the grid's tab stop, where focus belongs when the calendar opens. */
export function focusTarget(): HTMLButtonElement | null {
  return root?.querySelector<HTMLButtonElement>('[data-calendar-date][tabindex="0"]') ?? null;
}

/** Moves keyboard focus to `date` when it is shown, else to the grid's tab stop. */
export async function focus(date?: IsoDate): Promise<void> {
  await tick();
  ((date ? dayButton(date) : null) ?? focusTarget())?.focus();
}

function rangePicked(next: DateRange) {
  onRangeChange?.(next);
  // The first pick sets the start; the second completes the (ordered) range.
  const picked =
    next.end === null ? next.start : next.start === pendingStart ? next.end : next.start;
  pendingStart = next.end === null ? next.start : null;
  if (picked) onselect?.(picked);
}
</script>

<div bind:this={root} class={cn('ui-calendar w-full max-w-[20rem] select-none', className)}>
  <TexuliCalendar
    value={range ? null : selected}
    bind:focusedValue={() => focusDate ?? undefined, (next) => (focusDate = next ?? null)}
    {...range ? { range: { start: range.start, end: range.end } } : {}}
    {...locale ? { locale } : {}}
    {...min ? { minValue: min } : {}}
    {...max ? { maxValue: max } : {}}
    {...isDateDisabled ? { isDateUnavailable: texuliUnavailable(isDateDisabled) } : {}}
    {...today ? { today } : {}}
    weekStartsOn={texuliWeekStart(weekStartsOn)}
    {...maxDays !== undefined ? { maxDays } : {}}
    {...onInvalid ? { onInvalid } : {}}
    {label}
    onValueChange={(date) => onselect?.(date)}
    onRangeChange={rangePicked}
  />
</div>
