<script lang="ts">
import { DateRangePicker } from '@protoyard/analytics-ui/date-range';
import { sharedRange } from '../lib/range.svelte.ts';

let { now }: { now: Date } = $props();
</script>

<DateRangePicker value={sharedRange.value} {now} onchange={(value) => sharedRange.set(value)} />
