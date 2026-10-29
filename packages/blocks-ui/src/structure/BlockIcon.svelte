<script lang="ts">
import type { BlockIcon as BlockIconId } from '@protoyard/blocks';
import { Icon } from 'texuli/icons';
import type { LucideIconComponent } from 'texuli/icons/lucide';
import { BLOCK_ICON_COMPONENTS } from '../lib/icons.ts';

let {
  name,
  class: className = 'size-5',
}: {
  name: BlockIconId;
  class?: string;
} = $props();
</script>

{#if BLOCK_ICON_COMPONENTS[name]}
  <Icon icon={BLOCK_ICON_COMPONENTS[name] as LucideIconComponent} class={className} aria-hidden="true" />
{/if}
