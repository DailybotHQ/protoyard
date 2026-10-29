<script lang="ts">
import ChevronLeft from '@lucide/svelte/icons/chevron-left';
import X from '@lucide/svelte/icons/x';
import { Button, Input } from '@protoyard/ui';
import { onMount } from 'svelte';
import { Icon } from 'texuli/icons';
import { LucideIcon } from 'texuli/icons/lucide';
import { library } from '@/lib/library.svelte';
import {
  applyQuery,
  type BrowseQuery,
  DEFAULT_QUERY,
  haystack,
  paramsFromQuery,
  queryFromParams,
} from '@/lib/search';
import type { CompactEntry } from '@/lib/types';
import EmptyBrowseState from './EmptyBrowseState.svelte';
import GallerySelect from './GallerySelect.svelte';
import ProjectCard from './ProjectCard.svelte';

interface Props {
  /** First page, rendered on the server so the grid shows before hydration. */
  initial: CompactEntry[];
  /** id of the <script type="application/json"> holding the full compact index. */
  dataId: string;
  categories: [string, number][];
  tags: [string, number][];
  platforms: [string, number][];
  counts: { prototypes: number; templates: number };
}

let { initial, dataId, categories, tags, platforms, counts }: Props = $props();

const PAGE_SIZE = 24;
let all = $state<CompactEntry[]>(initial);
let ready = $state(false);
let query = $state<BrowseQuery>({ ...DEFAULT_QUERY });
let page = $state(1);
let searchInput = $state<HTMLElement | null>(null);

const index = $derived(all.map((entry) => ({ entry, text: haystack(entry) })));
const results = $derived(applyQuery(index, query, library));
const pageCount = $derived(Math.max(1, Math.ceil(results.length / PAGE_SIZE)));
const visible = $derived(results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE));
const filtered = $derived(
  query.q !== '' ||
    query.platform !== '' ||
    query.category !== '' ||
    query.tag !== '' ||
    query.view !== 'all'
);

onMount(() => {
  library.load();
  const node = document.getElementById(dataId);
  try {
    all = JSON.parse(node?.textContent ?? '[]') as CompactEntry[];
  } catch {
    // keep the server-rendered first page
  }
  query = queryFromParams(new URLSearchParams(window.location.search));
  ready = true;
  const onKey = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    const typing =
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
    if (event.key === '/' && !typing) {
      event.preventDefault();
      searchInput?.focus();
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
});

// Keep the URL in sync (replaceState: filtering is not navigation).
$effect(() => {
  if (!ready) return;
  const search = paramsFromQuery(query);
  if (search !== window.location.search) {
    history.replaceState(null, '', `${window.location.pathname}${search}${window.location.hash}`);
  }
});

function update(patch: Partial<BrowseQuery>) {
  query = { ...query, ...patch };
  page = 1;
}

function reset() {
  query = { ...DEFAULT_QUERY, kind: query.kind };
  page = 1;
}

function goTo(next: number) {
  page = Math.min(pageCount, Math.max(1, next));
  document.getElementById('browse')?.scrollIntoView({ block: 'start' });
}

const select =
  'h-9 rounded-lg border border-line bg-surface px-2.5 text-sm text-fg focus-visible:outline-2 focus-visible:outline-accent';
const kinds = [
  { value: 'prototype', label: 'Prototypes', count: counts.prototypes },
  { value: 'template', label: 'Templates', count: counts.templates },
  { value: 'all', label: 'All', count: counts.prototypes + counts.templates },
] as const;
const views = [
  { value: 'all', label: 'Everything' },
  { value: 'favorites', label: 'Favorites' },
  { value: 'recent', label: 'Recent' },
] as const;
</script>

<section id="browse" aria-labelledby="browse-title" class="scroll-mt-20" data-hydrated={ready}>
  <h2 id="browse-title" class="sr-only">Browse prototypes</h2>
  <div class="flex flex-col gap-3 rounded-xl border border-line bg-surface p-3">
    <div class="flex flex-col gap-3 md:flex-row md:items-center">
      <label class="relative flex-1">
        <span class="sr-only">Search prototypes</span>
        <Icon icon="search" size={16} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
        <Input
          bind:ref={searchInput}
          type="search"
          placeholder="Search name, tag, description…"
          autocomplete="off"
          spellcheck="false"
          class="h-10 w-full rounded-lg border border-line bg-bg pl-9 pr-14 text-sm placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent"
          value={query.q}
          oninput={(e) => update({ q: e.currentTarget.value })}
          data-testid="search"
        />
        <kbd class="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-line px-1.5 font-mono text-[11px] text-muted sm:block">/</kbd>
      </label>
      <div role="group" aria-label="Kind" class="flex rounded-lg border border-line bg-bg p-0.5">
        {#each kinds as kind (kind.value)}
          <Button
            type="button"
            variant="ghost"
            class="rounded-md px-3 py-1.5 text-sm text-muted aria-pressed:bg-surface aria-pressed:text-fg aria-pressed:shadow-sm"
            aria-pressed={query.kind === kind.value}
            onclick={() => update({ kind: kind.value })}
          >
            {kind.label} <span class="text-xs text-muted">{kind.count}</span>
          </Button>
        {/each}
      </div>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <label class="flex items-center gap-1.5 text-sm text-muted">
        <span>Platform</span>
        <GallerySelect class={select} value={query.platform} onValueChange={(value) => update({ platform: value })} items={[{ value: '', label: 'Any' }, ...platforms.map(([value, n]) => ({ value, label: `${value} (${n})` }))]} />
      </label>
      <label class="flex items-center gap-1.5 text-sm text-muted">
        <span>Category</span>
        <GallerySelect class={select} value={query.category} onValueChange={(value) => update({ category: value })} items={[{ value: '', label: 'Any' }, ...categories.map(([value, n]) => ({ value, label: `${value} (${n})` }))]} />
      </label>
      <label class="flex items-center gap-1.5 text-sm text-muted">
        <span>Tag</span>
        <GallerySelect class={select} value={query.tag} onValueChange={(value) => update({ tag: value })} items={[{ value: '', label: 'Any' }, ...tags.map(([value, n]) => ({ value, label: `#${value} (${n})` }))]} />
      </label>
      <label class="flex items-center gap-1.5 text-sm text-muted">
        <span>Sort</span>
        <GallerySelect class={select} value={query.sort} onValueChange={(value) => update({ sort: value as BrowseQuery['sort'] })} items={[{ value: 'name', label: 'Name' }, { value: 'modified', label: 'Last modified' }]} />
      </label>
      <div role="group" aria-label="Show" class="ml-auto flex rounded-lg border border-line bg-bg p-0.5">
        {#each views as view (view.value)}
          <Button
            type="button"
            variant="ghost"
            class="rounded-md px-2.5 py-1 text-sm text-muted aria-pressed:bg-surface aria-pressed:text-fg aria-pressed:shadow-sm"
            aria-pressed={query.view === view.value}
            onclick={() => update({ view: view.value })}
          >
            {view.label}{#if view.value === 'favorites' && library.favorites.length > 0}<span class="ml-1 text-xs">{library.favorites.length}</span>{/if}
          </Button>
        {/each}
      </div>
    </div>
  </div>

  <div class="mt-4 flex items-center justify-between text-sm text-muted">
    <p aria-live="polite" data-testid="result-count">
      {#if results.length === 0}No matches{:else}Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, results.length)} of {results.length}{/if}
    </p>
    {#if filtered}
      <Button type="button" class="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-surface-2 hover:text-fg" onclick={reset}>
        <LucideIcon icon={X} size={14} aria-hidden="true" /> Clear filters
      </Button>
    {/if}
  </div>

  {#if visible.length > 0}
    <ul class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="results">
      {#each visible as entry (entry.k + entry.s)}
        <li><ProjectCard {entry} /></li>
      {/each}
    </ul>
  {:else}
    <EmptyBrowseState
      kind={query.view === 'favorites'
        ? 'favorites'
        : query.view === 'recent'
          ? 'recent'
          : filtered
            ? 'filters'
            : 'none'}
      onClearFilters={reset}
      onBrowseAll={() => update({ view: 'all' })}
    />
  {/if}

  {#if pageCount > 1}
    <nav aria-label="Pagination" class="mt-6 flex items-center justify-center gap-2 text-sm">
      <Button type="button" class="inline-flex items-center gap-1 rounded-md border border-line px-3 py-1.5 disabled:opacity-40" disabled={page === 1} onclick={() => goTo(page - 1)}>
        <LucideIcon icon={ChevronLeft} size={14} aria-hidden="true" /> Previous
      </Button>
      <label class="flex items-center gap-1.5 text-muted">
        <span class="sr-only">Page</span>
        <GallerySelect class={select} value={String(page)} onValueChange={(value) => goTo(Number(value))} items={Array.from({ length: pageCount }, (_, i) => ({ value: String(i + 1), label: `Page ${i + 1}` }))} />
        <span>of {pageCount}</span>
      </label>
      <Button type="button" class="inline-flex items-center gap-1 rounded-md border border-line px-3 py-1.5 disabled:opacity-40" disabled={page === pageCount} onclick={() => goTo(page + 1)}>
        Next <Icon icon="chevron-right" size={14} aria-hidden="true" />
      </Button>
    </nav>
  {/if}
</section>
