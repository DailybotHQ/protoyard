<script lang="ts">
import { CalendarRange } from '@lucide/svelte';
import {
  DateRangePanel,
  DateRangePicker,
  describeDateRange,
} from '@protoyard/analytics-ui/date-range';
import { BottomSheet, Button } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import { sharedRange } from '../lib/range.svelte.ts';

/**
 * The shared date range. Wide screens get the popover picker; phones (and
 * device shells) get a button that opens the same panel in a bottom sheet.
 */
let { now }: { now: Date } = $props();

let sheetOpen = $state(false);
const described = $derived(describeDateRange(sharedRange.value, now.getTime()));
</script>

<div class="hidden sm:block device-frame:hidden">
  <DateRangePicker value={sharedRange.value} {now} onchange={(value) => sharedRange.set(value)} />
</div>
<div class="sm:hidden device-frame:block">
  <Button variant="outline" size="sm" onclick={() => (sheetOpen = true)} aria-haspopup="dialog">
    <LucideIcon icon={CalendarRange} class="size-4" />{described.label}
  </Button>
  <BottomSheet bind:open={sheetOpen} title="Date range" description={described.span}>
    <DateRangePanel
      value={sharedRange.value}
      now={now.getTime()}
      onchange={(value, change) => {
        sharedRange.set(value);
        // A new range closes the sheet; comparison and granularity are tweaks that keep it open.
        if (change === 'range') sheetOpen = false;
      }}
    />
  </BottomSheet>
</div>
