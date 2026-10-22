<script lang="ts">
import type { BlockIcon as BlockIconId } from '@protoyard/blocks';
import { BLOCK_ICON_COMPONENTS } from '../lib/icons.ts';

let {
  name,
  class: className = 'size-5',
}: {
  name: BlockIconId;
  class?: string;
} = $props();

const Icon = $derived(BLOCK_ICON_COMPONENTS[name]);
</script>

{#if Icon}
  <Icon class={className} aria-hidden="true" />
{/if}
