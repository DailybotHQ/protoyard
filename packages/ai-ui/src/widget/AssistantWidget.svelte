<script lang="ts">
import { MessageCircle } from '@lucide/svelte';
import type { Component } from 'svelte';
import { onMount, tick } from 'svelte';
import { Button, IconButton } from 'texuli/button';
import { LucideIcon } from 'texuli/icons/lucide';
import type { AssistantWidgetMode, AssistantWidgetProps } from './types.ts';

const MODE_KEY_PREFIX = 'protoyard:ai-widget-mode:';
const VALID_MODES = new Set<AssistantWidgetMode>(['launcher', 'sidebar', 'fullscreen']);

let { prototypeId, ...workspaceProps }: AssistantWidgetProps = $props();
let mode = $state<AssistantWidgetMode>('launcher');
let hasOpened = $state(false);
let Panel = $state<Component<AssistantWidgetProps> | null>(null);
let root = $state<HTMLDivElement | null>(null);
let panel = $state<HTMLDivElement | null>(null);

function getStorageKey(): string {
  return `${MODE_KEY_PREFIX}${encodeURIComponent(prototypeId)}`;
}

onMount(() => {
  try {
    const savedMode = window.localStorage.getItem(getStorageKey());
    if (savedMode && VALID_MODES.has(savedMode as AssistantWidgetMode)) {
      mode = savedMode as AssistantWidgetMode;
      hasOpened = mode !== 'launcher';
      if (hasOpened) void loadPanel();
    }
  } catch {
    // Storage may be disabled; the widget remains usable for this session.
  }
});

async function loadPanel(): Promise<void> {
  if (Panel) return;
  const loaded = await import('./AssistantWidgetPanel.svelte');
  Panel = loaded.default;
}

async function setMode(next: AssistantWidgetMode): Promise<void> {
  mode = next;
  if (next !== 'launcher') {
    hasOpened = true;
    await loadPanel();
  }
  try {
    window.localStorage.setItem(getStorageKey(), next);
  } catch {
    // Keep the selected mode in memory when storage is unavailable.
  }
  if (next === 'fullscreen') {
    requestAnimationFrame(() => panel?.querySelector<HTMLElement>('[data-widget-close]')?.focus());
  } else if (next === 'launcher') {
    requestAnimationFrame(() =>
      root?.querySelector<HTMLButtonElement>('[data-widget-launcher]')?.focus()
    );
  }
}

async function openSidebar(): Promise<void> {
  if (!hasOpened) {
    hasOpened = true;
    await loadPanel();
    await tick();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  await setMode('sidebar');
}

function collapse(): void {
  if (mode === 'fullscreen') void setMode('sidebar');
  else if (mode === 'sidebar') void setMode('launcher');
}

function handleWindowKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !root?.contains(event.target as Node)) return;
  if (mode !== 'launcher') {
    event.preventDefault();
    event.stopPropagation();
    collapse();
  }
}

function trapFullscreenFocus(event: KeyboardEvent): void {
  if (mode !== 'fullscreen' || event.key !== 'Tab' || !panel) return;
  const focusable = Array.from(
    panel.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter(
    (element) =>
      element.getClientRects().length > 0 &&
      window.getComputedStyle(element).visibility !== 'hidden'
  );
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) {
    event.preventDefault();
    panel.focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<div bind:this={root} class="pointer-events-none absolute inset-0 z-40" data-ai-widget data-widget-mode={mode}>
  <IconButton
    variant="default"
    class={`pointer-events-auto absolute bottom-4 right-4 size-14 rounded-full shadow-lg transition-transform duration-200 hover:scale-105 ${mode !== 'launcher' ? 'scale-0 opacity-0' : ''}`}
    label="Open simulated assistant"
    aria-expanded={mode !== 'launcher'}
    aria-hidden={mode !== 'launcher'}
    aria-controls="ai-widget-panel"
    tabindex={mode === 'launcher' ? 0 : -1}
    data-widget-launcher
    onclick={() => void openSidebar()}
  >
    <LucideIcon icon={MessageCircle} size="lg" />
  </IconButton>

  {#if hasOpened && Panel}
    <div
      bind:this={panel}
      id="ai-widget-panel"
      class="pointer-events-auto absolute inset-y-0 right-0 flex min-h-0 flex-col overflow-hidden border border-border bg-background shadow-2xl transition-[width,height,opacity,transform,border-radius] duration-300 ease-out motion-reduce:transition-none"
      class:w-full={mode === 'fullscreen'}
      class:h-full={mode !== 'launcher'}
      class:w-[min(28rem,100%)]={mode === 'sidebar'}
      class:translate-x-full={mode === 'launcher'}
      class:opacity-0={mode === 'launcher'}
      class:rounded-none={mode === 'fullscreen'}
      class:rounded-l-2xl={mode === 'sidebar'}
      aria-hidden={mode === 'launcher'}
      aria-modal={mode === 'fullscreen' ? 'true' : undefined}
      aria-label="Simulated assistant"
      role="dialog"
      tabindex="-1"
      onkeydown={trapFullscreenFocus}
      inert={mode === 'launcher'}
      data-widget-panel
      data-widget-fullscreen={mode === 'fullscreen' ? 'true' : 'false'}
    >
      <header class="flex min-h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-3">
        <span class="truncate text-sm font-semibold">Simulated assistant</span>
        <div class="flex items-center gap-1">
          {#if mode === 'sidebar'}
            <Button size="sm" variant="ghost" aria-label="Expand assistant to full screen" onclick={() => void setMode('fullscreen')}>Expand</Button>
          {:else}
            <Button size="sm" variant="ghost" aria-label="Restore assistant sidebar" onclick={() => void setMode('sidebar')}>Restore</Button>
          {/if}
          <Button data-widget-close size="sm" variant="ghost" aria-label={mode === 'fullscreen' ? 'Restore assistant sidebar' : 'Close assistant'} onclick={collapse}>{mode === 'fullscreen' ? 'Restore' : 'Close'}</Button>
        </div>
      </header>
      <div class="min-h-0 flex-1 overflow-hidden p-2 sm:p-4">
        <Panel {prototypeId} {...workspaceProps} />
      </div>
    </div>
  {/if}
</div>
