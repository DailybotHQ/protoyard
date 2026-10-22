<script lang="ts">
import { ChevronLeft, ChevronRight } from '@lucide/svelte';
import type { Snippet } from 'svelte';
import { cn } from '../../lib/cn.ts';
import { prefersReducedMotion } from '../bottom-sheet/swipe.ts';
import { buttonVariants } from '../button/button-variants.ts';
import type { CarouselItem } from './types.ts';

interface Props {
  /** Slides in display order. At least one. */
  items: CarouselItem[];
  /** 0-based index of the active slide (`bind:index`). */
  index?: number;
  /** Accessible name for the carousel region. */
  label?: string;
  /** Render the body of the active (and optionally nearby) slides. */
  children?: Snippet<[CarouselItem, number]>;
  /** Show previous/next buttons (default true). */
  showControls?: boolean;
  /** Show dot indicators (default true). */
  showDots?: boolean;
  /** Wrap from last to first (default true). */
  loop?: boolean;
  /** Minimum horizontal drag in CSS px to change slide (default 48). */
  swipeThreshold?: number;
  class?: string;
  /** Fires after the index changes from any control. */
  onIndexChange?: (index: number) => void;
}

let {
  items,
  index = $bindable(0),
  label = 'Carousel',
  children,
  showControls = true,
  showDots = true,
  loop = true,
  swipeThreshold = 48,
  class: className,
  onIndexChange,
}: Props = $props();

const count = $derived(Math.max(1, items.length));
const active = $derived(Math.min(Math.max(0, index), count - 1));
const status = $derived(`Slide ${active + 1} of ${count}`);

let rootEl = $state<HTMLDivElement | undefined>();
let pointerId = $state<number | null>(null);
let startX = $state(0);
let deltaX = $state(0);
let dragging = $state(false);

function reduceMotion(): boolean {
  return prefersReducedMotion(rootEl ?? null);
}

function go(next: number): void {
  if (count <= 1) return;
  let target = next;
  if (loop) {
    target = ((next % count) + count) % count;
  } else {
    target = Math.min(Math.max(0, next), count - 1);
  }
  if (target === index) return;
  index = target;
  onIndexChange?.(target);
}

function previous(): void {
  go(active - 1);
}

function next(): void {
  go(active + 1);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented) return;
  const target = event.target as HTMLElement | null;
  // Leave text fields and nested interactive widgets alone.
  if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    next();
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault();
    previous();
  } else if (event.key === 'Home') {
    event.preventDefault();
    go(0);
  } else if (event.key === 'End') {
    event.preventDefault();
    go(count - 1);
  }
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0 || count <= 1) return;
  // Ignore drags that start on buttons (controls / dots).
  if ((event.target as HTMLElement | null)?.closest('button')) return;
  pointerId = event.pointerId;
  startX = event.clientX;
  deltaX = 0;
  dragging = true;
  rootEl?.setPointerCapture?.(event.pointerId);
}

function onPointerMove(event: PointerEvent): void {
  if (!dragging || event.pointerId !== pointerId) return;
  deltaX = event.clientX - startX;
}

function onPointerUp(event: PointerEvent): void {
  if (!dragging || event.pointerId !== pointerId) return;
  const dx = deltaX;
  dragging = false;
  pointerId = null;
  deltaX = 0;
  if (Math.abs(dx) < swipeThreshold) return;
  if (dx < 0) next();
  else previous();
}

function onPointerCancel(event: PointerEvent): void {
  if (event.pointerId !== pointerId) return;
  dragging = false;
  pointerId = null;
  deltaX = 0;
}

$effect(() => {
  // Keep bindable index in range when the item list shrinks.
  if (items.length === 0) return;
  if (index < 0 || index >= items.length) index = Math.min(Math.max(0, index), items.length - 1);
});
</script>

<!-- Carousel keyboard and pointer handlers follow the APG carousel pattern on a labelled region. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  bind:this={rootEl}
  class={cn('relative flex flex-col gap-3 outline-none', className)}
  role="region"
  aria-roledescription="carousel"
  aria-label={label}
  tabindex="0"
  data-py-carousel
  data-py-carousel-index={active}
  onkeydown={onKeydown}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerCancel}
>
  <div class="sr-only" aria-live="polite" aria-atomic="true">{status}</div>

  <div class="relative min-w-0 overflow-hidden rounded-lg">
    <div
      class={cn(
        'flex',
        !reduceMotion() && !dragging && 'transition-transform duration-300 ease-out',
        dragging && 'transition-none'
      )}
      style={`transform: translateX(calc(${-active * 100}% + ${dragging ? deltaX : 0}px));`}
      data-py-carousel-track
    >
      {#each items as item, i (item.id)}
        <div
          class="w-full shrink-0 grow-0 basis-full px-0.5"
          role="group"
          aria-roledescription="slide"
          aria-label={`${i + 1} of ${count}: ${item.label}`}
          aria-hidden={i === active ? undefined : 'true'}
          data-py-carousel-slide={item.id}
          data-active={i === active ? 'true' : undefined}
        >
          {#if children}
            {@render children(item, i)}
          {:else}
            <p class="text-sm text-muted-foreground">{item.label}</p>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  {#if showControls || showDots}
    <div class="flex items-center justify-between gap-3">
      {#if showControls}
        <div class="flex items-center gap-1">
          <button
            type="button"
            class={cn(buttonVariants({ variant: 'outline', size: 'icon' }))}
            aria-label="Previous slide"
            disabled={!loop && active <= 0}
            onclick={previous}
            data-py-carousel-prev
          >
            <ChevronLeft class="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            class={cn(buttonVariants({ variant: 'outline', size: 'icon' }))}
            aria-label="Next slide"
            disabled={!loop && active >= count - 1}
            onclick={next}
            data-py-carousel-next
          >
            <ChevronRight class="size-4" aria-hidden="true" />
          </button>
        </div>
      {:else}
        <span></span>
      {/if}

      {#if showDots}
        <div class="flex flex-1 items-center justify-center gap-1.5" role="tablist" aria-label="Slides">
          {#each items as item, i (item.id)}
            <button
              type="button"
              role="tab"
              class={cn(
                'h-2 rounded-full transition-[width,background-color] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none',
                i === active ? 'w-6 bg-primary' : 'w-2 bg-muted-foreground/40 hover:bg-muted-foreground/70'
              )}
              aria-label={`Go to slide ${i + 1}: ${item.label}`}
              aria-selected={i === active}
              tabindex={i === active ? 0 : -1}
              onclick={() => go(i)}
              data-py-carousel-dot={i}
            ></button>
          {/each}
        </div>
      {/if}

      <span class="min-w-16 text-right text-xs text-muted-foreground tabular-nums" aria-hidden="true">
        {active + 1}/{count}
      </span>
    </div>
  {/if}
</div>
