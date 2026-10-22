<script lang="ts">
import { fragmentAttributes, getBlockHost } from './host.ts';
import { resolveBlockRenderer } from './registry.ts';

interface Props {
  /** Untrusted block data is checked again at the rendering boundary. */
  blocks: readonly unknown[];
}

let { blocks }: Props = $props();

// Decks give stepped blocks a wrapper that hides them until their step.
const host = getBlockHost();
</script>

<div class="grid gap-4" data-py-block-renderer>
  {#each blocks as input, index (index)}
    {#await resolveBlockRenderer(input)}
      <div class="grid gap-3 rounded-md border border-border p-4" role="status" aria-label="Loading block">
        <span class="sr-only">Loading block…</span>
        <span aria-hidden="true" class="h-4 w-2/3 animate-pulse rounded bg-muted"></span>
        <span aria-hidden="true" class="h-4 w-full animate-pulse rounded bg-muted"></span>
      </div>
    {:then result}
      {#if result.kind === 'fallback'}
        <p class="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground" role="note">
          {result.message}
        </p>
      {:else}
        {@const Renderer = result.component}
        {@const fragment = fragmentAttributes(host, result.block)}
        {#if fragment}
          <div {...fragment}><Renderer block={result.block} /></div>
        {:else}
          <Renderer block={result.block} />
        {/if}
      {/if}
    {:catch}
      <p class="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground" role="note">
        This block could not be displayed.
      </p>
    {/await}
  {:else}
    <p class="text-sm text-muted-foreground" role="note">There are no blocks to display.</p>
  {/each}
</div>
