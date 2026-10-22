<script lang="ts">
import type { StepsBlock } from '@protoyard/blocks';
import PlainText from './PlainText.svelte';

/**
 * Numbered steps: a vertical list joined by a rail on phones, a row joined by
 * connectors once there is room (up to four steps at `md`, six at `lg`).
 */
let { block }: { block: StepsBlock } = $props();

interface RowLayout {
  list: string;
  item: string;
  connector: string;
  rail: string;
}
const MD: RowLayout = {
  list: 'md:gap-6',
  item: 'md:flex-col md:items-center md:text-center',
  connector: 'md:block',
  rail: 'md:hidden',
};
const LG: RowLayout = {
  list: 'lg:gap-6',
  item: 'lg:flex-col lg:items-center lg:text-center',
  connector: 'lg:block',
  rail: 'lg:hidden',
};
const NONE: RowLayout = { list: '', item: '', connector: '', rail: '' };
const COLUMNS: Record<number, string> = {
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
  5: 'lg:grid-cols-5',
  6: 'lg:grid-cols-6',
};

const count = $derived(block.items.length);
const layout = $derived(count <= 4 ? MD : count <= 6 ? LG : NONE);
const columns = $derived(COLUMNS[count] ?? '');
</script>

<section class="grid gap-6" aria-label={block.title ?? 'Steps'} data-py-page-steps>
  {#if block.title}
    <p class="text-center font-heading text-lg font-semibold text-foreground">{block.title}</p>
  {/if}
  <ol class="grid gap-8 {columns} {layout.list}">
    {#each block.items as item, index (index)}
      {@const last = index === count - 1}
      <li class="relative flex gap-4 {layout.item}">
        {#if !last}
          <span
            class="absolute top-14 bottom-[-1.5rem] left-6 w-px bg-border {layout.rail}"
            aria-hidden="true"
            data-py-page-step-rail
          ></span>
          <span
            class="absolute top-6 left-[calc(50%+2rem)] hidden h-px w-[calc(100%-2.5rem)] bg-border {layout.connector}"
            aria-hidden="true"
            data-py-page-step-connector
          ></span>
        {/if}
        <span
          class="grid size-12 shrink-0 place-items-center rounded-full bg-primary font-heading text-lg font-bold text-primary-foreground shadow-soft"
          aria-hidden="true"
        >
          {index + 1}
        </span>
        <div class="grid gap-1.5 pt-2.5 md:pt-0">
          <h3 class="font-heading text-lg font-semibold text-foreground">{item.title}</h3>
          {#if item.body}<PlainText text={item.body} class="text-base text-muted-foreground" />{/if}
        </div>
      </li>
    {/each}
  </ol>
</section>
