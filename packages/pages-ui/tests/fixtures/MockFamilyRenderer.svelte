<script lang="ts">
import type { Block } from '@protoyard/blocks';

let { block }: { block: Block } = $props();
</script>

<div data-py-mock-family data-mock-type={block.type}>
  {#if block.type === 'heading'}
    <p>{block.text}</p>
  {:else if block.type === 'text'}
    <p>{block.markdown}</p>
  {:else}
    <p>{block.type}</p>
  {/if}
</div>
