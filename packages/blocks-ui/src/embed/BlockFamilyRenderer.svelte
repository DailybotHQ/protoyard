<script lang="ts">
import type { Block, EmbedAppBlock } from '@protoyard/blocks';
import EmbedApp from './EmbedApp.svelte';

interface Props {
  block: Block;
}

let { block }: Props = $props();
</script>

{#if block.type === 'embed-app'}
  <EmbedApp block={block as EmbedAppBlock} />
{:else}
  <p class="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground" role="note">
    This embed family cannot render a {block.type} block.
  </p>
{/if}
