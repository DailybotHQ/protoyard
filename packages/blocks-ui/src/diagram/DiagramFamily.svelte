<script lang="ts">
import type { BlockFamilyRendererProps } from '../registry.ts';
import BoardDiagram from './BoardDiagram.svelte';
import FlowDiagram from './FlowDiagram.svelte';
import TerminalDiagram from './TerminalDiagram.svelte';
import TreeDiagram from './TreeDiagram.svelte';

let { block }: BlockFamilyRendererProps = $props();
</script>

{#if block.type === 'flow'}
  <FlowDiagram {block} />
{:else if block.type === 'tree'}
  <TreeDiagram {block} />
{:else if block.type === 'board'}
  <BoardDiagram {block} />
{:else if block.type === 'terminal'}
  <TerminalDiagram {block} />
{:else}
  <p class="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground" role="note">
    This block renderer is not available yet.
  </p>
{/if}
