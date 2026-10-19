<script lang="ts">
import Search from '@lucide/svelte/icons/search';
import { mount, onMount } from 'svelte';

/**
 * The header's ⌘K button. It is all that loads on every page: the palette
 * itself (commands, search, the control-server client and the device
 * catalog) is imported on the first click, ⌘K / Ctrl+K or `/`, then mounted
 * here and opened immediately. After that the palette owns the shortcuts.
 */
interface Props {
  homeUrl: string;
}

let { homeUrl }: Props = $props();
let hydrated = $state(false);
let trigger: HTMLButtonElement;
let host: HTMLDivElement;
let show: (() => void) | null = null;
let loading: Promise<void> | null = null;

function load(): Promise<void> {
  loading ??= import('./CommandPalette.svelte').then(({ default: CommandPalette }) => {
    mount(CommandPalette, {
      target: host,
      props: {
        homeUrl,
        externalTrigger: trigger,
        onReady: (api: { show: () => void }) => {
          show = api.show;
        },
      },
    });
  });
  return loading;
}

async function open(): Promise<void> {
  await load();
  show?.();
}

onMount(() => {
  const onShortcut = (event: KeyboardEvent) => {
    if (show) return; // the mounted palette handles its own shortcuts
    const target = event.target as HTMLElement | null;
    const typing =
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
    const combo = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
    if (combo || (event.key === '/' && !typing)) {
      event.preventDefault();
      void open();
    }
  };
  window.addEventListener('keydown', onShortcut);
  hydrated = true;
  return () => window.removeEventListener('keydown', onShortcut);
});
</script>

<div class="flex items-center" data-testid="command-palette" data-hydrated={hydrated}>
  <button
    bind:this={trigger}
    type="button"
    class="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-sm text-muted hover:bg-surface-2 hover:text-fg sm:px-3"
    aria-haspopup="dialog"
    aria-label="Open command palette (Command or Control K)"
    onclick={() => void open()}
  >
    <Search size={15} aria-hidden="true" />
    <span class="hidden sm:inline">Search</span>
    <kbd class="rounded border border-line bg-bg px-1.5 py-0.5 font-mono text-[10px] text-muted">⌘K</kbd>
  </button>
  <div bind:this={host} class="contents"></div>
</div>
