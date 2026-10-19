<script lang="ts">
import type { ComponentProps } from 'svelte';
import LineChart from './LineChart.svelte';

/** A LineChart with filled areas; `stacked` piles the series on top of each other. */
let { hidden = $bindable(new Set<string>()), ...rest }: ComponentProps<typeof LineChart> = $props();
</script>

<LineChart {...rest} area bind:hidden />
