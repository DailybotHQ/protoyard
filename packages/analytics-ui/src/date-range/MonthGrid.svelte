<script lang="ts">
import { Calendar } from 'texuli/date';
import { isoDay } from './model.ts';

type DateRange = { start: string | null; end: string | null };

type Props = {
  /** Selected span as `YYYY-MM-DD` days (end may be missing while picking). */
  start?: string | null;
  end?: string | null;
  /** The day that holds focus first (`YYYY-MM-DD`). */
  initial: string;
  /** Days after this instant cannot be picked (the simulated "now"). */
  max?: number;
  weekStartsOn?: number;
  onrange: (range: DateRange) => void;
};

let { start = null, end = null, initial, max, weekStartsOn = 1, onrange }: Props = $props();

// The range-mode calendar receives the caller's stable clock and selection.
const range = $derived({ start, end });
const maxValue = $derived(max === undefined ? undefined : isoDay(max));
const today = $derived(maxValue ?? initial);
</script>

<Calendar
  {range}
  onRangeChange={onrange}
  {maxValue}
  {today}
  {weekStartsOn}
  maxDays={3660}
  label="Choose a date range day"
  class="w-full"
/>
