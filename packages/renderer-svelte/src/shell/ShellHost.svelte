<script lang="ts">
import { getDevice, orient, type PrototypeRuntime, safeAreaOf } from '@protoyard/core';
import type { Snippet } from 'svelte';
import { useAppearance } from '../bindings.svelte.ts';
import {
  activeFrame,
  FRAMES,
  type FrameComponent,
  isEmbedded,
  stageScale,
} from './frames/registry.ts';

/**
 * Presents the app in its effective shell (ADR-016). The four wrappers below
 * always exist, so the app never remounts when the shell changes. Without a
 * frame they are `display: contents` (app.css) and carry no inline styles, so
 * the page lays out exactly as if they were absent; `html[data-py-shell]`
 * turns them into the stage, the scaled device box and its screen. The frame
 * itself is a lazily loaded sibling overlay.
 */
let { runtime, children }: { runtime: PrototypeRuntime; children: Snippet } = $props();

// svelte-ignore state_referenced_locally
const appearance = useAppearance(runtime);
const embedded = typeof window !== 'undefined' && isEmbedded();

let windowWidth = $state(typeof window === 'undefined' ? 0 : window.innerWidth);
let stage: HTMLDivElement | undefined = $state();
let available = $state({ width: 0, height: 0 });

const spec = $derived.by(() => {
  const device = getDevice(appearance.current.device.value);
  return device ? orient(device, appearance.current.orientation.value) : undefined;
});
const shell = $derived(
  activeFrame({ shell: appearance.current.shell.value, spec, windowWidth, embedded })
);
const entry = $derived(shell === 'none' ? undefined : FRAMES[shell]);
const framed = $derived(shell !== 'none' && spec !== undefined && entry !== undefined);
const scale = $derived(spec && entry ? stageScale(available, spec, entry.margin) : 1);
const insets = $derived(spec ? safeAreaOf(spec) : undefined);

let Frame = $state.raw<FrameComponent | null>(null);
$effect(() => {
  const current = entry;
  Frame = null;
  if (!current) return;
  let cancelled = false;
  current.load().then(
    (module) => {
      if (!cancelled) Frame = module.default;
    },
    (error: unknown) => {
      // The app keeps working inside the bare screen; only the decoration is missing.
      console.error('[protoyard] shell frame failed to load', error);
    }
  );
  return () => {
    cancelled = true;
  };
});

// Lets the viewport-preset CSS step aside while a frame is shown.
$effect(() => {
  const root = document.documentElement;
  if (framed) root.dataset.pyShell = shell;
  else delete root.dataset.pyShell;
  return () => {
    delete root.dataset.pyShell;
  };
});

$effect(() => {
  if (!stage || typeof ResizeObserver === 'undefined') return;
  const observer = new ResizeObserver(([item]) => {
    if (item) available = { width: item.contentRect.width, height: item.contentRect.height };
  });
  observer.observe(stage);
  return () => observer.disconnect();
});
</script>

<svelte:window bind:innerWidth={windowWidth} />

<div bind:this={stage} data-py-shell-part="stage">
  <div
    data-py-shell-part="sizer"
    style:width={framed && spec ? `${spec.width * scale}px` : undefined}
    style:height={framed && spec ? `${spec.height * scale}px` : undefined}
  >
    <div
      data-py-shell-part="device"
      style:width={framed && spec ? `${spec.width}px` : undefined}
      style:height={framed && spec ? `${spec.height}px` : undefined}
      style:transform={framed && scale < 1 ? `scale(${scale})` : undefined}
    >
      <div
        data-py-shell-part="screen"
        style:border-radius={framed && spec ? `${spec.cornerRadius}px` : undefined}
        style:--py-app-height={framed && spec ? `${spec.height}px` : undefined}
        style:--py-safe-top={framed && insets ? `${insets.top}px` : undefined}
        style:--py-safe-right={framed && insets ? `${insets.right}px` : undefined}
        style:--py-safe-bottom={framed && insets ? `${insets.bottom}px` : undefined}
        style:--py-safe-left={framed && insets ? `${insets.left}px` : undefined}
      >
        {@render children()}
      </div>
      {#if framed && Frame && spec}
        <Frame {spec} {shell} />
      {/if}
    </div>
  </div>
</div>
