<script lang="ts">
/**
 * Structure: Texuli when shape validates; local for nested Protoyard-only
 * children, cards with images, and CTA host actions. Extensions: timeline,
 * steps, comparison, icon.
 */
import type { Block } from '@protoyard/blocks';
import { checkStructureBlock } from '@texuli/blocks/structure';
import { StructureFamily as TexuliStructure } from '@texuli/blocks/structure/renderers';
import { TEXULI_STRUCTURE_TYPES, toTexuliStructureBlock } from '../compat/structure.ts';
import { getBlockHost } from '../host.ts';
import CardsBlock from './CardsBlock.svelte';
import ColumnsBlock from './ColumnsBlock.svelte';
import ComparisonBlock from './ComparisonBlock.svelte';
import CtaBlock from './CtaBlock.svelte';
import IconBlock from './IconBlock.svelte';
import StepsBlock from './StepsBlock.svelte';
import TimelineBlock from './TimelineBlock.svelte';

let { block }: { block: Block } = $props();
const host = getBlockHost();
/** Deck slides need fixed Tailwind grid cols; Texuli structure is fluid CSS. */
const slideMode = $derived(host.canvasMode === 'slide');

const needsLocalCards = $derived(
  block.type === 'cards' &&
    Array.isArray(block.items) &&
    block.items.some((item) => item && typeof item === 'object' && 'image' in item && item.image)
);
const needsLocalCta = $derived(block.type === 'cta' && Boolean(host.onCtaAction));

const mapped = $derived(
  TEXULI_STRUCTURE_TYPES.has(block.type) && !needsLocalCards && !needsLocalCta && !slideMode
    ? toTexuliStructureBlock(block)
    : null
);
const texuliOk = $derived(mapped !== null && checkStructureBlock(mapped).ok);
</script>

<div data-py-block-family="structure" data-tx-blocks="structure">
  {#if texuliOk && mapped}
    <TexuliStructure block={mapped} />
  {:else if block.type === 'columns'}
    <ColumnsBlock {block} />
  {:else if block.type === 'cards'}
    <CardsBlock {block} />
  {:else if block.type === 'cta'}
    <CtaBlock {block} />
  {:else if block.type === 'timeline'}
    <div data-py-block-extension="timeline"><TimelineBlock {block} /></div>
  {:else if block.type === 'steps'}
    <div data-py-block-extension="steps"><StepsBlock {block} /></div>
  {:else if block.type === 'comparison'}
    <div data-py-block-extension="comparison"><ComparisonBlock {block} /></div>
  {:else if block.type === 'icon'}
    <div data-py-block-extension="icon"><IconBlock {block} /></div>
  {:else}
    <p class="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground" role="note">
      This structure block needs a newer Protoyard.
    </p>
  {/if}
</div>
