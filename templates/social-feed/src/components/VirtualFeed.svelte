<script lang="ts" generics="T">
import type { Snippet } from 'svelte';
import { feedWindow } from '../domain/feed.ts';

/**
 * A windowed list: only the rows on screen (plus a few above and below) are in
 * the DOM, with spacers keeping the full scroll height. Row heights are
 * measured as rows render (posts differ in length, media and open comments)
 * and estimated until then. The list itself is the scroll region.
 */
let {
  items,
  key,
  row,
  label,
  estimate = 180,
}: {
  items: readonly T[];
  key: (item: T) => string;
  row: Snippet<[T, number]>;
  label: string;
  estimate?: number;
} = $props();

let scroller = $state<HTMLElement | null>(null);
let scrollTop = $state(0);
let viewport = $state(800);
// Measured heights by key; a plain Map plus a version counter keeps updates cheap.
const heights = new Map<string, number>();
let version = $state(0);

const view = $derived.by(() => {
  void version;
  return feedWindow({
    count: items.length,
    heightOf: (i) => heights.get(key(items[i] as T)) ?? estimate,
    scrollTop,
    viewport,
  });
});
const visible = $derived(items.slice(view.start, view.end));

let observer: ResizeObserver | null = null;
$effect(() => {
  if (typeof ResizeObserver !== 'function') return;
  observer = new ResizeObserver((entries) => {
    let changed = false;
    for (const entry of entries) {
      const id = (entry.target as HTMLElement).dataset.rowKey;
      const h = Math.round(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height);
      if (id && h > 0 && heights.get(id) !== h) {
        heights.set(id, h);
        changed = true;
      }
    }
    if (changed) version++;
  });
  return () => observer?.disconnect();
});

/** Each rendered row registers with the observer while it is in the window. */
function measure(node: HTMLElement) {
  observer?.observe(node);
  return () => observer?.unobserve(node);
}

/** Back to the top (after posting, or switching timelines). */
export function scrollToTop() {
  scroller?.scrollTo({ top: 0 });
}
</script>

<div
  bind:this={scroller}
  bind:clientHeight={viewport}
  class="min-h-0 flex-1 overflow-y-auto overscroll-contain"
  onscroll={(e) => (scrollTop = (e.currentTarget as HTMLElement).scrollTop)}
  role="feed"
  aria-label={label}
  aria-busy="false"
  data-feed-count={items.length}
>
  <div style:height="{view.before}px" aria-hidden="true"></div>
  {#each visible as item, i (key(item))}
    <!-- A plain wrapper: the row's own <article> is what the feed owns. -->
    <div data-row-key={key(item)} {@attach measure}>
      {@render row(item, view.start + i)}
    </div>
  {/each}
  <div style:height="{view.after}px" aria-hidden="true"></div>
</div>
