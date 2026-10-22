<script lang="ts">
import type { DeckLayoutId } from '@protoyard/decks';
import { layoutProps } from '../compose.ts';
import Invalid from '../design/Invalid.svelte';
import BigStat from './BigStat.svelte';
import ChartSlide from './ChartSlide.svelte';
import ComparisonTable from './ComparisonTable.svelte';

let { layout, props }: { layout: DeckLayoutId; props: unknown } = $props();
// biome-ignore lint/suspicious/noExplicitAny: each composition types its own validated props.
const p = $derived(layoutProps<any>(layout, props));
</script>

{#if !p}
  <Invalid />
{:else if layout === 'big-stat'}
  <BigStat props={p} />
{:else if layout === 'comparison-table'}
  <ComparisonTable props={p} />
{:else if layout === 'chart'}
  <ChartSlide props={p} />
{:else}
  <Invalid />
{/if}
