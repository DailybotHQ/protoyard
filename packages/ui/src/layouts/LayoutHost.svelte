<script lang="ts">
import { type LayoutId, type LayoutOptions, layoutForWidth } from '@protoyard/core';
import type { Snippet } from 'svelte';
import type { NavModel } from './nav-model.ts';
import { LAYOUT_REGISTRY, type LayoutComponent } from './registry.ts';
import ScreenOutlet from './ScreenOutlet.svelte';

interface Props {
  layout: LayoutId;
  children: Snippet;
  /** Navigation the layout renders (`navFromSidebar(nav)` migrates a Sidebar list). */
  nav?: NavModel;
  /** Current hash path; absent: layouts follow `location.hash`. */
  path?: string;
  options?: LayoutOptions;
  /** Scope for persisted layout state, usually the manifest's storage namespace. */
  storageKey?: string;
  /** Context panel for layouts that have one (dual-sidebar). */
  aside?: Snippet;
  class?: string;
}

let { layout, children, nav, path, options, storageKey, aside, class: className }: Props = $props();
let host: HTMLDivElement | undefined = $state();
let width = $state(typeof window === 'undefined' ? 0 : window.innerWidth);
let outlet: HTMLDivElement | undefined = $state();
let target = $state<HTMLElement | undefined>();
let fallbackTarget: HTMLElement | undefined = $state();
let loadedFor = $state<LayoutId | undefined>();
let Layout = $state.raw<LayoutComponent | null>(null);
let loading = $state(false);

const effectiveLayout = $derived(layoutForWidth(layout, width));
const entry = $derived(LAYOUT_REGISTRY[effectiveLayout]);

function mountScreen(nextTarget: HTMLElement): void {
  target = nextTarget;
  if (outlet && !nextTarget.contains(outlet)) nextTarget.append(outlet);
}

$effect(() => {
  if (!host || typeof ResizeObserver === 'undefined') return;
  const observer = new ResizeObserver(([item]) => {
    if (item) width = item.contentRect.width;
  });
  observer.observe(host);
  return () => observer.disconnect();
});

$effect(() => {
  if (outlet && target && !target.contains(outlet)) target.append(outlet);
  else if (outlet && fallbackTarget && !Layout && !fallbackTarget.contains(outlet)) {
    fallbackTarget.append(outlet);
  }
});

$effect(() => {
  const id = effectiveLayout;
  const current = LAYOUT_REGISTRY[id];
  if (!current) {
    loadedFor = undefined;
    Layout = null;
    loading = false;
    target = undefined;
    return;
  }
  if (loadedFor === id && Layout) return;
  let cancelled = false;
  loading = true;
  current.load().then(
    (module) => {
      if (cancelled) return;
      Layout = module.default;
      loadedFor = id;
      loading = false;
    },
    (error: unknown) => {
      if (cancelled) return;
      console.error(`[protoyard] layout "${id}" failed to load`, error);
      Layout = null;
      loadedFor = undefined;
      target = undefined;
      loading = false;
    }
  );
  return () => {
    cancelled = true;
  };
});
</script>

<div
  bind:this={host}
  class="relative min-w-0 {className ?? ''}"
  data-py-layout-host
  data-layout={effectiveLayout}
  style:container-type="inline-size"
>
  {#if Layout && loadedFor === effectiveLayout}
    <Layout {mountScreen} {nav} {path} {options} {storageKey} {aside} />
  {:else}
    <div bind:this={fallbackTarget} class="min-h-app min-w-0" data-py-layout-fallback></div>
  {/if}
  <ScreenOutlet {children} onready={(node) => (outlet = node)} />
  {#if loading}
    <div
      class="pointer-events-none absolute inset-0 z-10 min-h-app animate-pulse bg-background/70"
      aria-label="Loading layout"
      role="status"
    >
      <span class="sr-only">Loading layout</span>
      <div class="flex min-h-app gap-4 p-4" aria-hidden="true">
        <div class="hidden w-56 rounded-lg bg-muted lg:block"></div>
        <div class="min-w-0 flex-1 space-y-4">
          <div class="h-10 rounded-lg bg-muted"></div>
          <div class="h-32 rounded-lg bg-muted"></div>
        </div>
      </div>
    </div>
  {/if}
</div>
