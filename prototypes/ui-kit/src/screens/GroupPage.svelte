<script lang="ts">
import { EmptyState } from '@protoyard/ui';
import { CATALOG, CATALOG_GROUPS } from '../catalog/entries.ts';
import ShowcaseEntry from '../components/ShowcaseEntry.svelte';
import { useFavorites } from '../lib/favorites.svelte.ts';

let { params }: { params: { group?: string } } = $props();
const favorites = useFavorites();
const group = $derived(CATALOG_GROUPS.find((g) => g.id === params.group));
const entries = $derived(CATALOG.filter((e) => e.group === params.group));
</script>

{#if group}
  <div class="mb-6">
    <h1 class="text-2xl font-semibold tracking-tight">{group.name}</h1>
    <p class="mt-1 text-muted-foreground">{group.description}</p>
    <nav aria-label={`${group.name} components`} class="mt-4 flex flex-wrap gap-1.5">
      {#each entries as entry (entry.id)}
        <a href={`#/c/${entry.id}`} class="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium hover:border-primary/50 hover:text-primary">{entry.name}</a>
      {/each}
    </nav>
  </div>
  <div class="space-y-6">
    {#each entries as entry (entry.id)}
      <ShowcaseEntry {entry} starred={favorites.has(entry.id)} />
    {/each}
  </div>
{:else}
  <EmptyState title="Unknown group" description={`There is no “${params.group}” group in the kit.`} />
{/if}
