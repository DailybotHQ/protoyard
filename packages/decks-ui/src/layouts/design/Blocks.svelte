<script lang="ts">
import { safeParseBlocks } from '@protoyard/blocks';
import { BlockRenderer } from '@protoyard/blocks-ui';
import { deckInputGuardAttributes } from '../compose.ts';

/**
 * Renders a block list after validating it again (layout compositions build
 * blocks from validated props, so a failure here is a bug, shown as a note).
 * Interactive, data and code blocks carry the deck input guard attribute so
 * their controls never advance the deck.
 */
let { blocks, class: className = '' }: { blocks: unknown[]; class?: string } = $props();
const parsed = $derived(safeParseBlocks(blocks));
</script>

{#if parsed.success}
  {#each parsed.data as block, index (index)}
    <div class={`min-w-0 ${className}`} {...deckInputGuardAttributes(block)}>
      <BlockRenderer blocks={[block]} />
    </div>
  {/each}
{:else}
  <p class="text-[24px] text-muted-foreground" role="note">This part of the slide could not be shown.</p>
{/if}
