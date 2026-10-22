<script lang="ts">
import Blocks from './Blocks.svelte';

/**
 * Author text from layout props, rendered through the shared text block (the
 * safe Markdown AST: no HTML) at the size the composition sets on `class`.
 */
let { text, class: className = '' }: { text: string; class?: string } = $props();
</script>

<div class={`deck-md min-w-0 ${className}`} data-slot-md>
  <Blocks blocks={[{ type: 'text', markdown: text }]} />
</div>

<style>
  /* The text block sets text-sm on its wrapper; on a slide the composition owns the size. */
  .deck-md :global(div),
  .deck-md :global(p),
  .deck-md :global(li),
  .deck-md :global(blockquote) {
    font-size: inherit;
    line-height: inherit;
  }
</style>
