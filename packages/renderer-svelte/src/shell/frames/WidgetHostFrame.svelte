<script lang="ts">
import { onDestroy } from 'svelte';
import { getRuntime } from '../../context.ts';
import HostSite from './HostSite.svelte';
import type { FrameProps } from './registry.ts';
import { provideWidgetHost, type WidgetHostApi } from './widget-api.ts';

/**
 * Widget-host shell: fictional customer site + floating launcher that opens the
 * prototype in an anchored panel (fullscreen below 480px). The app lives in the
 * ShellHost screen sibling; this frame draws the host and drives panel chrome.
 */
let { spec, shell }: FrameProps = $props();

const DEFAULT_HOST = 'Northwind Outfitters (fictional)';
const PANEL_WIDTH = 380;
const PANEL_HEIGHT = 560;
const NARROW_MQ = '(max-width: 479px)';

let open = $state(false);
let unread = $state(0);
let rootEl = $state<HTMLDivElement | null>(null);
let launcherEl = $state<HTMLButtonElement | null>(null);
let narrow = $state(
  typeof window !== 'undefined' && typeof matchMedia === 'function'
    ? matchMedia(NARROW_MQ).matches
    : false
);

const hostName = $derived.by(() => {
  try {
    return getRuntime().manifest.preview.chrome?.hostName?.trim() || DEFAULT_HOST;
  } catch {
    return DEFAULT_HOST;
  }
});

const panelLabel = $derived(
  `${hostName.replace(/\s*\(fictional\)\s*$/i, '').trim() || 'Support'} chat`
);

function setOpen(next: boolean): void {
  open = next;
}

function toggle(): void {
  const wasOpen = open;
  open = !open;
  if (wasOpen && !open) {
    queueMicrotask(() => launcherEl?.focus());
  }
}

function closeFromEsc(): void {
  if (!open) return;
  open = false;
  queueMicrotask(() => launcherEl?.focus());
}

const api: WidgetHostApi = {
  setUnread(count: number) {
    unread = Math.max(0, Math.floor(count));
  },
  getUnread() {
    return unread;
  },
  isOpen() {
    return open;
  },
  open() {
    setOpen(true);
  },
  close() {
    setOpen(false);
    queueMicrotask(() => launcherEl?.focus());
  },
};

// svelte-ignore state_referenced_locally
provideWidgetHost(api);

if (typeof window !== 'undefined') {
  window.__protoyardWidget = api;
}
onDestroy(() => {
  if (typeof window !== 'undefined' && window.__protoyardWidget === api) {
    delete window.__protoyardWidget;
  }
  const screen = findScreen();
  if (screen) clearPanel(screen);
});

function findScreen(): HTMLElement | null {
  // Frame is a sibling of the screen under [data-py-shell-part=device].
  const device =
    rootEl?.parentElement ??
    (typeof document !== 'undefined'
      ? document.querySelector('[data-py-shell-part="device"]')
      : null);
  return device?.querySelector?.('[data-py-shell-part="screen"]') as HTMLElement | null;
}

function clearPanel(screen: HTMLElement): void {
  delete screen.dataset.pyWidgetPanel;
  screen.removeAttribute('role');
  screen.removeAttribute('aria-label');
  screen.removeAttribute('aria-modal');
  screen.style.removeProperty('width');
  screen.style.removeProperty('height');
  screen.style.removeProperty('--py-app-height');
}

function applyPanel(screen: HTMLElement): void {
  screen.dataset.pyWidgetPanel = open ? 'open' : 'closed';
  screen.setAttribute('role', 'dialog');
  screen.setAttribute('aria-label', panelLabel);
  screen.setAttribute('aria-modal', open ? 'true' : 'false');
  if (open) {
    if (narrow) {
      screen.style.width = '100%';
      screen.style.height = '100%';
      screen.style.setProperty('--py-app-height', `${spec.height}px`);
    } else {
      const height = Math.min(PANEL_HEIGHT, Math.max(320, spec.height - 100));
      screen.style.width = `${Math.min(PANEL_WIDTH, spec.width - 32)}px`;
      screen.style.height = `${height}px`;
      screen.style.setProperty('--py-app-height', `${height}px`);
    }
  } else {
    screen.style.removeProperty('width');
    screen.style.removeProperty('height');
    screen.style.removeProperty('--py-app-height');
  }
}

$effect(() => {
  // Track open, narrow, host label, and spec size.
  void open;
  void narrow;
  void panelLabel;
  void spec.width;
  void spec.height;
  const screen = findScreen();
  if (!screen) return;
  applyPanel(screen);
  return () => {
    // Leave dataset for CSS until destroy; ShellHost may reuse the node.
  };
});

$effect(() => {
  if (typeof matchMedia !== 'function') return;
  const mq = matchMedia(NARROW_MQ);
  const onChange = () => {
    narrow = mq.matches;
  };
  onChange();
  mq.addEventListener?.('change', onChange);
  return () => mq.removeEventListener?.('change', onChange);
});

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && open) {
    event.stopPropagation();
    closeFromEsc();
  }
}
</script>

<svelte:window onkeydown={onKeydown} />

<div
  bind:this={rootEl}
  data-py-frame="widget-host"
  data-py-frame-shell={shell}
  data-py-widget-open={open ? 'true' : 'false'}
  class="absolute inset-0 z-[1]"
  style:width="{spec.width}px"
  style:height="{spec.height}px"
>
  <!-- Host site fills the device; pointer events on content, not on the open panel hole. -->
  <div class="absolute inset-0 overflow-hidden" data-py-widget-host-layer>
    <HostSite {hostName} />
  </div>

  <button
    bind:this={launcherEl}
    type="button"
    class="absolute z-[40] flex size-14 items-center justify-center rounded-full border-0 shadow-lg outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-offset-2"
    style:right={narrow && open ? '12px' : '20px'}
    style:bottom={narrow && open ? '12px' : '20px'}
    style="background: #0f766e; color: #ecfdf5;"
    aria-label={open ? 'Close chat' : 'Open chat'}
    aria-expanded={open}
    aria-controls="py-widget-panel"
    onclick={toggle}
    data-py-widget-launcher
  >
    {#if open}
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
        <path d="M18 6 6 18M6 6l12 12" stroke-linecap="round" />
      </svg>
    {:else}
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path
          d="M21 12c0 4.4-4 8-9 8-1.1 0-2.2-.2-3.2-.6L3 21l1.8-4.2C4.3 15.6 3 13.9 3 12c0-4.4 4-8 9-8s9 3.6 9 8Z"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    {/if}
    {#if unread > 0 && !open}
      <span
        class="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold"
        style="background: #dc2626; color: #fff;"
        data-py-widget-badge
        aria-label={`${unread} unread`}
      >
        {unread > 9 ? '9+' : unread}
      </span>
    {/if}
  </button>
</div>

<!-- id hook for aria-controls; the real dialog is the ShellHost screen. -->
<span id="py-widget-panel" class="sr-only" aria-hidden="true"></span>
