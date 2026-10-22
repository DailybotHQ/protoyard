<script lang="ts">
import {
  filterHotkeyBindings,
  formatHotkeyKeys,
  type HotkeyBinding,
  type HotkeyPlatform,
  type HotkeyScope,
} from '@protoyard/views/commands';
import { isMacPlatform } from '../lib/platform.ts';

interface Props {
  bindings: readonly HotkeyBinding[];
  activeScopes?: readonly HotkeyScope[];
  groupOrder?: readonly string[];
  platform?: HotkeyPlatform;
  title?: string;
  searchLabel?: string;
  emptyLabel?: string;
  alternativeLabel?: string;
}

const uid = $props.id();
let {
  bindings,
  activeScopes,
  groupOrder = [],
  platform = isMacPlatform() ? 'mac' : 'other',
  title = 'Keyboard shortcuts',
  searchLabel = 'Search shortcuts',
  emptyLabel = 'No shortcuts found',
  alternativeLabel = 'or',
}: Props = $props();

let query = $state('');
const titleId = `shortcut-sheet-title-${uid}`;

const groups = $derived.by(() => {
  const term = query.trim().toLowerCase();
  const visible = filterHotkeyBindings(bindings, activeScopes).filter((binding) => {
    if (!term) return true;
    return (
      binding.label.toLowerCase().includes(term) ||
      formatHotkeyKeys(binding, platform).some((keys) => keys.toLowerCase().includes(term))
    );
  });
  const byGroup = new Map<string, HotkeyBinding[]>();
  for (const binding of visible) {
    const group = byGroup.get(binding.group) ?? [];
    group.push(binding);
    byGroup.set(binding.group, group);
  }

  const ordered: Array<{ name: string; bindings: HotkeyBinding[] }> = [];
  for (const name of groupOrder) {
    const group = byGroup.get(name);
    if (group) {
      ordered.push({ name, bindings: group });
      byGroup.delete(name);
    }
  }
  for (const [name, entries] of byGroup) ordered.push({ name, bindings: entries });
  return ordered;
});
</script>

<section class="flex flex-col gap-4" aria-labelledby={titleId}>
  <header class="flex flex-wrap items-center justify-between gap-3">
    <h2 id={titleId} class="text-lg font-semibold">{title}</h2>
    <label class="sr-only" for={`shortcut-sheet-search-${uid}`}>{searchLabel}</label>
    <input
      id={`shortcut-sheet-search-${uid}`}
      bind:value={query}
      class="min-h-10 min-w-48 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      type="search"
      placeholder={searchLabel}
    />
  </header>

  {#if groups.length === 0}
    <p class="text-sm text-muted-foreground" role="status">{emptyLabel}</p>
  {:else}
    <div class="grid gap-6 sm:grid-cols-2">
      {#each groups as group (group.name)}
        <section aria-label={group.name}>
          <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group.name}
          </h3>
          <dl class="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-3">
            {#each group.bindings as binding (binding.id)}
              <dt class="text-sm">{binding.label}</dt>
              <dd class="flex items-center justify-end gap-2 text-sm">
                {#each formatHotkeyKeys(binding, platform) as keys, index (`${binding.id}-${index}`)}
                  {#if index > 0}<span class="text-xs text-muted-foreground">{alternativeLabel}</span>{/if}
                  <kbd class="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">{keys}</kbd>
                {/each}
              </dd>
            {/each}
          </dl>
        </section>
      {/each}
    </div>
  {/if}
</section>
