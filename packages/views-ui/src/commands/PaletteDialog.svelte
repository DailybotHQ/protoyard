<script lang="ts">
import { navigate, runService } from '@protoyard/renderer-svelte';
import {
  Button,
  getOverlayPortalTarget,
  Kbd,
  Spinner,
  subscribeOverlayPortalTarget,
} from '@protoyard/ui';
import { Command } from '@texuli/primitives/command';
import * as DialogPrimitive from '@texuli/primitives/dialog';
import { cx } from 'texuli/cx';
import { shortcutKeys, shortcutLabel } from '../lib/platform.ts';
import type { CommandEntry, CommandRegistry } from './registry.ts';
import { COMMAND_QUERY_MAX_LENGTH, rankCommands } from './registry.ts';

interface Props {
  registry: CommandRegistry;
  open: boolean;
  isMac: boolean;
  placeholder?: string;
}

let {
  registry,
  open = $bindable(),
  isMac,
  placeholder = 'Search pages and actions…',
}: Props = $props();

let query = $state('');
let version = $state(0);
let running = $state<string | null>(null);
let searchState = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
let asyncEntries = $state<CommandEntry[]>([]);
let stepStack = $state<Array<{ entry: CommandEntry; entries: CommandEntry[] }>>([]);
let stepEntries = $state<CommandEntry[] | null>(null);
let portal = $state(getOverlayPortalTarget());

$effect(() => registry.subscribe(() => version++));
$effect(() => subscribeOverlayPortalTarget(() => (portal = getOverlayPortalTarget())));

const groups = $derived.by(() => {
  void version;
  const byGroup = new Map<string, CommandEntry[]>();
  const entries = stepEntries
    ? rankCommands(registry.filter(stepEntries), query)
    : query.trim()
      ? asyncEntries
      : registry.search('');
  for (const entry of entries) {
    const list = byGroup.get(entry.group) ?? [];
    list.push(entry);
    byGroup.set(entry.group, list);
  }
  return [...byGroup.entries()];
});

$effect(() => {
  void version;
  const currentQuery = query.trim();
  if (!currentQuery || stepEntries) {
    asyncEntries = [];
    searchState = 'idle';
    return;
  }
  const controller = new AbortController();
  asyncEntries = [];
  searchState = 'loading';
  registry
    .searchAsync(currentQuery, controller.signal)
    .then((entries) => {
      if (controller.signal.aborted) return;
      asyncEntries = entries;
      searchState = 'ready';
    })
    .catch((error: unknown) => {
      if (
        controller.signal.aborted ||
        (error instanceof DOMException && error.name === 'AbortError')
      ) {
        return;
      }
      asyncEntries = registry.search(currentQuery);
      searchState = 'error';
    });
  return () => controller.abort();
});

async function select(entry: CommandEntry) {
  if (running) return;
  if (entry.children) {
    running = entry.id;
    try {
      const children = await registry.children(entry);
      if (children.length > 0) {
        stepStack = [...stepStack, { entry, entries: children }];
        stepEntries = children;
        query = '';
      } else if (entry.run) {
        const result = await runService(() => registry.run(entry));
        if (result.ok) open = false;
      }
    } finally {
      running = null;
    }
    return;
  }
  if (entry.path) {
    open = false;
    navigate(entry.path);
    return;
  }
  running = entry.id;
  try {
    // Pending bar, aria-busy on the item, and toasts for denied or simulated failures.
    const result = await runService(() => registry.run(entry));
    if (result.ok) open = false;
  } finally {
    running = null;
  }
}

function goBack() {
  stepStack = stepStack.slice(0, -1);
  stepEntries = stepStack.at(-1)?.entries ?? null;
  query = '';
}
</script>

<!-- Inside a framed device the palette is contained by its screen; otherwise it opens in the top layer. -->
<DialogPrimitive.Root
  bind:open
  mode={portal ? 'contained' : 'top-layer'}
  container={portal}
  onOpenChange={(next) => {
    if (!next) {
      query = '';
      stepStack = [];
      stepEntries = null;
    }
  }}
>
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay class="fixed inset-0 z-50 bg-black/40" />
    <DialogPrimitive.Content
      class="fixed top-[12vh] left-1/2 z-50 flex max-h-[76vh] w-[calc(100%-2rem)] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-border bg-elevated text-foreground shadow-float outline-none sm:top-[18vh] sm:max-w-xl"
    >
      <DialogPrimitive.Title class="sr-only">Command palette</DialogPrimitive.Title>
      <DialogPrimitive.Description class="sr-only">
        Search pages and actions. Use the arrow keys to move and Enter to run.
      </DialogPrimitive.Description>
      {#if stepStack.length}
        <div class="flex items-center gap-2 border-b border-border px-3 py-2">
          <Button type="button" variant="ghost" class="rounded px-2 py-1 text-sm hover:bg-muted" onclick={goBack}>
            Back
          </Button>
          <span class="truncate text-sm text-muted-foreground" aria-live="polite">
            {stepStack.map(({ entry }) => entry.label).join(' › ')}
          </span>
        </div>
      {/if}
      <!-- The list states its own loading; a running command marks the whole palette busy. -->
      <Command.Root label="Commands" shouldFilter={false} loop aria-busy={running !== null || undefined}>
        <Command.Input
          bind:value={query}
          maxlength={COMMAND_QUERY_MAX_LENGTH}
          {placeholder}
          class="h-14 border-b border-border bg-transparent px-4 text-base outline-none placeholder:text-muted-foreground"
        />
        <Command.List class="max-h-[min(60vh,28rem)] overflow-y-auto p-2">
          {#if groups.length === 0}
            <Command.Empty class="px-3 py-6 text-center text-sm text-muted-foreground">
              {#if searchState === 'loading'}
                <span class="inline-flex items-center gap-2"><Spinner class="size-4" />Searching…</span>
              {:else if searchState === 'error'}
                Search failed.
              {:else if query.trim()}
                No matching pages or actions.
              {:else}
                Nothing to show for this persona.
              {/if}
            </Command.Empty>
          {/if}
          {#each groups as [group, entries] (group)}
            <Command.Group value={group} class="mb-2 last:mb-0">
              <Command.GroupHeading class="px-3 py-2 text-xs font-medium text-muted-foreground">{group}</Command.GroupHeading>
              <Command.GroupItems>
                {#each entries as entry (entry.id)}
                  <Command.Item
                    value={entry.id}
                    label={entry.label}
                    onSelect={() => select(entry)}
                    aria-busy={running === entry.id || undefined}
                    aria-haspopup={entry.children ? 'listbox' : undefined}
                    aria-keyshortcuts={entry.shortcut ? shortcutLabel(entry.shortcut, isMac).replace(/ /g, '+') : undefined}
                    class={cx(
                      'flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm outline-none data-highlighted:bg-muted',
                      running !== null && running !== entry.id && 'opacity-60'
                    )}
                  >
                    <span class="min-w-0 flex-1">
                      <span class="block truncate font-medium">{entry.label}</span>
                      {#if entry.description}<span class="block truncate text-xs text-muted-foreground">{entry.description}</span>{/if}
                    </span>
                    {#if running === entry.id}
                      <Spinner class="size-4" />
                      <span class="sr-only">Running</span>
                    {:else if entry.shortcut}
                      <span class="flex gap-1" aria-hidden="true">
                        {#each shortcutKeys(entry.shortcut, isMac) as key, i (i)}<Kbd>{key}</Kbd>{/each}
                      </span>
                    {/if}
                  </Command.Item>
                {/each}
              </Command.GroupItems>
            </Command.Group>
          {/each}
        </Command.List>
      </Command.Root>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
</DialogPrimitive.Root>
