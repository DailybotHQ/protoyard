<script lang="ts">
import type { ComponentProps } from 'svelte';
import DonutChart from './DonutChart.svelte';

/** A DonutChart without the hole. */
let props: ComponentProps<typeof DonutChart> = $props();
</script>

<DonutChart {...props} innerRatio={0} />
