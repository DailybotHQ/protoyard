<script lang="ts">
import { navigate, runService } from '@protoyard/renderer-svelte';
import {
  cn,
  getOverlayPortalTarget,
  Kbd,
  Spinner,
  subscribeOverlayPortalTarget,
} from '@protoyard/ui';
import { Command, Dialog as DialogPrimitive } from 'bits-ui';
import { shortcutKeys, shortcutLabel } from './platform.ts';
import type { CommandEntry, CommandRegistry } from './registry.ts';

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
let portal = $state(getOverlayPortalTarget());

$effect(() => registry.subscribe(() => version++));
$effect(() => subscribeOverlayPortalTarget(() => (portal = getOverlayPortalTarget())));

const groups = $derived.by(() => {
  void version;
  const byGroup = new Map<string, CommandEntry[]>();
  for (const entry of registry.search(query)) {
    const list = byGroup.get(entry.group) ?? [];
    list.push(entry);
    byGroup.set(entry.group, list);
  }
  return [...byGroup.entries()];
});

async function select(entry: CommandEntry) {
  if (running) return;
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
</script>

<DialogPrimitive.Root
  bind:open
  onOpenChange={(next) => {
    if (!next) query = '';
  }}
>
  <DialogPrimitive.Portal to={portal ?? undefined}>
    <DialogPrimitive.Overlay class="fixed inset-0 z-50 bg-black/40" />
    <DialogPrimitive.Content
      class="fixed top-[12vh] left-1/2 z-50 flex max-h-[76vh] w-[calc(100%-2rem)] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-border bg-elevated text-foreground shadow-float outline-none sm:top-[18vh] sm:max-w-xl"
    >
      <DialogPrimitive.Title class="sr-only">Command palette</DialogPrimitive.Title>
      <DialogPrimitive.Description class="sr-only">
        Search pages and actions. Use the arrow keys to move and Enter to run.
      </DialogPrimitive.Description>
      <Command.Root label="Commands" shouldFilter={false} loop>
        <Command.Input
          bind:value={query}
          {placeholder}
          class="h-14 border-b border-border bg-transparent px-4 text-base outline-none placeholder:text-muted-foreground"
        />
        <Command.List class="max-h-[min(60vh,28rem)] overflow-y-auto p-2" aria-busy={running !== null || undefined}>
          {#if groups.length === 0}
            <Command.Empty class="px-3 py-6 text-center text-sm text-muted-foreground">
              {query.trim() ? 'No matching pages or actions.' : 'Nothing to show for this persona.'}
            </Command.Empty>
          {/if}
          {#each groups as [group, entries] (group)}
            <Command.Group value={group} class="mb-2 last:mb-0">
              <Command.GroupHeading class="px-3 py-2 text-xs font-medium text-muted-foreground">{group}</Command.GroupHeading>
              <Command.GroupItems>
                {#each entries as entry (entry.id)}
                  <Command.Item
                    value={entry.id}
                    onSelect={() => select(entry)}
                    aria-busy={running === entry.id || undefined}
                    aria-keyshortcuts={entry.shortcut ? shortcutLabel(entry.shortcut, isMac).replace(/ /g, '+') : undefined}
                    class={cn(
                      'flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm outline-none data-[selected]:bg-muted',
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
