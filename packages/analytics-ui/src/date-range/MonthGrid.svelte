<script lang="ts">
import { Calendar } from 'texuli/date';
import { isoDay } from './model.ts';

type Props = {
  /** Selected span as `YYYY-MM-DD` days (end may be missing while picking). */
  start?: string | null;
  end?: string | null;
  /** The day that holds focus first (`YYYY-MM-DD`); also sets the visible month. */
  initial: string;
  /** Days after this instant cannot be picked (the simulated "now"). */
  max?: number;
  weekStartsOn?: number;
  onpick: (day: string) => void;
};

let { start = null, initial, max, onpick }: Props = $props();

// Texuli 0.3.0 Calendar owns the accessible calendar grid and keyboard model.
// Its value API does not yet expose an initial visible date or range highlighting.
const selected = $derived(start ?? initial);
const maxValue = $derived(max === undefined ? undefined : isoDay(max));
</script>

<Calendar
  value={selected}
  onValueChange={onpick}
  {maxValue}
  label="Choose a date range day"
  class="w-full"
/>
