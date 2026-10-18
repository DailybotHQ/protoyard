<script lang="ts">
import Search from '@lucide/svelte/icons/search';
import X from '@lucide/svelte/icons/x';
import { onMount } from 'svelte';
import type { ThemeCardData } from '../lib/theme-catalog.ts';
import { filterThemeCards } from '../lib/theme-catalog.ts';
import ThemeSwatch from './ThemeSwatch.svelte';

interface Props {
  themes: ThemeCardData[];
  categories: string[];
  previewUrl: string | null;
  previewName?: string | null;
}

let { themes, categories, previewUrl, previewName }: Props = $props();

let category = $state('all');
let q = $state('');
let ready = $state(false);

const visible = $derived(filterThemeCards(themes, { category, q }));

onMount(() => {
  const params = new URLSearchParams(window.location.search);
  const cat = params.get('category');
  const query = params.get('q');
  if (cat) category = cat;
  if (query) q = query;
  ready = true;
});

$effect(() => {
  if (!ready) return;
  const params = new URLSearchParams();
  if (category !== 'all') params.set('category', category);
  if (q.trim()) params.set('q', q.trim());
  const search = params.toString() ? `?${params}` : '';
  if (search !== window.location.search) {
    history.replaceState(null, '', `${window.location.pathname}${search}${window.location.hash}`);
  }
});

function selectCategory(next: string) {
  category = next;
}

function clearFilters() {
  category = 'all';
  q = '';
}

const selectClass =
  'h-9 rounded-lg border border-line bg-surface px-2.5 text-sm text-fg focus-visible:outline-2 focus-visible:outline-accent';
</script>

<div class="space-y-6" data-testid="theme-browser">
  <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
    <label class="relative min-w-0 flex-1 sm:max-w-sm">
      <span class="sr-only">Search themes</span>
      <Search
        class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
        aria-hidden="true"
      />
      <input
        type="search"
        class="h-9 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-sm text-fg placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent"
        placeholder="Search name, id, tag…"
        bind:value={q}
        data-testid="theme-search"
      />
    </label>
    <label class="flex flex-col gap-1 text-xs text-muted">
      Category
      <select
        class={selectClass}
        bind:value={category}
        data-testid="theme-category"
        aria-label="Filter by category"
      >
        <option value="all">All categories ({themes.length})</option>
        {#each categories as cat (cat)}
          <option value={cat}>
            {cat}
            ({themes.filter((t) => t.category === cat).length})
          </option>
        {/each}
      </select>
    </label>
    {#if category !== 'all' || q.trim()}
      <button
        type="button"
        class="inline-flex h-9 items-center gap-1 rounded-lg border border-line bg-surface px-3 text-sm text-fg hover:bg-surface-2"
        onclick={clearFilters}
      >
        <X class="size-3.5" aria-hidden="true" />
        Clear filters
      </button>
    {/if}
  </div>

  <div class="flex flex-wrap gap-1.5" role="group" aria-label="Category chips">
    <button
      type="button"
      class={[
        'rounded-full px-3 py-1 text-xs font-medium',
        category === 'all' ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted hover:text-fg',
      ]}
      aria-pressed={category === 'all'}
      onclick={() => selectCategory('all')}
    >
      All
    </button>
    {#each categories as cat (cat)}
      <button
        type="button"
        class={[
          'rounded-full px-3 py-1 text-xs font-medium capitalize',
          category === cat ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted hover:text-fg',
        ]}
        aria-pressed={category === cat}
        onclick={() => selectCategory(cat)}
      >
        {cat}
      </button>
    {/each}
  </div>

  <p class="text-sm text-muted" role="status" data-testid="theme-count">
    Showing {visible.length} of {themes.length} themes
    {#if previewName}
      · preview target <span class="font-medium text-fg">{previewName}</span>
    {/if}
  </p>

  {#if visible.length === 0}
    <p class="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted" role="status">
      No themes match these filters.
    </p>
  {:else}
    <ul class="grid gap-4 lg:grid-cols-2" data-testid="theme-grid">
      {#each visible as theme (theme.id)}
        <li>
          <ThemeSwatch
            {theme}
            {previewUrl}
            previewLabel={previewName ? `Try in ${previewName}` : 'Open preview'}
          />
        </li>
      {/each}
    </ul>
  {/if}
</div>
