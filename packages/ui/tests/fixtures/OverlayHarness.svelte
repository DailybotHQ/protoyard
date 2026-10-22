<script lang="ts">
import Drawer from '../../src/components/overlay/Drawer.svelte';
import type { DrawerPlacement } from '../../src/components/overlay/drawer.ts';
import type { OverlayStack } from '../../src/components/overlay/overlay-stack.ts';

interface Props {
  stack: OverlayStack;
  placement?: DrawerPlacement;
  size?: string | number;
  modal?: boolean;
  closeOnOutsideClick?: boolean;
  onOpenChange?: (open: boolean) => void;
}

let {
  stack,
  placement = 'right',
  size,
  modal = false,
  closeOnOutsideClick,
  onOpenChange,
}: Props = $props();

let outer = $state(false);
let inner = $state(false);
let pageClicks = $state(0);
</script>

<button type="button" onclick={() => (outer = true)}>Open filters</button>
<button type="button" onclick={() => (pageClicks += 1)}>Page action</button>
<output data-testid="outer">{outer ? 'open' : 'closed'}</output>
<output data-testid="inner">{inner ? 'open' : 'closed'}</output>
<output data-testid="page-clicks">{pageClicks}</output>

<Drawer
  bind:open={outer}
  {stack}
  {placement}
  {size}
  {modal}
  {closeOnOutsideClick}
  {onOpenChange}
  title="Filters"
  description="Narrow the list"
>
  <button type="button" onclick={() => (inner = true)}>Open details</button>
  {#snippet footer()}
    <button type="button" onclick={() => (outer = false)}>Apply</button>
  {/snippet}
</Drawer>

<Drawer bind:open={inner} {stack} placement="left" title="Details">
  <p>Nested body</p>
</Drawer>
