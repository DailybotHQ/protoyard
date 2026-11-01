<script lang="ts">
import * as DialogPrimitive from '@texuli/primitives/dialog';
import { onMount } from 'svelte';
import type { HTMLAttributes } from 'svelte/elements';
import {
  CommandEmpty,
  CommandGroup,
  CommandGroupHeading,
  CommandGroupItems,
  CommandInput,
  CommandItem,
  CommandList,
  CommandLoading,
  CommandRoot,
  commandPaletteClass,
} from 'texuli/command';
import { cx } from 'texuli/cx';
import { useOverlayPortalTarget } from '../../lib/use-overlay-portal.svelte.ts';
import type { CommandPaletteItem, CommandPaletteSearch, CommandPaletteSelect } from './types.ts';

interface OwnProps {
  /** The palette's content element while open, `null` while closed (bindable). */
  ref?: HTMLElement | null;
  /** Open state (bindable). ⌘K / Ctrl+K toggles it as well. */
  open?: boolean;
  search: CommandPaletteSearch;
  onSelect: CommandPaletteSelect;
  recentItems?: CommandPaletteItem[];
  debounceMs?: number;
  placeholder?: string;
  class?: string;
}

/** Extra attributes (`data-*`, `aria-*`, `id`, handlers…) land on the palette's content element. */
type Props = OwnProps & Omit<HTMLAttributes<HTMLDivElement>, keyof OwnProps>;

let {
  search,
  onSelect,
  recentItems = [],
  debounceMs = 150,
  placeholder = 'Search pages, people, and actions…',
  class: className,
  ref = $bindable(null),
  open = $bindable(false),
  ...rest
}: Props = $props();

const portal = useOverlayPortalTarget();

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

// Opened by the caller (`open` set to true) rather than ⌘K: remember the
// element focus returns to, as the shortcut does.
let wasOpen = false;
$effect.pre(() => {
  const isOpen = open;
  if (isOpen && !wasOpen && !returnFocusTo && typeof document !== 'undefined') {
    returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  wasOpen = isOpen;
});

onMount(() => {
  window.addEventListener('keydown', handleShortcut);
  return () => window.removeEventListener('keydown', handleShortcut);
});
</script>

<!--
  Texuli's command palette parts and classes on a dialog root inside a framed
  device or the top layer. The pending search reaches Texuli's CommandRoot as
  `loading`, so its CommandLoading status is the "Searching…" announcement
  (G88). Texuli's own `CommandPalette` names its search box with its dialog
  title; this palette keeps "Search commands", which hosts and tests address.
-->
<DialogPrimitive.Root
  bind:open
  onOpenChange={setOpen}
  mode={portal.mode}
  container={portal.container}
  onCloseAutoFocus={(event) => {
    event.preventDefault();
    restoreFocus();
  }}
>
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay class="tx-command-palette__overlay" data-tx-command-palette-overlay="" />
    <DialogPrimitive.Content
      {...rest}
      bind:ref
      class={cx('tx-command-palette__content', commandPaletteClass({ size: 'md' }), className)}
      data-tx-command-palette=""
      data-size="md"
    >
      <DialogPrimitive.Title class="tx-sr-only">Command palette</DialogPrimitive.Title>
      <DialogPrimitive.Description class="tx-sr-only">
        Search or choose a recent action. Use the arrow keys to move and Enter to select.
      </DialogPrimitive.Description>
      <CommandRoot label="Search commands" {loading} shouldFilter={false} loop>
        <CommandInput bind:value={query} {placeholder} />
        <CommandList>
          <!-- Shown (and the list aria-busy) while the search is pending. -->
          <CommandLoading>Searching…</CommandLoading>
          {#if loading}
            <!-- Results and the empty state wait for the search. -->
          {:else if searchError}
            <p role="alert" class="tx-command__error" data-tx-command-error="">{searchError}</p>
          {:else if groupedItems.length === 0}
            <CommandEmpty>{query.trim() ? 'No results found.' : 'No recent items.'}</CommandEmpty>
          {:else}
            {#each groupedItems as group (group.label)}
              <CommandGroup value={group.label}>
                <CommandGroupHeading>{group.label}</CommandGroupHeading>
                <CommandGroupItems>
                  {#each group.items as item (item.id)}
                    <CommandItem
                      value={item.id}
                      label={item.label}
                      description={item.description}
                      keywords={item.keywords}
                      onSelect={() => selectItem(item)}
                    />
                  {/each}
                </CommandGroupItems>
              </CommandGroup>
            {/each}
          {/if}
        </CommandList>
      </CommandRoot>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
</DialogPrimitive.Root>
