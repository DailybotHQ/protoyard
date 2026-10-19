<script lang="ts">
import { onMount } from 'svelte';
import { type BadgeCorner, placeBadge, type Rect } from './badge-placement.ts';

let { name }: { name: string } = $props();

/**
 * Honest labelling: published prototypes say they are simulations, without
 * covering the app. In a frame, app.css puts the badge below the stage,
 * outside the screen. Full-bleed, it takes the first corner where it covers no
 * control, re-checked after resizes, navigation and DOM changes.
 */
let corner = $state<BadgeCorner>('bottom-left');
let badge: HTMLElement | undefined = $state();

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
  if (!badge || root.hasAttribute('data-py-shell')) return;
  const size = { width: badge.offsetWidth, height: badge.offsetHeight };
  if (!size.width || typeof document.elementFromPoint !== 'function') return;
  corner = placeBadge(containerRect(), size, (x, y) => document.elementFromPoint(x, y));
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
  window.addEventListener('resize', schedule);
  window.addEventListener('hashchange', schedule);
  return () => {
    clearTimeout(timer);
    observer.disconnect();
    window.removeEventListener('resize', schedule);
    window.removeEventListener('hashchange', schedule);
  };
});
</script>

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
