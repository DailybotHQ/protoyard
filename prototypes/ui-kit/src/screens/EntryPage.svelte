<script lang="ts">
import { ArrowLeft, ArrowRight } from '@lucide/svelte';
import { Breadcrumb, Button, EmptyState } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import { CATALOG, CATALOG_GROUPS, catalogEntry } from '../catalog/entries.ts';
import ShowcaseEntry from '../components/ShowcaseEntry.svelte';
import { useFavorites } from '../lib/favorites.svelte.ts';

let { params }: { params: { id?: string } } = $props();
const favorites = useFavorites();
const entry = $derived(catalogEntry(params.id ?? ''));
const index = $derived(entry ? CATALOG.indexOf(entry) : -1);
const prev = $derived(index > 0 ? CATALOG[index - 1] : undefined);
const next = $derived(index >= 0 && index < CATALOG.length - 1 ? CATALOG[index + 1] : undefined);
const group = $derived(CATALOG_GROUPS.find((g) => g.id === entry?.group));
</script>

{#if entry}
  <Breadcrumb
    class="mb-4"
    items={[
      { label: 'Overview', href: '#/' },
      { label: group?.name ?? entry.group, href: `#/components/${entry.group}` },
      { label: entry.name },
    ]}
  />
  <ShowcaseEntry {entry} starred={favorites.has(entry.id)} headingLevel={1} />
  <nav class="mt-6 flex justify-between gap-3" aria-label="Previous and next component">
    {#if prev}
      <Button variant="outline" href={`#/c/${prev.id}`}><LucideIcon icon={ArrowLeft} class="size-4" />{prev.name}</Button>
    {:else}<span></span>{/if}
    {#if next}
      <Button variant="outline" href={`#/c/${next.id}`}>{next.name}<LucideIcon icon={ArrowRight} class="size-4" /></Button>
    {/if}
  </nav>
{:else}
  <EmptyState title="Component not found" description={`“${params.id}” is not in the catalog.`}>
    {#snippet action()}<Button href="#/">Back to overview</Button>{/snippet}
  </EmptyState>
{/if}
