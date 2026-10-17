<script lang="ts">
import ChevronLeft from '@lucide/svelte/icons/chevron-left';
import ChevronRight from '@lucide/svelte/icons/chevron-right';
import Search from '@lucide/svelte/icons/search';
import X from '@lucide/svelte/icons/x';
import { onMount } from 'svelte';
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
let searchInput: HTMLInputElement | undefined = $state();

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
        <Search size={16} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          bind:this={searchInput}
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
          <button
            type="button"
            class="rounded-md px-3 py-1.5 text-sm text-muted aria-pressed:bg-surface aria-pressed:text-fg aria-pressed:shadow-sm"
            aria-pressed={query.kind === kind.value}
            onclick={() => update({ kind: kind.value })}
          >
            {kind.label} <span class="text-xs text-muted">{kind.count}</span>
          </button>
        {/each}
      </div>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <label class="flex items-center gap-1.5 text-sm text-muted">
        <span>Platform</span>
        <select class={select} value={query.platform} onchange={(e) => update({ platform: e.currentTarget.value })}>
          <option value="">Any</option>
          {#each platforms as [value, n] (value)}<option {value}>{value} ({n})</option>{/each}
        </select>
      </label>
      <label class="flex items-center gap-1.5 text-sm text-muted">
        <span>Category</span>
        <select class={select} value={query.category} onchange={(e) => update({ category: e.currentTarget.value })}>
          <option value="">Any</option>
          {#each categories as [value, n] (value)}<option {value}>{value} ({n})</option>{/each}
        </select>
      </label>
      <label class="flex items-center gap-1.5 text-sm text-muted">
        <span>Tag</span>
        <select class={select} value={query.tag} onchange={(e) => update({ tag: e.currentTarget.value })}>
          <option value="">Any</option>
          {#each tags as [value, n] (value)}<option {value}>#{value} ({n})</option>{/each}
        </select>
      </label>
      <label class="flex items-center gap-1.5 text-sm text-muted">
        <span>Sort</span>
        <select class={select} value={query.sort} onchange={(e) => update({ sort: e.currentTarget.value as BrowseQuery['sort'] })}>
          <option value="name">Name</option>
          <option value="modified">Last modified</option>
        </select>
      </label>
      <div role="group" aria-label="Show" class="ml-auto flex rounded-lg border border-line bg-bg p-0.5">
        {#each views as view (view.value)}
          <button
            type="button"
            class="rounded-md px-2.5 py-1 text-sm text-muted aria-pressed:bg-surface aria-pressed:text-fg aria-pressed:shadow-sm"
            aria-pressed={query.view === view.value}
            onclick={() => update({ view: view.value })}
          >
            {view.label}{#if view.value === 'favorites' && library.favorites.length > 0}<span class="ml-1 text-xs">{library.favorites.length}</span>{/if}
          </button>
        {/each}
      </div>
    </div>
  </div>

  <div class="mt-4 flex items-center justify-between text-sm text-muted">
    <p aria-live="polite" data-testid="result-count">
      {#if results.length === 0}No matches{:else}Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, results.length)} of {results.length}{/if}
    </p>
    {#if filtered}
      <button type="button" class="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-surface-2 hover:text-fg" onclick={reset}>
        <X size={14} aria-hidden="true" /> Clear filters
      </button>
    {/if}
  </div>

  {#if visible.length > 0}
    <ul class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="results">
      {#each visible as entry (entry.k + entry.s)}
        <li><ProjectCard {entry} /></li>
      {/each}
    </ul>
  {:else}
    <div class="mt-3 rounded-xl border border-dashed border-line p-10 text-center">
      <p class="font-medium">
        {#if query.view === 'favorites'}No favorites yet{:else if query.view === 'recent'}Nothing opened yet{:else}Nothing matches these filters{/if}
      </p>
      <p class="mt-1 text-sm text-muted">
        {#if query.view === 'favorites'}Star a prototype to keep it here (stored in this browser only).{:else if query.view === 'recent'}Prototypes you open appear here.{:else}Try fewer words or clear the filters.{/if}
      </p>
    </div>
  {/if}

  {#if pageCount > 1}
    <nav aria-label="Pagination" class="mt-6 flex items-center justify-center gap-2 text-sm">
      <button type="button" class="inline-flex items-center gap-1 rounded-md border border-line px-3 py-1.5 disabled:opacity-40" disabled={page === 1} onclick={() => goTo(page - 1)}>
        <ChevronLeft size={14} aria-hidden="true" /> Previous
      </button>
      <label class="flex items-center gap-1.5 text-muted">
        <span class="sr-only">Page</span>
        <select class={select} value={page} onchange={(e) => goTo(Number(e.currentTarget.value))}>
          {#each Array.from({ length: pageCount }, (_, i) => i + 1) as n (n)}<option value={n}>Page {n}</option>{/each}
        </select>
        <span>of {pageCount}</span>
      </label>
      <button type="button" class="inline-flex items-center gap-1 rounded-md border border-line px-3 py-1.5 disabled:opacity-40" disabled={page === pageCount} onclick={() => goTo(page + 1)}>
        Next <ChevronRight size={14} aria-hidden="true" />
      </button>
    </nav>
  {/if}
</section>
