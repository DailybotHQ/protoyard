<script lang="ts">
import type { ShellHostVariant } from '@protoyard/core';
import type { Component } from 'svelte';
import { onDestroy } from 'svelte';
import { getRuntime } from '../../context.ts';
import type { FrameProps } from './registry.ts';
import {
  clampSidePanelWidth,
  loadSidePanelWidth,
  SIDE_PANEL_WIDTH_DEFAULT,
  SIDE_PANEL_WIDTH_MAX,
  SIDE_PANEL_WIDTH_MIN,
  SIDE_PANEL_WIDTH_STEP,
  saveSidePanelWidth,
} from './side-panel-prefs.ts';

/**
 * Side-panel shell: static mock host app (chat / canvas / editor) with the
 * prototype in a keyboard-resizable right-hand plugin panel.
 */
let { spec, shell, hostVariant: hostVariantProp }: FrameProps = $props();

const DEFAULT_VARIANT: ShellHostVariant = 'chat-workspace';

const variant = $derived.by((): ShellHostVariant => {
  if (hostVariantProp) return hostVariantProp;
  try {
    return getRuntime().manifest.preview.chrome?.hostVariant ?? DEFAULT_VARIANT;
  } catch {
    return DEFAULT_VARIANT;
  }
});

const namespace = $derived.by(() => {
  try {
    return getRuntime().manifest.storage.namespace;
  } catch {
    return 'side-panel';
  }
});

const maxWidth = $derived(
  clampSidePanelWidth(
    Math.floor(spec.width * 0.55),
    Math.min(SIDE_PANEL_WIDTH_MAX, spec.width - 200)
  )
);

let rootEl = $state<HTMLDivElement | null>(null);
let collapsed = $state(false);
let panelWidth = $state(SIDE_PANEL_WIDTH_DEFAULT);
let Host = $state.raw<Component | null>(null);
let widthReady = $state(false);

$effect(() => {
  const ns = namespace;
  if (!widthReady) {
    panelWidth = clampSidePanelWidth(loadSidePanelWidth(ns), maxWidth);
    widthReady = true;
  }
});

$effect(() => {
  if (!widthReady) return;
  saveSidePanelWidth(namespace, panelWidth);
});

const HOST_LOADERS: Record<ShellHostVariant, () => Promise<{ default: Component }>> = {
  'chat-workspace': () => import('./hosts/ChatWorkspaceHost.svelte'),
  'design-canvas': () => import('./hosts/DesignCanvasHost.svelte'),
  'code-editor': () => import('./hosts/CodeEditorHost.svelte'),
};

$effect(() => {
  const load = HOST_LOADERS[variant];
  Host = null;
  let cancelled = false;
  load().then(
    (mod) => {
      if (!cancelled) Host = mod.default;
    },
    (error: unknown) => {
      console.error('[protoyard] side-panel host failed to load', error);
    }
  );
  return () => {
    cancelled = true;
  };
});

function findScreen(): HTMLElement | null {
  const device =
    rootEl?.parentElement ??
    (typeof document !== 'undefined'
      ? document.querySelector('[data-py-shell-part="device"]')
      : null);
  return (device?.querySelector?.('[data-py-shell-part="screen"]') as HTMLElement | null) ?? null;
}

function applyPanel(screen: HTMLElement): void {
  const width = collapsed ? 0 : clampSidePanelWidth(panelWidth, maxWidth);
  screen.dataset.pySidePanel = collapsed ? 'collapsed' : 'open';
  screen.style.top = '0';
  screen.style.right = '0';
  screen.style.bottom = '0';
  screen.style.left = 'auto';
  screen.style.width = `${width}px`;
  screen.style.height = '100%';
  screen.style.borderRadius = '0';
  if (width > 0) {
    screen.style.setProperty('--py-app-height', `${spec.height}px`);
    screen.style.setProperty('--py-side-panel-width', `${width}px`);
  } else {
    screen.style.removeProperty('--py-app-height');
    screen.style.removeProperty('--py-side-panel-width');
  }
}

function clearPanel(screen: HTMLElement): void {
  delete screen.dataset.pySidePanel;
  screen.style.removeProperty('top');
  screen.style.removeProperty('right');
  screen.style.removeProperty('bottom');
  screen.style.removeProperty('left');
  screen.style.removeProperty('width');
  screen.style.removeProperty('height');
  screen.style.removeProperty('border-radius');
  screen.style.removeProperty('--py-app-height');
  screen.style.removeProperty('--py-side-panel-width');
}

$effect(() => {
  void collapsed;
  void panelWidth;
  void maxWidth;
  void spec.height;
  const screen = findScreen();
  if (!screen) return;
  applyPanel(screen);
});

onDestroy(() => {
  const screen = findScreen();
  if (screen) clearPanel(screen);
});

function nudge(delta: number): void {
  if (collapsed) {
    collapsed = false;
  }
  panelWidth = clampSidePanelWidth(panelWidth + delta, maxWidth);
}

function onSeparatorKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    nudge(SIDE_PANEL_WIDTH_STEP);
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    nudge(-SIDE_PANEL_WIDTH_STEP);
  } else if (event.key === 'Home') {
    event.preventDefault();
    collapsed = false;
    panelWidth = SIDE_PANEL_WIDTH_MIN;
  } else if (event.key === 'End') {
    event.preventDefault();
    collapsed = false;
    panelWidth = maxWidth;
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    collapsed = !collapsed;
  }
}

function toggleCollapsed(): void {
  collapsed = !collapsed;
}

const effectiveWidth = $derived(collapsed ? 0 : clampSidePanelWidth(panelWidth, maxWidth));
const hostLabels: Record<ShellHostVariant, string> = {
  'chat-workspace': 'Team chat workspace',
  'design-canvas': 'Design canvas',
  'code-editor': 'Code editor',
};
</script>

<div
  bind:this={rootEl}
  data-py-frame="side-panel"
  data-py-frame-shell={shell}
  data-py-side-host-variant={variant}
  data-py-side-collapsed={collapsed ? 'true' : 'false'}
  class="absolute inset-0 z-[1] flex"
  style:width="{spec.width}px"
  style:height="{spec.height}px"
>
  <div class="relative min-w-0 flex-1 overflow-hidden" data-py-side-host-layer>
    {#if Host}
      <Host />
    {:else}
      <div
        class="grid h-full place-items-center text-sm"
        style="background: #f1f5f9; color: #64748b;"
        data-py-side-host-loading
      >
        Loading {hostLabels[variant]}…
      </div>
    {/if}
  </div>

  <!-- Splitter: arrow keys resize; Enter/Space collapses. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div
    role="separator"
    aria-orientation="vertical"
    aria-label="Resize plugin panel"
    aria-valuenow={effectiveWidth}
    aria-valuemin={SIDE_PANEL_WIDTH_MIN}
    aria-valuemax={maxWidth}
    aria-valuetext={collapsed ? 'Collapsed' : `${effectiveWidth} pixels`}
    tabindex="0"
    data-py-side-splitter
    class="z-[30] w-1.5 shrink-0 cursor-col-resize self-stretch outline-none focus-visible:bg-sky-500/40"
    style="background: #cbd5e1; pointer-events: auto;"
    onkeydown={onSeparatorKeydown}
  >
    <span class="sr-only">
      Plugin panel width {effectiveWidth}px. Arrow keys resize. Enter collapses.
    </span>
  </div>

  <!-- Spacer reserves room for the screen panel so the host does not draw underneath. -->
  <div
    class="shrink-0"
    style:width="{effectiveWidth}px"
    aria-hidden="true"
    data-py-side-spacer
  ></div>

  <button
    type="button"
    class="absolute top-2 z-[40] rounded-md border px-2 py-1 text-xs font-medium shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
    style:right={collapsed ? '8px' : `${effectiveWidth + 10}px`}
    style="background: #ffffff; color: #0f172a; border-color: #cbd5e1;"
    aria-expanded={!collapsed}
    aria-controls="py-side-panel"
    data-py-side-collapse
    onclick={toggleCollapsed}
  >
    {collapsed ? 'Expand plugin' : 'Collapse plugin'}
  </button>
</div>

<span id="py-side-panel" class="sr-only" aria-hidden="true"></span>
