<script lang="ts">
/**
 * A laser dot that follows the pointer over `container` while active. It is
 * decoration (`aria-hidden`), never takes pointer events, and hides when the
 * pointer leaves. Without motion preference it simply jumps (no trail).
 */
let { container }: { container: HTMLElement | undefined } = $props();

let point = $state<{ x: number; y: number } | null>(null);

$effect(() => {
  const host = container;
  if (!host) return;
  const move = (event: PointerEvent) => {
    const box = host.getBoundingClientRect();
    point = { x: event.clientX - box.left, y: event.clientY - box.top };
  };
  const leave = () => {
    point = null;
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
  {#if point}
    <span
      class="absolute block size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500 shadow-[0_0_12px_4px_rgb(239_68_68/0.65)] ring-2 ring-white/80"
      style={`left:${point.x}px;top:${point.y}px`}
      data-py-deck-laser-dot
    ></span>
  {/if}
</div>
