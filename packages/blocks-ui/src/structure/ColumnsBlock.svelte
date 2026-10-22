<script lang="ts">
import type { ColumnsBlock } from '@protoyard/blocks';
import type { Component } from 'svelte';
import { fragmentAttributes, getBlockHost } from '../host.ts';
import type { BlockFamilyRenderer } from '../registry.ts';

let { block }: { block: ColumnsBlock } = $props();
const host = getBlockHost();
const slide = $derived(host.canvasMode === 'slide');

// On a slide (a fixed-size canvas) the columns are fixed; viewport
// breakpoints would follow the phone, not the slide.
const slideWidths = $derived(
  block.widths === 'wide-start'
    ? 'grid-cols-[2fr_1fr]'
    : block.widths === 'wide-end'
      ? 'grid-cols-[1fr_2fr]'
      : block.columns.length === 3
        ? 'grid-cols-3'
        : block.columns.length >= 4
          ? 'grid-cols-4'
          : 'grid-cols-2'
);

const widths = $derived(
  block.widths === 'wide-start'
    ? 'sm:grid-cols-[2fr_1fr]'
    : block.widths === 'wide-end'
      ? 'sm:grid-cols-[1fr_2fr]'
      : block.columns.length === 3
        ? 'sm:grid-cols-3'
        : block.columns.length >= 4
          ? 'sm:grid-cols-2 lg:grid-cols-4'
          : 'sm:grid-cols-2'
);

type ChildResult =
  | { kind: 'render'; component: BlockFamilyRenderer; block: unknown }
  | { kind: 'fallback'; message: string };

async function resolveChild(input: unknown): Promise<ChildResult> {
  const { resolveBlockRenderer } = await import('../registry.ts');
  const result = await resolveBlockRenderer(input);
  if (result.kind === 'fallback') return result;
  return { kind: 'render', component: result.component, block: result.block };
}
</script>

<div
  class="grid gap-4 {slide ? slideWidths : `max-[639px]:grid-cols-1 ${widths}`}"
  data-block-type="columns"
  data-align={block.align ?? 'start'}
  style:align-items={block.align === 'center' ? 'center' : 'start'}
>
  {#each block.columns as column, c (c)}
    <div class="grid min-w-0 gap-3" data-column={c}>
      {#each column as child, i (i)}
        {#await resolveChild(child)}
          <div class="h-16 animate-pulse rounded-md bg-muted" role="status" aria-label="Loading block"></div>
        {:then result}
          {#if result.kind === 'fallback'}
            <p class="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground" role="note">
              {result.message}
            </p>
          {:else}
            {@const Renderer = result.component as Component<{ block: unknown }>}
            {@const fragment = fragmentAttributes(host, result.block as { type: string })}
            {#if fragment}
              <div {...fragment}><Renderer block={result.block} /></div>
            {:else}
              <Renderer block={result.block} />
            {/if}
          {/if}
        {:catch}
          <p class="text-sm text-muted-foreground" role="note">This block could not be displayed.</p>
        {/await}
      {/each}
    </div>
  {/each}
</div>
