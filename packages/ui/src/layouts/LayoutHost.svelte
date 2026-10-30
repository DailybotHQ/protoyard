<script lang="ts">
import { type LayoutId, type LayoutOptions, layoutForWidth } from '@protoyard/core';
import type { Snippet } from 'svelte';
import type { HTMLAttributes } from 'svelte/elements';
import { LayoutHost as TexuliLayoutHost } from 'texuli/layouts/host';
import type { NavModel } from './nav-model.ts';
import { registerProtoyardLayouts } from './register.ts';

/*
 * Protoyard's LayoutHost wraps texuli's: texuli loads the layout, keeps the one
 * screen outlet and renders its chrome. This wrapper resolves the layout with
 * Protoyard's catalog (`layoutForWidth` from @protoyard/core: `docs` is wide
 * only here), starting from the real width, and keeps the
 * `data-py-layout-host` / `data-layout` / `data-py-layout` hooks that apps and
 * tests read.
 */

type Props = Omit<HTMLAttributes<HTMLDivElement>, 'class' | 'children'> & {
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
  /** The host's root element, the one that carries `data-py-layout-host` (bindable). */
  ref?: HTMLElement | null;
};

let {
  layout,
  children,
  nav,
  path,
  options,
  storageKey,
  aside,
  class: className,
  ref = $bindable(null),
  ...rest
}: Props = $props();

registerProtoyardLayouts();

let width = $state(typeof window === 'undefined' ? 0 : window.innerWidth);
const effectiveLayout = $derived(layoutForWidth(layout, width));

// The layout texuli's host has finished loading and shows, mirrored as
// `data-py-layout` (set only once that layout is on screen).
let shown = $state<string | undefined>();
$effect(() => {
  const node = ref;
  if (!node || typeof MutationObserver === 'undefined') return;
  const read = () => {
    const inner = node.querySelector('[data-tx-layout-host]');
    const ready = inner?.getAttribute('data-ready') === 'true';
    const id = inner?.getAttribute('data-layout') ?? undefined;
    shown = ready && id ? id : undefined;
  };
  read();
  const observer = new MutationObserver(read);
  observer.observe(node, {
    subtree: true,
    attributes: true,
    attributeFilter: ['data-ready', 'data-layout'],
  });
  return () => observer.disconnect();
});

$effect(() => {
  const node = ref;
  if (!node || typeof ResizeObserver === 'undefined') return;
  const observer = new ResizeObserver(([item]) => {
    if (item) width = item.contentRect.width;
  });
  observer.observe(node);
  return () => observer.disconnect();
});
</script>

<div
  {...rest}
  bind:this={ref}
  class={['relative min-w-0', className]}
  data-py-layout-host=""
  data-layout={effectiveLayout}
  data-py-layout={shown}
  style:container-type="inline-size"
>
  <TexuliLayoutHost
    layout={effectiveLayout}
    {nav}
    {path}
    {options}
    {storageKey}
    {aside}
  >
    {@render children()}
  </TexuliLayoutHost>
</div>
