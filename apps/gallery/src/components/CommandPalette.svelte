<script lang="ts">
import Search from '@lucide/svelte/icons/search';
import { onMount } from 'svelte';
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
}

let { homeUrl }: Props = $props();
let entries = $state<CompactEntry[]>([]);
let query = $state('');
let open = $state(false);
let activeIndex = $state(0);
let status = $state('');
let hydrated = $state(false);
let indexLoaded = $state(false);
let indexError = $state(false);
let dialog: HTMLDialogElement;
let input: HTMLInputElement;
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
      if (dialog.open) close();
      else show();
      return;
    }
    if (event.key === '/' && !typing) {
      event.preventDefault();
      show();
    }
  };
  window.addEventListener('keydown', onShortcut);
  return () => window.removeEventListener('keydown', onShortcut);
});

function show(): void {
  if (dialog.open) return;
  returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  query = '';
  activeIndex = 0;
  status = '';
  open = true;
  dialog.showModal();
  requestAnimationFrame(() => input.focus());
}

function close(): void {
  if (dialog.open) dialog.close();
  open = false;
  const target = returnFocusTo;
  returnFocusTo = null;
  if (target?.isConnected) queueMicrotask(() => target.focus());
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

  const current = document.documentElement.dataset.theme;
  const preferred = readThemeChoice();
  const dark = current === 'dark' || (current !== 'light' && preferred === 'dark');
  applyTheme(dark ? 'light' : 'dark');
  status = `Switched to ${dark ? 'light' : 'dark'} theme.`;
}
</script>

<div class="flex items-center" data-testid="command-palette" data-hydrated={hydrated}>
  <button
    type="button"
    class="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-sm text-muted hover:bg-surface-2 hover:text-fg sm:px-3"
    aria-haspopup="dialog"
    aria-label="Open command palette (Command or Control K)"
    onclick={show}
  >
    <Search size={15} aria-hidden="true" />
    <span class="hidden sm:inline">Search</span>
    <kbd class="rounded border border-line bg-bg px-1.5 py-0.5 font-mono text-[10px] text-muted">⌘K</kbd>
  </button>

  <dialog
    bind:this={dialog}
    aria-label="Command palette"
    class="fixed top-[10vh] m-auto max-h-[80vh] w-[calc(100%-2rem)] max-w-xl overflow-hidden rounded-xl border border-line bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/45"
    oncancel={(event) => {
      event.preventDefault();
      close();
    }}
    onclose={() => (open = false)}
    onclick={(event) => {
      if (event.target === dialog) close();
    }}
  >
    <div class="flex items-center gap-3 border-b border-line px-4">
      <Search size={18} class="shrink-0 text-muted" aria-hidden="true" />
      <input
        bind:this={input}
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
  </dialog>
  <span class="sr-only" role="status" aria-live="polite">{status}</span>
</div>
