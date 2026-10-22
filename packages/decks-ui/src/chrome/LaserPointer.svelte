<script lang="ts">
import { untrack } from 'svelte';

/**
 * A laser dot that follows the pointer over `container` while active. It
 * shows at once: at `start` (the last pointer position over the deck), else
 * in the middle of the stage, so turning it on with L never looks like
 * nothing happened. A "Laser on" chip says it is on. Touch moves the dot to
 * each tap and leaves it there (a finger lifting is not the pointer leaving).
 * It is decoration (`aria-hidden`), never takes pointer events, and hides
 * when a mouse or pen leaves the deck. Without motion preference it simply jumps.
 */
let {
  container,
  start = null,
}: {
  container: HTMLElement | undefined;
  /** Client coordinates of the last pointer position over the deck, if any. */
  start?: { x: number; y: number } | null;
} = $props();

let point = $state<{ x: number; y: number } | null>(null);

$effect(() => {
  const host = container;
  if (!host) return;
  const box = host.getBoundingClientRect();
  const stage = host.querySelector('[data-py-deck-stage-area]')?.getBoundingClientRect();
  const inside = (x: number, y: number) =>
    x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
  // Where the pointer was when the laser turned on; later moves are followed below.
  const initial = untrack(() => start);
  const from = initial && inside(initial.x, initial.y) ? initial : null;
  const center = stage ?? box;
  point = from
    ? { x: from.x - box.left, y: from.y - box.top }
    : { x: center.left + center.width / 2 - box.left, y: center.top + center.height / 2 - box.top };

  const move = (event: PointerEvent) => {
    const at = host.getBoundingClientRect();
    point = { x: event.clientX - at.left, y: event.clientY - at.top };
  };
  const leave = (event: PointerEvent) => {
    if (event.pointerType !== 'touch') point = null;
  };
  host.addEventListener('pointermove', move);
  host.addEventListener('pointerdown', move);
  host.addEventListener('pointerleave', leave);
  return () => {
    host.removeEventListener('pointermove', move);
    host.removeEventListener('pointerdown', move);
    host.removeEventListener('pointerleave', leave);
  };
});
</script>

<div class="pointer-events-none absolute inset-0 z-40 overflow-hidden" aria-hidden="true" data-py-deck-laser>
  <span
    class="absolute top-3 left-3 rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-white shadow print:hidden"
    data-py-deck-laser-chip
  >
    Laser on
  </span>
  {#if point}
    <span
      class="absolute block size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500 shadow-[0_0_12px_4px_rgb(239_68_68/0.65)] ring-2 ring-white/80"
      style={`left:${point.x}px;top:${point.y}px`}
      data-py-deck-laser-dot
    ></span>
  {/if}
</div>
