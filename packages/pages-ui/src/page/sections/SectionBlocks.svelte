<script lang="ts">
import type { Block } from '@protoyard/blocks';
import { LoadingState } from '@protoyard/ui';
import { BlockHost } from '../../block-host/index.ts';
import { getFormServices } from '../../form/context.ts';
import { isNumberedSteps, isPlainStat } from '../design.ts';
import PageActions from './PageActions.svelte';
import PlainText from './PlainText.svelte';
import PricingColumns from './PricingColumns.svelte';
import PullQuote from './PullQuote.svelte';
import SectionHeader from './SectionHeader.svelte';
import StatRow from './StatRow.svelte';
import StepsRow from './StepsRow.svelte';

/**
 * A section's blocks with page design: stat rows, pricing columns, numbered
 * steps, pull quotes and page actions are drawn here from block data (text
 * nodes only); every other block goes through the lazy BlockHost, inside a
 * width that suits it.
 */
let {
  blocks,
  sectionId,
  context = 'body',
  pricing = false,
}: {
  blocks: readonly Block[];
  sectionId: string;
  context?: 'hero' | 'body' | 'band';
  pricing?: boolean;
} = $props();

const NARROW = new Set<Block['type']>([
  'text',
  'list',
  'callout',
  'heading',
  'reveal',
  'tabs',
  'poll',
  'quiz',
]);
const MEDIUM = new Set<Block['type']>(['comparison', 'table', 'code']);
const FORM = new Set<Block['type']>(['form', 'calculator', 'counter']);

// Set by PageApp from the kind runtime; without it a form keeps the block preview.
const formServices = getFormServices();

function width(block: Block): string {
  if (FORM.has(block.type)) return 'mx-auto w-full max-w-xl';
  if (NARROW.has(block.type)) return 'mx-auto w-full max-w-3xl';
  if (MEDIUM.has(block.type)) return 'mx-auto w-full max-w-4xl';
  return 'w-full';
}
</script>

{#each blocks as block, index (`${sectionId}-${index}`)}
  {#if block.type === 'cta' && context !== 'body'}
    <PageActions {block} tone={context} />
  {:else if block.type === 'cta'}
    <PageActions {block} tone="section" />
  {:else if context === 'band' && (block.type === 'callout' || block.type === 'text')}
    <PlainText
      text={block.type === 'callout' ? block.body : block.markdown}
      class="mx-auto max-w-2xl text-center text-lg text-primary-foreground"
    />
  {:else if context === 'band' && block.type === 'heading'}
    <SectionHeader heading={block} inverted />
  {:else if context === 'hero' && block.type === 'text'}
    <PlainText text={block.markdown} class="mx-auto max-w-2xl text-center text-lg text-muted-foreground" />
  {:else if block.type === 'stat' && isPlainStat(block)}
    <StatRow {block} />
  {:else if block.type === 'cards' && pricing}
    <PricingColumns {block} />
  {:else if block.type === 'steps' && isNumberedSteps(block)}
    <StepsRow {block} />
  {:else if block.type === 'quote' && block.avatar === undefined}
    <PullQuote {block} />
  {:else if block.type === 'form' && formServices}
    <div class="mx-auto w-full max-w-xl" data-py-page-block="form">
      {#await import('../../form/FormBlock.svelte')}
        <LoadingState label="Loading the form" class="py-8" />
      {:then { default: FormBlock }}
        <FormBlock form={block} services={formServices} />
      {:catch}
        <BlockHost {block} />
      {/await}
    </div>
  {:else if context === 'band'}
    <div class="mx-auto w-full max-w-3xl rounded-2xl bg-background p-4 text-start text-foreground sm:p-6">
      <BlockHost {block} />
    </div>
  {:else if block.type === 'heading'}
    <SectionHeader heading={block} />
  {:else}
    <div class={width(block)} data-py-page-block={block.type}>
      <BlockHost {block} />
    </div>
  {/if}
{/each}
