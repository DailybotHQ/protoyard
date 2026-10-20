<script lang="ts">
import type { DropdownMenuEntry } from '@protoyard/ui';
import type { Snippet } from 'svelte';
import type { HTMLButtonAttributes } from 'svelte/elements';
import { lazyMenu } from './lazy-overlays.svelte.ts';

/**
 * A `DropdownMenu` whose Bits UI code loads on first use: a plain trigger
 * button until then (it prefetches on hover or focus), swapped for the real
 * menu, opened, on the first click. Focus stays on the trigger across the swap.
 */
interface Props {
  items: DropdownMenuEntry[];
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** Attributes for the trigger button (aria-label, class, disabled, data-*). */
  button?: HTMLButtonAttributes;
  /** The trigger's content. */
  children: Snippet;
}

let { items, align = 'end', side = 'bottom', button = {}, children }: Props = $props();
let open = $state(false);
let focused = false;

async function activate() {
  await lazyMenu.load();
  open = true;
}
const prefetch = () => void lazyMenu.load().catch(() => {});
const keepFocus = (node: HTMLElement) => {
  if (focused) node.focus();
};
</script>

{#if lazyMenu.current}
  {@const Menu = lazyMenu.current}
  <Menu {items} {align} {side} bind:open>
    {#snippet trigger({ props })}
      <button {...button} {...props} type="button" {@attach keepFocus}>{@render children()}</button>
    {/snippet}
  </Menu>
{:else}
  <button
    {...button}
    type="button"
    aria-haspopup="menu"
    aria-expanded="false"
    onpointerenter={prefetch}
    onfocus={() => {
      focused = true;
      prefetch();
    }}
    onblur={() => (focused = false)}
    onclick={activate}
  >
    {@render children()}
  </button>
{/if}
