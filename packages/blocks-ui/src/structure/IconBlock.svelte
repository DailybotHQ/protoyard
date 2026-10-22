<script lang="ts">
import type { IconBlock as IconBlockData } from '@protoyard/blocks';
import BlockIcon from './BlockIcon.svelte';
import { toneIcon } from './tones.ts';

let { block }: { block: IconBlockData } = $props();

const sizeClass = $derived(
  block.size === 'sm'
    ? 'size-8'
    : block.size === 'lg'
      ? 'size-14'
      : block.size === 'xl'
        ? 'size-16'
        : 'size-11'
);
const iconClass = $derived(
  block.size === 'sm'
    ? 'size-4'
    : block.size === 'lg'
      ? 'size-7'
      : block.size === 'xl'
        ? 'size-8'
        : 'size-5'
);
</script>

<div
  class="inline-flex flex-col items-center gap-2"
  data-block-type="icon"
  role={block.decorative ? 'presentation' : 'img'}
  aria-label={block.decorative ? undefined : block.label}
  aria-hidden={block.decorative ? 'true' : undefined}
>
  <span class="grid place-items-center rounded-xl {sizeClass} {toneIcon(block.tone)}" aria-hidden="true">
    <BlockIcon name={block.icon} class={iconClass} />
  </span>
  {#if block.label && !block.decorative}
    <span class="text-sm font-medium text-foreground">{block.label}</span>
  {/if}
</div>
