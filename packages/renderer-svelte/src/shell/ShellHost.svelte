<script lang="ts">
import { getDevice, orient, type PrototypeRuntime, safeAreaOf } from '@protoyard/core';
import { setOverlayPortalTarget } from '@protoyard/ui';
import type { Snippet } from 'svelte';
import { useAppearance } from '../bindings.svelte.ts';
import {
  activeFrame,
  FRAMES,
  type FrameComponent,
  isEmbedded,
  screenInsetOf,
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
const insets = $derived(spec ? safeAreaOf(spec) : undefined);
const inset = $derived(screenInsetOf(entry));
/**
 * The widget-host screen is a launcher panel that app.css positions and
 * WidgetHostFrame sizes (`--py-app-height` = panel height), so the host
 * leaves its inset, radius and tokens alone there.
 */
const sizedScreen = $derived(shell !== 'widget-host');

// Window-like frames can fill the stage or hide the screen (minimized, closed);
// the app stays mounted either way.
let maximized = $state(false);
let screenHidden = $state(false);
$effect(() => {
  void shell;
  maximized = false;
  screenHidden = false;
});

/** The device box: catalog size scaled to fit, or the whole stage when maximized. */
const box = $derived.by(() => {
  if (!framed || !spec || !entry) return undefined;
  if (maximized && available.width > 0 && available.height > 0) {
    return {
      width: Math.floor(available.width),
      height: Math.floor(available.height),
      radius: 0,
      scale: 1,
    };
  }
  return {
    width: spec.width,
    height: spec.height,
    radius: spec.cornerRadius,
    scale: stageScale(available, spec, entry.margin),
  };
});
/** Corners touching chrome (a title bar) stay square. */
const screenRadius = $derived.by(() => {
  if (!box) return undefined;
  const r = (a: number, b: number) => (a === 0 && b === 0 ? box.radius : 0);
  return `${r(inset.top, inset.left)}px ${r(inset.top, inset.right)}px ${r(inset.bottom, inset.right)}px ${r(inset.bottom, inset.left)}px`;
});

let Frame = $state.raw<FrameComponent | null>(null);
let screenEl = $state<HTMLDivElement | undefined>();

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

// Bits UI dialogs/sheets portal to body by default and escape the bezel.
// While framed, send overlays to the device screen (containing block via transform).
$effect(() => {
  if (framed && screenEl) setOverlayPortalTarget(screenEl);
  else setOverlayPortalTarget(null);
  return () => setOverlayPortalTarget(null);
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
    style:width={box ? `${box.width * box.scale}px` : undefined}
    style:height={box ? `${box.height * box.scale}px` : undefined}
  >
    <div
      data-py-shell-part="device"
      data-py-maximized={box && maximized ? '' : undefined}
      style:width={box ? `${box.width}px` : undefined}
      style:height={box ? `${box.height}px` : undefined}
      style:transform={box && box.scale < 1 ? `scale(${box.scale})` : undefined}
    >
      <div
        bind:this={screenEl}
        data-py-shell-part="screen"
        data-py-portal-root={framed ? '' : undefined}
        aria-hidden={box && screenHidden ? 'true' : undefined}
        style:inset={box && sizedScreen
          ? `${inset.top}px ${inset.right}px ${inset.bottom}px ${inset.left}px`
          : undefined}
        style:visibility={box && screenHidden ? 'hidden' : undefined}
        style:border-radius={sizedScreen ? screenRadius : undefined}
        style:--py-app-height={box && sizedScreen
          ? `${box.height - inset.top - inset.bottom}px`
          : undefined}
        style:--py-safe-top={box && insets && sizedScreen ? `${insets.top}px` : undefined}
        style:--py-safe-right={box && insets && sizedScreen ? `${insets.right}px` : undefined}
        style:--py-safe-bottom={box && insets && sizedScreen ? `${insets.bottom}px` : undefined}
        style:--py-safe-left={box && insets && sizedScreen ? `${insets.left}px` : undefined}
      >
        {@render children()}
      </div>
      {#if box && Frame && spec}
        <Frame
          {spec}
          {shell}
          chrome={runtime.manifest.preview.chrome}
          app={{ name: runtime.manifest.name, icon: runtime.manifest.icon }}
          {maximized}
          setMaximized={(value: boolean) => (maximized = value)}
          setScreenHidden={(value: boolean) => (screenHidden = value)}
        />
      {/if}
    </div>
  </div>
</div>
