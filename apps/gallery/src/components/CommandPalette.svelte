<script lang="ts">
import { Button, Dialog, Input } from '@protoyard/ui';
import { onMount } from 'svelte';
import { Icon } from 'texuli/icons';
import {
  loadCompactIndex,
  type PaletteAction,
  paletteCommands,
  rankPaletteCommands,
} from '@/lib/commands.ts';
import { control } from '@/lib/control.svelte.ts';
import { withBase } from '@/lib/format.ts';
import { applyTheme, readThemeChoice } from '@/lib/theme.ts';
import type { CompactEntry } from '@/lib/types.ts';

interface Props {
  homeUrl: string;
  /**
   * The header button when the palette is loaded lazily by
   * CommandPaletteTrigger: no own button is rendered, focus returns to it.
   */
  externalTrigger?: HTMLElement;
  /** Receives `show` once mounted, so a lazy loader can open it right away. */
  onReady?: (api: { show: () => void }) => void;
}

let { homeUrl, externalTrigger, onReady }: Props = $props();
let entries = $state<CompactEntry[]>([]);
let query = $state('');
let open = $state(false);
let activeIndex = $state(0);
let status = $state('');
let hydrated = $state(false);
let indexLoaded = $state(false);
let indexError = $state(false);
let input = $state<HTMLElement | null>(null);
// $state: the own button only renders without an external trigger.
let trigger = $state<HTMLElement | null>(null);
let returnFocusTo: HTMLElement | null = null;

const commands = $derived(
  paletteCommands(entries, {
    basePath: import.meta.env.BASE_URL,
    controlAvailable:
      control.status === 'available' ? true : control.status === 'unavailable' ? false : null,
    runningSlugs: control.running.map((server) => server.slug),
  })
);
const results = $derived(rankPaletteCommands(commands, query, 12));
const activeCommand = $derived(results[activeIndex]);

onMount(() => {
  hydrated = true;
  void control.detect();
  void loadCompactIndex(document, homeUrl)
    .then((list) => {
      entries = list;
      indexLoaded = true;
    })
    .catch(() => {
      indexError = true;
      indexLoaded = true;
    });

  const onShortcut = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    const typing =
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (open) close();
      else show();
      return;
    }
    if (event.key === '/' && !typing) {
      event.preventDefault();
      show();
    }
  };
  const onEscape = (event: KeyboardEvent) => {
    if (!open || event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    close();
  };
  window.addEventListener('keydown', onShortcut);
  window.addEventListener('keydown', onEscape, true);
  onReady?.({ show });
  return () => {
    window.removeEventListener('keydown', onShortcut);
    window.removeEventListener('keydown', onEscape, true);
  };
});

function show(): void {
  if (open) return;
  const activeElement = document.activeElement;
  returnFocusTo =
    activeElement instanceof HTMLElement && activeElement !== document.body
      ? activeElement
      : (externalTrigger ??
        trigger ??
        document.querySelector<HTMLElement>(
          '[data-testid="command-palette"] button[aria-haspopup="dialog"]'
        ));
  query = '';
  activeIndex = 0;
  status = '';
  open = true;
  requestAnimationFrame(() => input?.focus());
}

function close(): void {
  open = false;
  const target =
    [returnFocusTo, externalTrigger, trigger].find(
      (candidate): candidate is HTMLElement => candidate?.isConnected === true
    ) ?? document.querySelector<HTMLElement>('header button[aria-haspopup="dialog"]');
  returnFocusTo = null;
  // The dialog focus trap releases focus after the closing transition.
  setTimeout(() => {
    if (target?.isConnected) {
      target.focus({ preventScroll: true });
    }
  }, 250);
}

function handleInputKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown' && results.length > 0) {
    event.preventDefault();
    activeIndex = (activeIndex + 1) % results.length;
  } else if (event.key === 'ArrowUp' && results.length > 0) {
    event.preventDefault();
    activeIndex = (activeIndex - 1 + results.length) % results.length;
  } else if (event.key === 'Enter' && activeCommand) {
    event.preventDefault();
    void run(activeCommand.action);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    close();
  }
}

function withShell(url: string): string {
  const target = new URL(url, window.location.href);
  target.searchParams.set('shell', 'phone');
  return target.toString();
}

async function run(action: PaletteAction): Promise<void> {
  close();
  if (action.type === 'navigate') {
    window.location.assign(action.href);
    return;
  }
  if (action.type === 'open-device') {
    const running = control.find(action.slug);
    if (running) {
      window.open(withShell(running.url), '_blank', 'noopener,noreferrer');
      return;
    }
    if (action.embeddedUrl) {
      const embedded = withBase(`/${action.embeddedUrl.replace(/^\/+/, '')}`);
      window.open(withShell(embedded), '_blank', 'noopener,noreferrer');
      return;
    }
    status = 'No local or bundled preview is available. Open the detail page and choose a device.';
    window.location.assign(action.detailHref);
    return;
  }
  if (action.type === 'server') {
    if (control.status !== 'available') {
      status =
        'The local control server is unavailable. Copy the dev command from this palette instead.';
      return;
    }
    if (action.operation === 'start') {
      const server = await control.start(action.slug);
      status = server
        ? `Started ${action.slug}.`
        : `Could not start ${action.slug}: ${control.errors[action.slug] ?? 'unknown error'}`;
    } else {
      await control.stop(action.slug);
      status = control.find(action.slug)
        ? `Could not stop ${action.slug}: ${control.errors[action.slug] ?? 'unknown error'}`
        : `Stopped ${action.slug}.`;
    }
    return;
  }
  if (action.type === 'copy') {
    try {
      await navigator.clipboard.writeText(action.command);
      status = 'Development command copied.';
    } catch {
      status = 'Clipboard access failed. Open a prototype detail page to select the command.';
    }
    return;
  }

  const current = document.documentElement.dataset.txMode;
  const preferred = readThemeChoice();
  const dark = current === 'dark' || (current !== 'light' && preferred === 'dark');
  applyTheme(dark ? 'light' : 'dark');
  status = `Switched to ${dark ? 'light' : 'dark'} theme.`;
}
</script>

<div
  class="flex items-center"
  data-testid={externalTrigger ? undefined : 'command-palette'}
  data-hydrated={hydrated}
>
  {#if !externalTrigger}
  <Button
    bind:ref={trigger}
    type="button"
    class="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-sm text-muted hover:bg-surface-2 hover:text-fg sm:px-3"
    aria-haspopup="dialog"
    aria-label="Open command palette (Command or Control K)"
    onclick={show}
  >
    <Icon icon="search" size={15} aria-hidden="true" />
    <span class="hidden sm:inline">Search</span>
    <kbd class="rounded border border-line bg-bg px-1.5 py-0.5 font-mono text-[10px] text-muted">⌘K</kbd>
  </Button>
  {/if}

  <Dialog bind:open title="Command palette" hideClose size="lg" onOpenChange={(nextOpen) => { if (!nextOpen) close(); }} class="fixed top-[10vh] m-auto max-h-[80vh] w-[calc(100%-2rem)] max-w-xl overflow-hidden rounded-xl border border-line bg-surface p-0 text-fg shadow-2xl">
    {#snippet children()}
    <div class="flex items-center gap-3 border-b border-line px-4">
      <Icon icon="search" size={18} class="shrink-0 text-muted" aria-hidden="true" />
      <Input
        bind:ref={input}
        id="gallery-command-input"
        type="text"
        role="combobox"
        aria-label="Search prototypes, templates, and actions"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="gallery-command-list"
        aria-activedescendant={activeCommand ? `gallery-command-${activeCommand.id}` : undefined}
        placeholder="Search prototypes, templates, and actions…"
        class="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
        value={query}
        oninput={(event) => {
          query = event.currentTarget.value;
          activeIndex = 0;
        }}
        onkeydown={handleInputKeydown}
      />
      <kbd class="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-muted">Esc</kbd>
    </div>

    <ul id="gallery-command-list" role="listbox" aria-label="Commands" class="max-h-[min(60vh,28rem)] overflow-y-auto p-2">
      {#each results as item, index (item.id)}
        <li
          id={`gallery-command-${item.id}`}
          role="option"
          aria-selected={index === activeIndex}
          class="cursor-pointer rounded-lg px-3 py-2.5 aria-selected:bg-accent-soft aria-selected:text-fg"
          onmouseenter={() => (activeIndex = index)}
          onpointerdown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            void run(item.action);
          }}
        >
          <span class="flex items-center justify-between gap-4">
            <span class="font-medium">{item.label}</span>
            <span class="shrink-0 text-[11px] text-muted">{item.group}</span>
          </span>
          {#if item.description}<span class="mt-0.5 block truncate text-xs text-muted">{item.description}</span>{/if}
        </li>
      {:else}
        <li role="option" aria-selected="false" class="px-3 py-6 text-center text-sm text-muted">
          {indexError
            ? 'The gallery index could not be loaded.'
            : !indexLoaded
              ? 'Loading commands…'
              : query
                ? 'No matching commands.'
                : 'No commands available.'}
        </li>
      {/each}
    </ul>
    <div class="flex items-center justify-between border-t border-line px-4 py-2 text-[11px] text-muted">
      <span>↑ ↓ to navigate · Enter to run</span>
      <span>Searches prototypes and templates</span>
    </div>
    {/snippet}
  </Dialog>
  <span class="sr-only" role="status" aria-live="polite">{status}</span>
</div>
