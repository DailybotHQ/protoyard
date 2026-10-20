<script lang="ts">
import { onMount } from 'svelte';
import {
  type BadgeCorner,
  everyCornerBlocked,
  placeBadge,
  placeCompact,
  type Rect,
} from './badge-placement.ts';
import { FLOATING_EVENT } from './floating.ts';

let { name }: { name: string } = $props();

/**
 * Honest labelling: published prototypes say they are simulations, without
 * covering the app. In a frame, app.css puts the badge below the stage,
 * outside the screen. Full-bleed, it takes the first corner where it covers no
 * control, re-checked after resizes, navigation and DOM changes. When every
 * corner holds a control (a phone app with back, menu and tab bar), it shrinks
 * to an info dot in the first gap along the bottom or top edge; the dot
 * expands to the label on demand.
 */
let corner = $state<BadgeCorner>('bottom-left');
/** The info dot's box, relative to the badge's containing block; `null`: the full badge. */
let compact = $state<{ left: number; top: number; right: boolean; bottom: boolean } | null>(null);
let expanded = $state(false);
let badge: HTMLElement | undefined = $state();
/** Full badge size, measured while it is shown (the dot cannot measure it). */
let fullSize = { width: 0, height: 0 };

/** The badge's containing block: #app under a viewport preset (it has a transform), else the window. */
function containerRect(): Rect {
  const app = badge?.closest<HTMLElement>('#app');
  if (app && getComputedStyle(app).transform !== 'none') {
    const r = app.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }
  return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
}

function place(): void {
  const root = document.documentElement;
  if (!badge) return;
  if (root.hasAttribute('data-py-shell')) {
    // In a frame the badge is a row below the stage (app.css): always the full label.
    compact = null;
    return;
  }
  if (!compact) fullSize = { width: badge.offsetWidth, height: badge.offsetHeight };
  if (!fullSize.width || typeof document.elementFromPoint !== 'function') return;
  const container = containerRect();
  const hit = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y);
    // The badge never counts as its own obstacle (the dot is clickable).
    return el && badge?.contains(el) ? null : el;
  };
  if (!everyCornerBlocked(container, fullSize, hit)) {
    compact = null;
    expanded = false;
    corner = placeBadge(container, fullSize, hit);
    return;
  }
  const spot = placeCompact(container, hit);
  compact = {
    left: spot.left - container.left,
    top: spot.top - container.top,
    right: spot.left - container.left > container.width / 2,
    bottom: spot.top - container.top > container.height / 2,
  };
}

onMount(() => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  // After the DOM settles, in idle time, so hit-testing never lengthens a busy frame.
  const idle = (fn: () => void) =>
    typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 1000 }) : fn();
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => idle(place), 150);
  };
  schedule();
  const observer = new MutationObserver(schedule);
  observer.observe(document.getElementById('app') ?? document.body, {
    childList: true,
    subtree: true,
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-py-shell', 'data-py-viewport'],
  });
  const collapse = () => (expanded = false);
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') collapse();
  };
  window.addEventListener('resize', schedule);
  // Floating chrome (the review toolbar) moved: re-check, since it is a control the badge must not cover.
  window.addEventListener(FLOATING_EVENT, schedule);
  window.addEventListener('hashchange', schedule);
  window.addEventListener('hashchange', collapse);
  window.addEventListener('keydown', onKey);
  return () => {
    window.removeEventListener('hashchange', collapse);
    window.removeEventListener('keydown', onKey);
    clearTimeout(timer);
    observer.disconnect();
    window.removeEventListener('resize', schedule);
    window.removeEventListener(FLOATING_EVENT, schedule);
    window.removeEventListener('hashchange', schedule);
  };
});
</script>

{#if compact}
  <aside
    bind:this={badge}
    aria-label="About this prototype"
    data-py-demo-badge="compact"
    class="pointer-events-none fixed z-30 flex size-5 select-none"
    style:left="{compact.left}px"
    style:top="{compact.top}px"
  >
    <button
      type="button"
      class="pointer-events-auto inline-flex size-5 items-center justify-center rounded-full border border-border bg-elevated/90 shadow-soft backdrop-blur focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      aria-expanded={expanded}
      aria-label="Prototype · simulated data"
      title="{name} is an interactive prototype. Data is simulated and stored only in this browser."
      onclick={() => (expanded = !expanded)}
    >
      <span class="size-1.5 rounded-full bg-primary" aria-hidden="true"></span>
    </button>
    {#if expanded}
      <span
        class={[
          'absolute whitespace-nowrap rounded-full border border-border bg-elevated px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-soft',
          compact.bottom ? 'bottom-full mb-1' : 'top-full mt-1',
          compact.right ? 'right-0' : 'left-0',
        ]}
        role="status"
      >
        Prototype · simulated data
      </span>
    {/if}
  </aside>
{:else}
<aside
  bind:this={badge}
  aria-label="About this prototype"
  data-py-demo-badge={corner}
  class={[
    'pointer-events-none fixed z-30 select-none whitespace-nowrap rounded-full border border-border bg-elevated/90 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-soft backdrop-blur',
    corner.startsWith('top') ? 'top-3' : 'bottom-3 pb-safe',
    corner.endsWith('left') ? 'left-3' : 'right-3',
  ]}
  title="{name} is an interactive prototype. Data is simulated and stored only in this browser."
>
  <span class="mr-1 inline-block size-1.5 rounded-full bg-primary align-middle" aria-hidden="true"></span>
  Prototype · simulated data
</aside>
{/if}
