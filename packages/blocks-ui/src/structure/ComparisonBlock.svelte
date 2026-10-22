<script lang="ts">
import { Check, X } from '@lucide/svelte';
import type { ComparisonBlock } from '@protoyard/blocks';
import { getBlockHost } from '../host.ts';

let { block }: { block: ComparisonBlock } = $props();
const host = getBlockHost();
const slide = $derived(host.canvasMode === 'slide');
</script>

<section class="grid gap-3" data-block-type="comparison" aria-label={block.title ?? 'Comparison'}>
  {#if block.title}
    <h3 class="font-heading text-lg font-semibold text-foreground">{block.title}</h3>
  {/if}
  <div class={slide ? 'overflow-x-auto' : 'overflow-x-auto max-[639px]:-mx-1'}>
    <table class="w-full min-w-[20rem] border-collapse text-left text-sm">
      <caption class="sr-only">{block.title ?? 'Feature comparison'}</caption>
      <thead>
        <tr>
          <th scope="col" class="border-b border-border px-3 py-2 font-semibold text-muted-foreground"
            >Feature</th
          >
          {#each block.columns as column, c (c)}
            <th
              scope="col"
              class="border-b border-border px-3 py-2 font-semibold {column.highlight
                ? 'bg-primary/10 text-primary'
                : 'text-foreground'}"
            >
              {column.label}
              {#if column.highlight}<span class="sr-only"> (recommended)</span>{/if}
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each block.rows as row, r (r)}
          <tr class="odd:bg-muted/30">
            <th scope="row" class="border-b border-border px-3 py-2 font-medium text-foreground"
              >{row.label}</th
            >
            {#each row.values as value, v (v)}
              {@const highlighted = block.columns[v]?.highlight}
              <td
                class="border-b border-border px-3 py-2 text-muted-foreground {highlighted
                  ? 'bg-primary/5'
                  : ''}"
              >
                {#if typeof value === 'boolean'}
                  {#if value}
                    <span class="inline-flex items-center gap-1 text-success">
                      <Check class="size-4" aria-hidden="true" />
                      <span class="sr-only">Yes</span>
                    </span>
                  {:else}
                    <span class="inline-flex items-center gap-1 text-muted-foreground">
                      <X class="size-4" aria-hidden="true" />
                      <span class="sr-only">No</span>
                    </span>
                  {/if}
                {:else}
                  {value}
                {/if}
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>
