<script lang="ts">
import { tick } from 'svelte';
import { type DeckTooltip, type DeckTooltipView, placeTooltip } from './tooltip.ts';

/**
 * The one tooltip of a toolbar (`createDeckTooltip`): the label, the
 * description and the shortcut of the button it is shown for, as text. It is
 * placed with `position: fixed` above the button (below when there is no
 * room) and kept inside the viewport, never takes the pointer, is hidden in
 * print and only fades when motion is allowed.
 */
let { tooltip }: { tooltip: DeckTooltip } = $props();

let view = $state<DeckTooltipView | null>(null);
let node = $state<HTMLDivElement | undefined>();
let position = $state<{ x: number; y: number } | null>(null);

$effect(() => tooltip.subscribe((next) => (view = next)));

$effect(() => {
  const current = view;
  const element = node;
  position = null;
  if (!current || !element) return;
  const place = () => {
    const anchor = current.anchor.getBoundingClientRect();
    const tip = element.getBoundingClientRect();
    position = placeTooltip(anchor, tip, {
      width: document.documentElement.clientWidth || window.innerWidth,
      height: document.documentElement.clientHeight || window.innerHeight,
    });
  };
  // Placed once per opening: a tooltip closes when the pointer or focus moves on.
  void tick().then(place);
});
</script>

{#if view}
  <div
    bind:this={node}
    id={tooltip.id}
    role="tooltip"
    class="pointer-events-none fixed top-0 left-0 z-50 max-w-[min(20rem,calc(100vw-1rem))] rounded-md border border-border bg-popover px-3 py-2 text-left text-xs leading-snug text-popover-foreground shadow-md motion-safe:transition-opacity motion-safe:duration-100 print:hidden"
    style={position ? `transform:translate(${Math.round(position.x)}px,${Math.round(position.y)}px)` : 'opacity:0'}
    data-py-deck-tooltip
  >
    <p class="font-semibold">{view.content.title}</p>
    <p class="mt-0.5 text-muted-foreground">{view.content.description}</p>
    {#if view.content.shortcut}
      <p class="mt-1 font-medium" data-py-deck-tooltip-shortcut>{view.content.shortcut}</p>
    {/if}
  </div>
{/if}
