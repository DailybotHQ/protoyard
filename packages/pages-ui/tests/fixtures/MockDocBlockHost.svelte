<script lang="ts">
/**
 * Test double for BlockHost: paints heading blocks as real hN elements
 * (marked `data-py-block-heading`, like blocks-ui) and a callout's title as
 * an h3 that is not a heading block, so
 * DocsLayout TOC + DocHost id stamping can be exercised without loading
 * blocks-ui family chunks.
 */
import type { Block } from '@protoyard/blocks';

let {
  block,
}: {
  block: Block | unknown;
} = $props();

const typed = $derived(
  block && typeof block === 'object' && 'type' in block ? (block as Block) : null
);
</script>

{#if typed?.type === 'heading'}
  <svelte:element
    this={`h${typed.level ?? 2}`}
    data-py-mock-doc-heading={typed.id ?? ''}
    data-py-mock-block-host
    data-py-block-heading
  >
    {typed.text}
  </svelte:element>
{:else if typed?.type === 'callout'}
  <!-- Like blocks-ui: a callout title is a heading element, but not a heading block. -->
  <div data-py-mock-block-host data-type="callout"><h3>{typed.title ?? 'Callout'}</h3></div>
{:else if typed}
  <div data-py-mock-block-host data-type={typed.type}>{typed.type}</div>
{:else}
  <div data-py-mock-block-host data-type="unknown">unknown</div>
{/if}
