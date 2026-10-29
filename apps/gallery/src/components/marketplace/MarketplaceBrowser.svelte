<script lang="ts">
import X from '@lucide/svelte/icons/x';
import { Button, Input } from '@protoyard/ui';
import { onMount } from 'svelte';
import { Icon } from 'texuli/icons';
import { LucideIcon } from 'texuli/icons/lucide';
import GallerySelect from '../GallerySelect.svelte';
import MarketCard from './MarketCard.svelte';
import {
  EMPTY_QUERY,
  type Facets,
  filterMarket,
  groupRails,
  isFiltered,
  label,
  type MarketEntry,
  type MarketQuery,
  type MarketTheme,
  paramsFromQuery,
  queryFromParams,
} from './model';

/**
 * Category rails, search and filters over every shelved prototype, template
 * and blueprint. The page renders the rails at build time; JavaScript only
 * adds search, filters and URL sync (shareable views).
 */
let {
  entries,
  facets,
  themes = [],
}: { entries: MarketEntry[]; facets: Facets; themes?: MarketTheme[] } = $props();

let query = $state<MarketQuery>({ ...EMPTY_QUERY });
let ready = $state(false);

const filtered = $derived(isFiltered(query));
const results = $derived(filterMarket(entries, query));
const rails = $derived(groupRails(filterMarket(entries, EMPTY_QUERY)));
/** The most common features, as toggles (the long tail is reachable through search). */
const featureChips = $derived(facets.features.slice(0, 18));

onMount(() => {
  query = queryFromParams(new URLSearchParams(window.location.search));
  ready = true;
});

// Filtering is not navigation: replace the URL so the view stays shareable.
$effect(() => {
  if (!ready) return;
  const search = paramsFromQuery(query);
  if (search !== window.location.search) {
    history.replaceState(null, '', `${window.location.pathname}${search}${window.location.hash}`);
  }
});

function update(patch: Partial<MarketQuery>) {
  query = { ...query, ...patch };
}

function toggleFeature(feature: string) {
  update({
    features: query.features.includes(feature)
      ? query.features.filter((f) => f !== feature)
      : [...query.features, feature],
  });
}

function showCategory(category: string) {
  update({ category });
  document.getElementById('market-results')?.scrollIntoView({ block: 'start' });
}

const select =
  'h-9 rounded-lg border border-line bg-surface px-2.5 text-sm text-fg focus-visible:outline-2 focus-visible:outline-accent';
const sourceKinds = [
  { value: '', label: 'Everything', count: entries.length },
  ...facets.kind.map(([value, count]) => ({ value, label: `${label(value)}s`, count })),
] as const;
</script>

<section aria-labelledby="market-browse-title" data-hydrated={ready} class="space-y-6">
  <h2 id="market-browse-title" class="sr-only">Browse the marketplace</h2>
  <div class="flex flex-col gap-3 rounded-xl border border-line bg-surface p-3">
    <div class="flex flex-col gap-3 md:flex-row md:items-center">
      <label class="relative flex-1">
        <span class="sr-only">Search the marketplace</span>
        <Icon icon="search" size={16} class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" aria-hidden="true" />
        <Input
          type="search"
          placeholder="Search products, features, platforms…"
          autocomplete="off"
          spellcheck="false"
          class="h-10 w-full rounded-lg border border-line bg-bg pr-3 pl-9 text-sm placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent"
          value={query.q}
          oninput={(e) => update({ q: e.currentTarget.value })}
          data-testid="market-search"
        />
      </label>
      <div role="group" aria-label="Source type" class="flex flex-wrap rounded-lg border border-line bg-bg p-0.5">
        {#each sourceKinds as kind (kind.value)}
          <Button variant="ghost"
            type="button"
            class="rounded-md px-3 py-1.5 text-sm text-muted aria-pressed:bg-surface aria-pressed:text-fg aria-pressed:shadow-sm"
            aria-pressed={query.kind === kind.value}
            onclick={() => update({ kind: kind.value as MarketQuery['kind'] })}
          >
            {kind.label} <span class="text-xs">{kind.count}</span>
          </Button>
        {/each}
      </div>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <label class="flex items-center gap-1.5 text-sm text-muted">
        <span>Content type</span>
        <GallerySelect class={select} value={query.contentKind} onValueChange={(value) => update({ contentKind: value as MarketQuery['contentKind'] })} data-testid="market-content-kind" items={[{ value: "", label: "Any" }, ...facets.contentKind.map(([value, n]) => ({ value, label: `${label(value)} (${n})` }))]} />
      </label>
      <label class="flex items-center gap-1.5 text-sm text-muted">
        <span>Category</span>
        <GallerySelect class={select} value={query.category} onValueChange={(value) => update({ category: value })} data-testid="market-category" items={[{ value: "", label: "Any" }, ...facets.category.map(([value, n]) => ({ value, label: `${label(value)} (${n})` }))]} />
      </label>
      <label class="flex items-center gap-1.5 text-sm text-muted">
        <span>Runs on</span>
        <GallerySelect class={select} value={query.platform} onValueChange={(value) => update({ platform: value })} items={[{ value: "", label: "Any" }, ...facets.platform.map(([value, n]) => ({ value, label: `${label(value)} (${n})` }))]} />
      </label>
      <label class="flex items-center gap-1.5 text-sm text-muted">
        <span>Shell</span>
        <GallerySelect class={select} value={query.shell} onValueChange={(value) => update({ shell: value })} items={[{ value: "", label: "Any" }, ...facets.shell.map(([value, n]) => ({ value, label: `${label(value)} (${n})` }))]} />
      </label>
      {#if facets.collection.length}
        <label class="flex items-center gap-1.5 text-sm text-muted">
          <span>Theme</span>
          <GallerySelect class={select} value={query.collection} onValueChange={(value) => update({ collection: value })} data-testid="market-collection" items={[{ value: "", label: "Any" }, ...facets.collection.map(([value, n]) => ({ value, label: `${label(value)} (${n})` }))]} />
        </label>
      {/if}
    </div>
    <div role="group" aria-label="Features" class="flex flex-wrap gap-1.5">
      {#each featureChips as [feature, n] (feature)}
        <Button
          type="button"
          class="rounded-full border border-line px-2.5 py-1 text-xs text-muted hover:text-fg aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent-fg"
          aria-pressed={query.features.includes(feature)}
          onclick={() => toggleFeature(feature)}
        >
          {feature} <span class="tabular-nums">{n}</span>
        </Button>
      {/each}
    </div>
  </div>

  <div id="market-results" class="scroll-mt-20">
    {#if filtered}
      <div class="mb-3 flex items-center justify-between text-sm text-muted">
        <p aria-live="polite" data-testid="market-count">
          {results.length === 0 ? 'No matches' : `${results.length} ${results.length === 1 ? 'result' : 'results'}`}
        </p>
        <Button type="button" class="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-surface-2 hover:text-fg" onclick={() => (query = { ...EMPTY_QUERY })}>
          <LucideIcon icon={X} size={14} aria-hidden="true" /> Clear filters
        </Button>
      </div>
      {#if results.length > 0}
        <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-testid="market-results">
          {#each results as entry (entry.k + entry.s)}
            <li><MarketCard {entry} {themes} /></li>
          {/each}
        </ul>
      {:else}
        <div class="rounded-xl border border-dashed border-line p-10 text-center">
          <p class="font-medium">Nothing matches these filters</p>
          <p class="mt-1 text-sm text-muted">Try fewer features or another word.</p>
          <Button type="button" class="mt-4 rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-surface-2" onclick={() => (query = { ...EMPTY_QUERY })}>
            Show everything
          </Button>
        </div>
      {/if}
    {:else}
      <p class="sr-only" aria-live="polite">{entries.length} items in {rails.length} categories</p>
      <div class="space-y-8">
        {#each rails as [category, items] (category)}
          <section aria-labelledby={`rail-${category}`} data-testid="market-rail" data-category={category}>
            <div class="mb-3 flex items-end justify-between gap-3">
              <h3 id={`rail-${category}`} class="text-lg font-semibold tracking-tight">
                {label(category)} <span class="text-sm font-normal text-muted">{items.length}</span>
              </h3>
              <Button type="button" class="text-sm text-accent-fg underline-offset-2 hover:underline" onclick={() => showCategory(category)}>
                See all<span class="sr-only"> {label(category)}</span>
              </Button>
            </div>
            <ul class="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
              {#each items as entry (entry.k + entry.s)}
                <li class="w-64 shrink-0 snap-start"><MarketCard {entry} {themes} headingLevel={4} /></li>
              {/each}
            </ul>
          </section>
        {/each}
      </div>
    {/if}
  </div>
</section>
