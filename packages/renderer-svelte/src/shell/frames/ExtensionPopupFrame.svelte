<script lang="ts">
import { type Component, onMount } from 'svelte';
import { getRuntime } from '../../context.ts';
import type { FrameProps } from './registry.ts';

let { shell }: FrameProps = $props();
const manifest = getRuntime().manifest;
const origin = `https://${manifest.slug}.example`;
const extensionName = manifest.name;
const extensionIcon = manifest.icon ?? '🧩';
type BrowserChromeProps = { origin: string; title?: string; class?: string };

let open = $state(true);
let pinned = $state(false);
let menuOpen = $state(false);
let BrowserChromeComponent = $state.raw<Component<BrowserChromeProps> | null>(null);
let chromeHost: HTMLElement | undefined;
let controls: HTMLElement | undefined;

$effect(() => {
  const root = document.documentElement;
  root.dataset.pyExtensionPopupOpen = String(open);
  return () => {
    delete root.dataset.pyExtensionPopupOpen;
  };
});

onMount(() => {
  let cancelled = false;
  void import('@protoyard/ui')
    .then(({ BrowserChrome }) => {
      if (!cancelled) BrowserChromeComponent = BrowserChrome;
    })
    .catch((error: unknown) => {
      console.error('[protoyard] extension popup browser chrome failed to load', error);
    });

  const onPointerDown = (event: PointerEvent) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    const screen = document.querySelector('[data-py-shell-part="screen"]');
    if (chromeHost?.contains(target) || controls?.contains(target) || screen?.contains(target)) {
      return;
    }
    menuOpen = false;
    if (!pinned) open = false;
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && menuOpen) menuOpen = false;
    else if (event.key === 'Escape' && open) closePopup();
  };

  document.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('keydown', onKeyDown);
  return () => {
    cancelled = true;
    document.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('keydown', onKeyDown);
  };
});

function closePopup(): void {
  open = false;
  pinned = false;
  menuOpen = false;
}

function togglePopup(): void {
  if (open) closePopup();
  else open = true;
}

function openFromMenu(): void {
  open = true;
  menuOpen = false;
}
</script>

<div
  data-py-frame="extension-popup"
  data-py-frame-shell={shell}
  data-py-extension-popup
  data-open={open}
  data-pinned={pinned}
  class="pointer-events-none absolute inset-0"
>
  <div
    bind:this={chromeHost}
    data-py-extension-chrome
    class="pointer-events-auto absolute top-0 right-4 z-[1] h-[688px] w-[360px]"
  >
    {#if BrowserChromeComponent}
      <BrowserChromeComponent origin={origin} title={extensionName} class="h-full w-full" />
    {/if}
  </div>

  <div bind:this={controls} class="contents">
    <button
      type="button"
      class="pointer-events-auto absolute top-12 right-[3.5rem] z-[4] inline-flex size-8 items-center justify-center rounded-md bg-background text-muted-foreground shadow-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      aria-label="Toggle extensions menu"
      aria-expanded={menuOpen}
      onclick={() => (menuOpen = !menuOpen)}
    >
      <span aria-hidden="true">🧩</span>
    </button>
    <button
      type="button"
      class="pointer-events-auto absolute top-12 right-5 z-[4] inline-flex size-8 items-center justify-center rounded-md bg-background text-base shadow-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      aria-label={`Open ${extensionName}`}
      aria-expanded={open}
      onclick={togglePopup}
    >
      <span aria-hidden="true">{extensionIcon}</span>
    </button>
    {#if menuOpen}
      <div
        role="menu"
        aria-label="Browser extensions"
        class="pointer-events-auto absolute top-[5.25rem] right-[3.5rem] z-[5] min-w-52 rounded-lg border border-border bg-background p-1.5 text-foreground shadow-xl"
      >
        <button
          type="button"
          role="menuitem"
          class="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          onclick={openFromMenu}
        >
          <span aria-hidden="true">{extensionIcon}</span>
          <span class="truncate">{extensionName}</span>
        </button>
      </div>
    {/if}
    {#if open}
      <button
        type="button"
        class="pointer-events-auto absolute top-[94px] right-5 z-[4] inline-flex size-8 items-center justify-center rounded-md border border-border bg-background/95 text-muted-foreground shadow-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label={pinned ? 'Unpin extension popup' : 'Pin extension popup'}
        aria-pressed={pinned}
        onclick={() => (pinned = !pinned)}
      >
        {pinned ? 'Unpin' : 'Pin'}
      </button>
    {/if}
  </div>
</div>

<style>
:global(html[data-py-shell='extension-popup'] [data-py-shell-part='screen']) {
  inset: 88px 16px auto auto;
  z-index: 2;
  width: 360px;
  height: 600px;
  /* App layouts (MobileAppShell, h-app) size to the popup, not the window. */
  --py-app-height: 600px;
  overflow: hidden;
  box-shadow: 0 18px 42px -18px rgb(0 0 0 / 0.5);
}

:global(html[data-py-shell='extension-popup'][data-py-extension-popup-open='false'] [data-py-shell-part='screen']) {
  visibility: hidden;
  pointer-events: none;
}
</style>
