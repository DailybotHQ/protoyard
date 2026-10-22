<script lang="ts">
import type { StepsBlock as StepsBlockData } from '@protoyard/blocks';
import { getBlockHost } from '../host.ts';
import BlockIcon from './BlockIcon.svelte';
import SafeBody from './SafeBody.svelte';
import { toneIcon } from './tones.ts';

let { block }: { block: StepsBlockData } = $props();
const host = getBlockHost();
const slide = $derived(host.canvasMode === 'slide');
</script>

<section
  class="grid gap-4"
  data-block-type="steps"
  aria-label={block.title ?? 'Steps'}
>
  {#if block.title}
    <h3 class="font-heading text-lg font-semibold text-foreground">{block.title}</h3>
  {/if}
  <ol
    class={slide
      ? 'grid gap-4 grid-cols-3'
      : 'grid gap-4 max-[639px]:grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}
  >
    {#each block.items as item, index (index)}
      <li class="grid gap-2 rounded-xl border border-border bg-surface p-4 shadow-soft">
        <div class="flex items-center gap-3">
          {#if item.icon}
            <span class="grid size-10 shrink-0 place-items-center rounded-lg {toneIcon('accent')}" aria-hidden="true">
              <BlockIcon name={item.icon} class="size-5" />
            </span>
          {:else if block.numbered !== false}
            <span
              class="grid size-10 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-bold text-primary"
              aria-hidden="true"
            >
              {index + 1}
            </span>
          {/if}
          <p class="font-semibold text-foreground">{item.title}</p>
        </div>
        {#if item.body}<SafeBody text={item.body} />{/if}
      </li>
    {/each}
  </ol>
</section>
