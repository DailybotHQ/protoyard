<script lang="ts">
/**
 * Interactive family:
 * - poll/quiz/calculator/checklist → `@texuli/blocks/interactive` when no
 *   BlockStateHost (ephemeral).
 * - With a host (decks): local host-backed adapters for shared votes/scores.
 * - Extensions always local: form, counter, chart-controls, reveal, tabs.
 * Always stamps data-py-block + data-py-deck-interactive for deck click isolation.
 */
import type { Block } from '@protoyard/blocks';
import { InteractiveBlockView } from '@texuli/blocks/interactive/renderers';
import { TEXULI_INTERACTIVE_TYPES, toTexuliInteractiveBlock } from '../compat/interactive.ts';
import { getBlockHost } from '../host.ts';
import { DECK_INTERACTIVE_ATTRIBUTE } from '../lib/deck-interactive.ts';
import CalculatorBlock from './CalculatorBlock.svelte';
import ChartControlsBlock from './ChartControlsBlock.svelte';
import CounterBlock from './CounterBlock.svelte';
import FormBlockView from './FormBlockView.svelte';
import PollBlock from './PollBlock.svelte';
import QuizBlock from './QuizBlock.svelte';
import RevealBlockView from './RevealBlockView.svelte';
import TabsBlockView from './TabsBlockView.svelte';

let { block }: { block: Block } = $props();
const host = getBlockHost();
const hasStateHost = $derived(Boolean(host.stateHost));
const useTexuliCore = $derived(
  TEXULI_INTERACTIVE_TYPES.has(block.type) && !hasStateHost && host.canvasMode !== 'slide'
);
const deckAttrs = $derived({
  'data-py-block': block.type,
  [DECK_INTERACTIVE_ATTRIBUTE]: true as const,
});
</script>

<div data-py-block-family="interactive" data-tx-blocks="interactive" {...deckAttrs}>
  {#if useTexuliCore}
    <InteractiveBlockView block={toTexuliInteractiveBlock(block)} />
  {:else if block.type === 'poll'}
    <PollBlock {block} />
  {:else if block.type === 'quiz'}
    <QuizBlock {block} />
  {:else if block.type === 'calculator'}
    <CalculatorBlock {block} />
  {:else if block.type === 'tabs'}
    <div data-py-block-extension="tabs"><TabsBlockView {block} /></div>
  {:else if block.type === 'reveal'}
    <div data-py-block-extension="reveal"><RevealBlockView {block} /></div>
  {:else if block.type === 'counter'}
    <div data-py-block-extension="counter"><CounterBlock {block} /></div>
  {:else if block.type === 'chart-controls'}
    <div data-py-block-extension="chart-controls"><ChartControlsBlock {block} /></div>
  {:else if block.type === 'form'}
    <div data-py-block-extension="form"><FormBlockView {block} /></div>
  {:else}
    <p class="text-sm text-muted-foreground" role="note" data-py-block-fallback>
      This interactive block is not available in this build.
    </p>
  {/if}
</div>
