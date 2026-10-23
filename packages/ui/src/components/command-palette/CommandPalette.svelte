<script lang="ts">
import { Command as CommandIcon, Search } from '@lucide/svelte';
import { Command } from '@texuli/primitives/command';
import { Dialog as DialogPrimitive } from 'bits-ui';
import { onMount } from 'svelte';
import { cn } from '../../lib/cn.ts';
import { overlayBackdrop } from '../../lib/overlay.ts';
import { useOverlayPortalTarget } from '../../lib/use-overlay-portal.svelte.ts';
import type { CommandPaletteItem, CommandPaletteSearch, CommandPaletteSelect } from './types.ts';

interface Props {
  search: CommandPaletteSearch;
  onSelect: CommandPaletteSelect;
  recentItems?: CommandPaletteItem[];
  debounceMs?: number;
  placeholder?: string;
  class?: string;
}

let {
  search,
  onSelect,
  recentItems = [],
  debounceMs = 150,
  placeholder = 'Search pages, people, and actions…',
  class: className,
}: Props = $props();

const portal = useOverlayPortalTarget();

let open = $state(false);
let query = $state('');
let results = $state<CommandPaletteItem[]>([]);
let loading = $state(false);
let searchError = $state<string | null>(null);
let returnFocusTo: HTMLElement | null = null;
let requestVersion = 0;

const visibleItems = $derived(query.trim() ? results : recentItems);
const groupedItems = $derived.by(() => {
  const groups = new Map<string, CommandPaletteItem[]>();
  for (const item of visibleItems) {
    const group = query.trim() ? item.group : 'Recent';
    const current = groups.get(group) ?? [];
    current.push(item);
    groups.set(group, current);
  }
  return [...groups.entries()].map(([label, items]) => ({ label, items }));
});

function restoreFocus(): void {
  const target = returnFocusTo;
  returnFocusTo = null;
  queueMicrotask(() => {
    if (target?.isConnected) target.focus();
  });
}

function setOpen(nextOpen: boolean): void {
  open = nextOpen;
  if (nextOpen) {
    query = '';
    results = [];
    searchError = null;
  } else {
    query = '';
    loading = false;
    requestVersion += 1;
    restoreFocus();
  }
}

function handleShortcut(event: KeyboardEvent): void {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;
  event.preventDefault();
  if (open) {
    setOpen(false);
    return;
  }
  returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  setOpen(true);
}

function selectItem(item: CommandPaletteItem): void {
  try {
    onSelect(item);
  } finally {
    setOpen(false);
  }
}

$effect(() => {
  const searchQuery = query.trim();
  if (!open || !searchQuery) {
    loading = false;
    results = [];
    searchError = null;
    return;
  }

  const version = ++requestVersion;
  loading = true;
  results = [];
  searchError = null;
  const timer = setTimeout(
    () => {
      void Promise.resolve()
        .then(() => search(searchQuery))
        .then(
          (items) => {
            if (version !== requestVersion) return;
            results = items;
            loading = false;
          },
          () => {
            if (version !== requestVersion) return;
            results = [];
            searchError = 'Search is unavailable. Try again.';
            loading = false;
          }
        );
    },
    Math.max(0, debounceMs)
  );

  return () => clearTimeout(timer);
});

onMount(() => {
  window.addEventListener('keydown', handleShortcut);
  return () => window.removeEventListener('keydown', handleShortcut);
});
</script>

<DialogPrimitive.Root bind:open onOpenChange={setOpen}>
  <DialogPrimitive.Portal to={portal.current}>
    <DialogPrimitive.Overlay class={overlayBackdrop} />
    <DialogPrimitive.Content
      class={cn(
        'fixed top-[12vh] left-1/2 z-50 flex max-h-[76vh] w-[calc(100%-2rem)] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-border bg-elevated text-foreground shadow-float outline-none ui-anim-pop sm:top-[18vh] sm:max-w-xl',
        className
      )}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        restoreFocus();
      }}
    >
      <DialogPrimitive.Title class="sr-only">Command palette</DialogPrimitive.Title>
      <DialogPrimitive.Description class="sr-only">
        Search or choose a recent action. Use the arrow keys to move and Enter to select.
      </DialogPrimitive.Description>
      <Command.Root label="Search commands" shouldFilter={false} loop aria-busy={loading || undefined}>
        <div class="flex items-center gap-3 border-b border-border px-4">
          <Search class="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <Command.Input
            bind:value={query}
            placeholder={placeholder}
            class="h-14 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
          />
          <kbd class="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground sm:inline">Esc</kbd>
        </div>

        <Command.List class="max-h-[min(60vh,28rem)] overflow-y-auto p-2">
          {#if loading}
            <!-- The search runs here, not through the list, so its status is this palette's own. -->
            <p role="status" aria-live="polite" class="px-3 py-6 text-center text-sm text-muted-foreground">
              Searching…
            </p>
          {:else if searchError}
            <p role="alert" class="px-3 py-6 text-center text-sm text-destructive">{searchError}</p>
          {:else if groupedItems.length === 0}
            <Command.Empty class="px-3 py-6 text-center text-sm text-muted-foreground">
              {query.trim() ? 'No results found.' : 'No recent items.'}
            </Command.Empty>
          {:else}
            {#each groupedItems as group (group.label)}
              <Command.Group value={group.label} class="mb-2 last:mb-0">
                <Command.GroupHeading class="px-3 py-2 text-xs font-medium tracking-wide text-muted-foreground">
                  {group.label}
                </Command.GroupHeading>
                <Command.GroupItems>
                  {#each group.items as item (item.id)}
                    <Command.Item
                      value={item.id}
                      label={item.label}
                      keywords={item.keywords}
                      onSelect={() => selectItem(item)}
                      class="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm outline-none data-highlighted:bg-muted data-highlighted:text-foreground"
                    >
                      <CommandIcon class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span class="min-w-0 flex-1">
                        <span class="block truncate font-medium">{item.label}</span>
                        {#if item.description}
                          <span class="block truncate text-xs text-muted-foreground">{item.description}</span>
                        {/if}
                      </span>
                    </Command.Item>
                  {/each}
                </Command.GroupItems>
              </Command.Group>
            {/each}
          {/if}
        </Command.List>
        <div class="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <span>Navigate with ↑ ↓</span>
          <span>Select with Enter</span>
        </div>
      </Command.Root>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
</DialogPrimitive.Root>
