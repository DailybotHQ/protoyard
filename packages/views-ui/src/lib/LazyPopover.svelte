<script lang="ts">
import { Button } from '@protoyard/ui';
import type { ComponentProps, Snippet } from 'svelte';
import type { HTMLButtonAttributes } from 'svelte/elements';
import { lazyPopover } from './lazy-overlays.svelte.ts';

/**
 * A `Popover` whose popover code loads on first use: a plain trigger button
 * until then (it prefetches on hover or focus), swapped for the real popover,
 * opened, on the first click. Focus stays on the trigger across the swap.
 */
interface Props {
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** Classes for the popover panel. */
  class?: string;
  /** Attributes for the trigger button (aria-label, class, data-*). */
  button?: HTMLButtonAttributes;
  /** The trigger's content. */
  label: Snippet;
  /** The popover's content. */
  children: Snippet;
}

let {
  align = 'center',
  side = 'bottom',
  class: className,
  button = {},
  label,
  children,
}: Props = $props();
let open = $state(false);
let focused = false;

async function activate() {
  await lazyPopover.load();
  open = true;
}
const prefetch = () => void lazyPopover.load().catch(() => {});
const keepFocus = (node: HTMLElement) => {
  if (focused) node.focus();
};
</script>

{#if lazyPopover.current}
  {@const Pop = lazyPopover.current}
  <Pop {align} {side} class={className} bind:open>
    {#snippet trigger({ props })}
      {@const triggerProps = { ...button, ...props, type: 'button' } as ComponentProps<typeof Button>}
      <Button {...triggerProps} {@attach keepFocus}>{@render label()}</Button>
    {/snippet}
    {@render children()}
  </Pop>
{:else}
  {@const triggerProps = { ...button, type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', onpointerenter: prefetch, onfocus: () => { focused = true; prefetch(); }, onblur: () => (focused = false), onclick: activate } as ComponentProps<typeof Button>}
  <Button
    {...triggerProps}
  >
    {@render label()}
  </Button>
{/if}
