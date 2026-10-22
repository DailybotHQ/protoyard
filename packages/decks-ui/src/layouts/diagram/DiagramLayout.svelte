<script lang="ts">
import type { DeckLayoutId } from '@protoyard/decks';
import { composeLayout, layoutProps } from '../compose.ts';
import Invalid from '../design/Invalid.svelte';
import CodeWithCallout from './CodeWithCallout.svelte';
import FreeSlide from './FreeSlide.svelte';
import ProcessSteps from './ProcessSteps.svelte';
import Timeline from './Timeline.svelte';

let { layout, props }: { layout: DeckLayoutId; props: unknown } = $props();
// biome-ignore lint/suspicious/noExplicitAny: each composition types its own validated props.
const p = $derived(layoutProps<any>(layout, props));
// Free slides validate their blocks through the shared composition boundary.
const free = $derived(layout === 'free' ? composeLayout('free', props) : null);
</script>

{#if layout === 'free'}
  {#if free?.ok}<FreeSlide blocks={free.blocks} />{:else}<Invalid />{/if}
{:else if !p}
  <Invalid />
{:else if layout === 'code-with-callout'}
  <CodeWithCallout props={p} />
{:else if layout === 'process-steps'}
  <ProcessSteps props={p} />
{:else if layout === 'timeline'}
  <Timeline props={p} />
{:else}
  <Invalid />
{/if}
