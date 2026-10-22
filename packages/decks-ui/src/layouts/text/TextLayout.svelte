<script lang="ts">
import type { DeckLayoutId } from '@protoyard/decks';
import { layoutProps } from '../compose.ts';
import Invalid from '../design/Invalid.svelte';
import ClosingCta from './ClosingCta.svelte';
import Quote from './Quote.svelte';
import SectionDivider from './SectionDivider.svelte';
import ThreeColumnCards from './ThreeColumnCards.svelte';
import TitleHero from './TitleHero.svelte';
import TwoColumnSplit from './TwoColumnSplit.svelte';

let { layout, props }: { layout: DeckLayoutId; props: unknown } = $props();
// biome-ignore lint/suspicious/noExplicitAny: each composition types its own validated props.
const p = $derived(layoutProps<any>(layout, props));
</script>

{#if !p}
  <Invalid />
{:else if layout === 'title-hero'}
  <TitleHero props={p} />
{:else if layout === 'section-divider'}
  <SectionDivider props={p} />
{:else if layout === 'two-column-split'}
  <TwoColumnSplit props={p} />
{:else if layout === 'three-column-cards'}
  <ThreeColumnCards props={p} />
{:else if layout === 'quote'}
  <Quote props={p} />
{:else if layout === 'closing-cta'}
  <ClosingCta props={p} />
{:else}
  <Invalid />
{/if}
