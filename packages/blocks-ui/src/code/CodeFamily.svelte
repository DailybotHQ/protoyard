<script lang="ts">
import type { BlockFamilyRendererProps } from '../registry.ts';
import CodeBlock from './CodeBlock.svelte';

let { block }: BlockFamilyRendererProps = $props();
</script>

{#if block.type === 'code'}
  <CodeBlock {block} />
{:else}
  <p class="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground" role="note">
    This block renderer is not available yet.
  </p>
{/if}
