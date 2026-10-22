<script lang="ts">
import type { ComparisonTablePropsSchema } from '@protoyard/decks/layouts';
import { fitContent, fitText } from '../design/fit.ts';
import SlideFrame from '../design/SlideFrame.svelte';
import { DECK_TYPE } from '../design/scale.ts';
import type { PropsOf } from '../design/types.ts';

let { props: p }: { props: PropsOf<typeof ComparisonTablePropsSchema> } = $props();
</script>

<SlideFrame layout="comparison-table" class="gap-[3cqw] px-[7cqw] py-[6cqw]">
  {#if p.title}
    <h2 class={`${DECK_TYPE.title} line-clamp-2`} data-slot="title" {@attach fitText(40)}>{p.title}</h2>
  {/if}
  <div class="min-h-0 flex-1 content-center" data-slot="table" {@attach fitContent()}>
    <table class={`w-full border-separate border-spacing-0 overflow-hidden rounded-[1.8cqw] border border-border ${DECK_TYPE.body}`}>
      {#if p.title}<caption class="sr-only">{p.title}</caption>{/if}
      <thead>
        <tr class="bg-primary/10">
          <td class="border-b border-border px-[2cqw] py-[1.4cqw]"></td>
          {#each p.columns as column, index (index)}
            <th scope="col" class="border-b border-border px-[2cqw] py-[1.4cqw] text-center font-heading font-semibold text-primary">{column}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each p.rows as row, r (r)}
          <tr class={r % 2 === 1 ? 'bg-muted/40' : ''}>
            <th scope="row" class="border-b border-border px-[2cqw] py-[1.3cqw] text-left font-semibold text-foreground">{row.label}</th>
            {#each row.values as value, c (c)}
              <td class="border-b border-border px-[2cqw] py-[1.3cqw] text-center text-foreground" data-value={value === true ? 'yes' : value === false ? 'no' : value === null ? 'none' : 'text'}>
                {#if value === true}
                  <span aria-hidden="true" class="inline-grid size-[1.6em] place-items-center rounded-full bg-primary text-primary-foreground">✓</span><span class="sr-only">Yes</span>
                {:else if value === false}
                  <span aria-hidden="true" class="inline-grid size-[1.6em] place-items-center rounded-full bg-muted text-muted-foreground">✕</span><span class="sr-only">No</span>
                {:else if value === null}
                  <span aria-hidden="true" class="text-muted-foreground">—</span><span class="sr-only">Not applicable</span>
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
</SlideFrame>

<style>
  tbody tr:last-child > * {
    border-bottom: 0;
  }
</style>
