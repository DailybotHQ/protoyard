<script lang="ts">
import { Badge } from 'texuli/badge';

/**
 * Outline mode: a box and the JSON pointer for each top-level block of the
 * slide on screen (a free slide), or for the slide's props (a catalog
 * layout). Decoration only: `aria-hidden`, `pointer-events: none`, hidden in
 * print. Boxes are measured from the rendered stage and refit on resize.
 */
let {
  root,
  slideId,
  slidePointer,
  propsPointer,
}: {
  /** The deck root the stage renders in. */
  root: HTMLElement | undefined;
  slideId: string;
  /** `/deck/slides/3`: block pointers are `<slidePointer>/blocks/<n>`. */
  slidePointer: string;
  /** The props pointer of a catalog slide, or null for a free slide. */
  propsPointer: string | null;
} = $props();

interface Box {
  pointer: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

let layer = $state<HTMLDivElement | undefined>();
let boxes = $state<Box[]>([]);

function slideElement(host: HTMLElement, id: string): HTMLElement | null {
  for (const node of host.querySelectorAll<HTMLElement>('[data-tx-deck-slide]')) {
    if (node.dataset.txDeckSlide === id) return node;
  }
  return null;
}

function measure(): void {
  const host = root;
  const own = layer;
  if (!host || !own) return;
  const origin = own.getBoundingClientRect();
  const slide = slideElement(host, slideId);
  if (!slide) {
    boxes = [];
    return;
  }
  const box = (element: Element, pointer: string): Box => {
    const rect = element.getBoundingClientRect();
    return {
      pointer,
      x: rect.left - origin.left,
      y: rect.top - origin.top,
      width: rect.width,
      height: rect.height,
    };
  };
  // A free slide: the promoted heading is block 0, every other block has a (box-less) item wrapper.
  const free = slide.querySelector('[data-py-deck-free]');
  if (!propsPointer && free) {
    const heading = free.querySelector('[data-slot="heading"]');
    const items = [...free.querySelectorAll<HTMLElement>('[data-tx-deck-item]')].flatMap((item) => {
      const child = item.firstElementChild;
      return child ? [box(child, `${slidePointer}/blocks/${item.dataset.txDeckItem}`)] : [];
    });
    boxes = heading ? [box(heading, `${slidePointer}/blocks/0`), ...items] : items;
  } else {
    boxes = [box(slide, propsPointer ?? slidePointer)];
  }
}

$effect(() => {
  // Re-measure whenever the slide (or the deck root) changes, after it renders.
  void slideId;
  void propsPointer;
  const host = root;
  if (!host) return;
  let frame = requestAnimationFrame(measure);
  const again = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(measure);
  };
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(again);
  observer?.observe(host);
  window.addEventListener('resize', again);
  return () => {
    cancelAnimationFrame(frame);
    observer?.disconnect();
    window.removeEventListener('resize', again);
  };
});
</script>

<div
  bind:this={layer}
  class="pointer-events-none absolute inset-0 z-30 overflow-hidden"
  aria-hidden="true"
  data-py-deck-outline
>
  {#each boxes as item (item.pointer)}
    <div
      class="absolute rounded-sm border-2 border-dashed border-primary"
      style={`left:${item.x}px;top:${item.y}px;width:${item.width}px;height:${item.height}px`}
      data-py-deck-outline-box={item.pointer}
    >
      <Badge
        class="absolute top-0 left-0 max-w-full truncate rounded-sm px-1 font-mono text-[10px] leading-4"
        label={item.pointer}
      />
    </div>
  {/each}
</div>
