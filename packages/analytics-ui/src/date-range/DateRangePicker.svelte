<script lang="ts">
import { Button, Popover } from '@protoyard/ui';
import DateRangePanel from './DateRangePanel.svelte';
import {
  COMPARISON_LABELS,
  type DateRangeChange,
  type DateRangeValue,
  rangeLabel,
} from './model.ts';

type Props = {
  value: DateRangeValue;
  /** "Now" from the simulated clock, e.g. `useClock().now.getTime()`. */
  now: number | Date;
  /** Receives every change; store it (and `toDateRangeQuery`) in the route or a service. */
  onchange: (value: DateRangeValue) => void;
  weekStartsOn?: number;
  class?: string;
};

let { value, now, onchange, weekStartsOn = 1, class: className = '' }: Props = $props();
let open = $state(false);
const nowMs = $derived(typeof now === 'number' ? now : now.getTime());

function change(next: DateRangeValue, kind: DateRangeChange) {
  onchange(next);
  // A new range is a finished choice; comparison and granularity are tweaks.
  if (kind === 'range') open = false;
}
</script>

<Popover bind:open align="start" class="w-[min(40rem,calc(100vw-2rem))]">
  {#snippet trigger({ props })}
    <Button {...props} variant="outline" class={className} >
      <!-- Visible text stays inside the name (WCAG 2.5.3); the prefix is for screen readers. -->
      <span class="sr-only">Date range:</span>
      <span>{rangeLabel(value.range, nowMs)}</span>
      {#if value.comparison !== 'none'}
        <span class="text-muted-foreground">vs {COMPARISON_LABELS[value.comparison].toLowerCase()}</span>
      {/if}
    </Button>
  {/snippet}
  <DateRangePanel {value} now={nowMs} {weekStartsOn} onchange={change} />
</Popover>
