<script lang="ts">
import type { DemoBadgeOptions } from '@protoyard/core';
import { BOTTOM_NAV_SELECTOR, Button } from '@protoyard/ui';
import { onMount } from 'svelte';
import { chromeMessages, formatMessage } from '../messages.ts';
import {
  type BadgeCorner,
  everyCornerBlocked,
  placeBadge,
  placeCompact,
  type Rect,
} from './badge-placement.ts';
import { badgeContainer, FLOATING_EVENT, selectorRects } from './floating.ts';

type DemoBadgeConfig = Exclude<DemoBadgeOptions, boolean>;
let { name, options = {} }: { name: string; options?: DemoBadgeConfig } = $props();

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
let placementHidden = $state(false);
// Invisible (still measured) until the first placement, so the badge never
// flashes over a corner control before it has looked (Dailybot G-052).
let placed = $state(false);
let badge: HTMLElement | undefined = $state();
/** Full badge size, measured while it is shown (the dot cannot measure it). */
let fullSize = { width: 0, height: 0 };
let narrow = $state(typeof window !== 'undefined' && window.innerWidth < 640);
let inShellWithNav = $state(false);

$effect(() => {
  if (!inShellWithNav || !badge) return;
  badge.style.setProperty('position', 'fixed', 'important');
  badge.style.setProperty('margin', '0', 'important');
});

function avoidRects(extraHeading = false): Rect[] {
  const selectors = [
    BOTTOM_NAV_SELECTOR,
    ...(options.avoid ?? []),
    // On a phone the info dot keeps clear of every top-level heading, not only
    // the h1 (Dailybot G-057): page and section titles sit at the top edges.
    ...(extraHeading
      ? ['h1,h2,h3,[role="heading"]:not([aria-level="4"],[aria-level="5"],[aria-level="6"])']
      : []),
  ];
  return selectorRects(selectors);
}

/**
 * Where the badge may sit: #app under a viewport preset (it has a transform,
 * so it is the containing block), else the visible viewport, so a phone or
 * mobile emulation never places it past the visible right edge.
 */
function containingBlock(): ReturnType<typeof badgeContainer> {
  const app = badge?.closest<HTMLElement>('#app');
  if (app && getComputedStyle(app).transform !== 'none') {
    const r = app.getBoundingClientRect();
    return badgeContainer({ left: r.left, top: r.top, width: r.width, height: r.height });
  }
  return badgeContainer(null);
}

function place(): void {
  const root = document.documentElement;
  if (!badge) return;
  try {
    placeNow(root);
  } finally {
    placed = true;
  }
}

function placeNow(root: HTMLElement): void {
  if (!badge) return;
  placementHidden = false;
  inShellWithNav =
    root.hasAttribute('data-py-shell') && Boolean(document.querySelector(BOTTOM_NAV_SELECTOR));
  if (root.hasAttribute('data-py-shell') && !inShellWithNav) {
    // In a frame the badge is a row below the stage (app.css): always the full label.
    compact = null;
    return;
  }
  if (!compact) fullSize = { width: badge.offsetWidth, height: badge.offsetHeight };
  if (!fullSize.width || typeof document.elementFromPoint !== 'function') return;
  const { container, origin } = containingBlock();
  const phoneMode = narrow ? options.phone : undefined;
  if (phoneMode === 'hidden') {
    compact = null;
    placementHidden = true;
    return;
  }
  // In a phone shell the frame's bottom navigation sits outside the app's
  // placement box. Use the compact marker by default so it can be placed
  // against the viewport and explicitly avoid both the nav and first heading.
  const compactPhone = phoneMode === 'compact' || (narrow && phoneMode !== 'corner');
  const hit = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y);
    // The badge never counts as its own obstacle (the dot is clickable).
    return el && badge?.contains(el) ? null : el;
  };
  const avoid = avoidRects(narrow && compactPhone);
  if (!compactPhone && !everyCornerBlocked(container, fullSize, hit)) {
    compact = null;
    expanded = false;
    const placement = placeBadge(container, fullSize, hit, avoid);
    if (!placement) {
      placementHidden = true;
      return;
    }
    corner = placement;
    return;
  }
  const spot = placeCompact(container, hit, avoid);
  if (!spot) {
    compact = null;
    placementHidden = true;
    return;
  }
  compact = {
    left: spot.left - origin.left,
    top: spot.top - origin.top,
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
    narrow = window.innerWidth < 640;
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
const messages = chromeMessages().badge;
</script>

{#if compact}
  <aside
    bind:this={badge}
    aria-label={messages.label}
    data-py-demo-badge="compact"
    data-py-badge-placed={placed ? '' : undefined}
    class={[
      'pointer-events-none fixed flex size-4 select-none items-center justify-center',
      placed ? '' : 'invisible',
      options.layer === 'below-overlays' ? 'z-10' : 'z-30',
    ]}
    style:left="{compact.left}px"
    style:top="{compact.top}px"
  >
    <Button
      variant="ghost"
      size="icon"
      type="button"
      class="py-demo-dot pointer-events-auto inline-flex shrink-0 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      aria-expanded={expanded}
      aria-label={messages.text}
      title={formatMessage(messages.title, { name })}
      onclick={() => (expanded = !expanded)}
    >
      <!-- The touch target may grow to Texuli's 44 px minimum on a phone; the
           visible disc stays 16 px and reads theme surface tokens (G-057). -->
      <span
        class="inline-flex size-4 items-center justify-center rounded-full border border-border bg-elevated shadow-soft"
        aria-hidden="true"
      >
        <span class="size-1.5 rounded-full bg-primary"></span>
      </span>
    </Button>
    {#if expanded}
      <span
        class={[
          'absolute whitespace-nowrap rounded-full border border-border bg-elevated px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-soft',
          compact.bottom ? 'bottom-full mb-1' : 'top-full mt-1',
          compact.right ? 'right-0' : 'left-0',
        ]}
        role="status"
      >
        {messages.text}
      </span>
    {/if}
  </aside>
{:else}
<aside
  bind:this={badge}
  aria-label={messages.label}
  data-py-demo-badge={corner}
  data-py-badge-placed={placed ? '' : undefined}
  class={[
    placed ? '' : 'invisible',
    'pointer-events-none fixed select-none whitespace-nowrap rounded-full border border-border bg-elevated px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-soft',
    options.layer === 'below-overlays' ? 'z-10' : 'z-30',
    placementHidden ? 'hidden' : '',
    narrow && options.phone === 'hidden' ? 'hidden' : '',
    corner.startsWith('top') ? 'top-3' : 'bottom-3 pb-safe',
    // `--py-fixed-right-edge` (set by the renderer) keeps the right corners on the visible width.
    corner.endsWith('left') ? 'left-3' : 'right-[calc(0.75rem+var(--py-fixed-right-edge,0px))]',
  ]}
  title={formatMessage(messages.title, { name })}
>
  <span class="mr-1 inline-block size-1.5 rounded-full bg-primary align-middle" aria-hidden="true"></span>
  {messages.text}
</aside>
{/if}
