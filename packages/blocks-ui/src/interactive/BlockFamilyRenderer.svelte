<script lang="ts">
import type { Block } from '@protoyard/blocks';
import CalculatorBlock from './CalculatorBlock.svelte';
import ChartControlsBlock from './ChartControlsBlock.svelte';
import CounterBlock from './CounterBlock.svelte';
import FormBlockView from './FormBlockView.svelte';
import PollBlock from './PollBlock.svelte';
import QuizBlock from './QuizBlock.svelte';
import RevealBlockView from './RevealBlockView.svelte';
import TabsBlockView from './TabsBlockView.svelte';

let { block }: { block: Block } = $props();
</script>

{#if block.type === 'poll'}
  <PollBlock {block} />
{:else if block.type === 'quiz'}
  <QuizBlock {block} />
{:else if block.type === 'calculator'}
  <CalculatorBlock {block} />
{:else if block.type === 'counter'}
  <CounterBlock {block} />
{:else if block.type === 'tabs'}
  <TabsBlockView {block} />
{:else if block.type === 'reveal'}
  <RevealBlockView {block} />
{:else if block.type === 'chart-controls'}
  <ChartControlsBlock {block} />
{:else if block.type === 'form'}
  <FormBlockView {block} />
{:else}
  <p class="text-sm text-muted-foreground" role="note" data-py-block-fallback>
    This interactive block is not available in this build.
  </p>
{/if}
