<script lang="ts">
import { mount, onMount } from 'svelte';
import { Button } from 'texuli/button';
import { Icon } from 'texuli/icons';
import { retryable } from '../lib/retryable.ts';

/**
 * The header's ⌘K button. It is all that loads on every page: the palette
 * itself (commands, search, the control-server client and the device
 * catalog) is imported on the first click, ⌘K / Ctrl+K or `/`, then mounted
 * here and opened immediately. After that the palette owns the shortcuts.
 * A failed chunk load is reported next to the button and retried on the next
 * open, never cached.
 */
interface Props {
  homeUrl: string;
}

let { homeUrl }: Props = $props();
let hydrated = $state(false);
// $state: bind:ref on a component writes through a reactive binding.
let trigger = $state<HTMLElement | null>(null);
let host: HTMLDivElement;
let show: (() => void) | null = null;
let failed = $state(false);

const load = retryable(() =>
  import('./CommandPalette.svelte').then(({ default: CommandPalette }) => {
    mount(CommandPalette, {
      target: host,
      props: {
        homeUrl,
        externalTrigger: trigger ?? undefined,
        onReady: (api: { show: () => void }) => {
          show = api.show;
          api.show();
        },
      },
    });
  })
);

async function open(): Promise<void> {
  try {
    await load();
  } catch (error) {
    failed = true;
    console.error('[gallery] the command palette failed to load', error);
    return;
  }
  failed = false;
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
  <Button variant="outline"
    bind:ref={trigger}
    type="button"
    class="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-sm text-muted hover:bg-surface-2 hover:text-fg sm:px-3"
    aria-haspopup="dialog"
    onclick={() => void open()}
  >
    <Icon icon="search" size={15} aria-hidden="true" />
    <!-- The accessible name starts with the visible "Search" (WCAG 2.5.3); on
         phones the word is visually hidden but still names the button. -->
    <span class="sr-only sm:not-sr-only">Search</span>
    <span class="sr-only">(Command or Control K)</span>
    <kbd aria-hidden="true" class="rounded border border-line bg-bg px-1.5 py-0.5 font-mono text-[10px] text-muted">⌘K</kbd>
  </Button>
  {#if failed}
    <p role="alert" class="ml-2 text-xs text-danger" data-testid="command-palette-error">
      Search could not load. Check your connection and try again.
    </p>
  {/if}
  <div bind:this={host} class="contents"></div>
</div>
