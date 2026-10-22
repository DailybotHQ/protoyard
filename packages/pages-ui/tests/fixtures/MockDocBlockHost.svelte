<script lang="ts">
/**
 * Test double for BlockHost: paints heading text as real hN elements so
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
  >
    {typed.text}
  </svelte:element>
{:else if typed}
  <div data-py-mock-block-host data-type={typed.type}>{typed.type}</div>
{:else}
  <div data-py-mock-block-host data-type="unknown">unknown</div>
{/if}
