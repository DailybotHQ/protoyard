<script lang="ts">
import { onMount } from 'svelte';

interface PrototypeTarget {
  slug: string;
  name: string;
  url: string;
}

interface Props {
  collections: string[];
  moods: string[];
  prototypes: PrototypeTarget[];
  themeCount: number;
}

let { collections, moods, prototypes, themeCount }: Props = $props();

let q = $state('');
let collection = $state('all');
let mood = $state('all');
let mode = $state<'light' | 'dark'>('light');
let prototypeSlug = $state('');
let visibleCount = $state(0);
let ready = $state(false);

const selectedPrototype = $derived(prototypes.find((entry) => entry.slug === prototypeSlug));

function previewUrl(url: string, themeId: string, selectedMode: 'light' | 'dark'): string {
  const parsed = new URL(url, window.location.origin);
  parsed.searchParams.set('theme', themeId);
  parsed.searchParams.set('mode', selectedMode);
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function updateCards() {
  const cards = [...document.querySelectorAll<HTMLElement>('[data-theme-card]')];
  let visible = 0;
  for (const card of cards) {
    const cardCollection = card.dataset.collection ?? '';
    const cardMoods = (card.dataset.moods ?? '').split(' ').filter(Boolean);
    const query = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const haystack = (card.dataset.search ?? '').toLowerCase();
    const matches =
      (collection === 'all' || cardCollection === collection) &&
      (mood === 'all' || cardMoods.includes(mood)) &&
      query.every((word) => haystack.includes(word));
    card.hidden = !matches;
    if (matches) visible += 1;

    for (const sample of card.querySelectorAll<HTMLElement>('[data-theme-mode]')) {
      sample.hidden = sample.dataset.themeMode !== mode;
    }
    const link = card.querySelector<HTMLAnchorElement>('[data-theme-open]');
    if (link && selectedPrototype) {
      link.href = previewUrl(selectedPrototype.url, card.dataset.themeId ?? '', mode);
      link.textContent = `Open ${selectedPrototype.name} in this theme`;
      link.hidden = false;
    } else if (link) {
      link.hidden = true;
    }
  }
  visibleCount = visible;
}

function syncUrl() {
  const params = new URLSearchParams(window.location.search);
  for (const key of ['q', 'collection', 'mood', 'mode']) params.delete(key);
  if (q.trim()) params.set('q', q.trim());
  if (collection !== 'all') params.set('collection', collection);
  if (mood !== 'all') params.set('mood', mood);
  if (mode !== 'light') params.set('mode', mode);
  const search = params.toString();
  history.replaceState(
    null,
    '',
    `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`
  );
}

function clearFilters() {
  q = '';
  collection = 'all';
  mood = 'all';
}

onMount(() => {
  const params = new URLSearchParams(window.location.search);
  q = params.get('q') ?? '';
  collection = collections.includes(params.get('collection') ?? '')
    ? (params.get('collection') ?? 'all')
    : 'all';
  mood = moods.includes(params.get('mood') ?? '') ? (params.get('mood') ?? 'all') : 'all';
  mode = params.get('mode') === 'dark' ? 'dark' : 'light';
  prototypeSlug = prototypes[0]?.slug ?? '';
  ready = true;
  updateCards();
});

$effect(() => {
  if (!ready) return;
  q;
  collection;
  mood;
  mode;
  prototypeSlug;
  updateCards();
  syncUrl();
});

const selectClass =
  'h-10 rounded-lg border border-line bg-surface px-3 text-sm text-fg focus-visible:outline-2 focus-visible:outline-accent';
</script>

<section class="space-y-6" data-testid="theme-explorer" data-hydrated={ready ? 'true' : 'false'}>
  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <label class="relative min-w-0 lg:col-span-2">
      <span class="sr-only">Search themes</span>
      <input
        class={`${selectClass} w-full pl-3`}
        type="search"
        placeholder="Search name, palette, mood…"
        bind:value={q}
        data-testid="theme-search"
      />
    </label>
    <label class="flex flex-col gap-1 text-xs text-muted">
      Collection
      <select
        class={selectClass}
        value={collection}
        onchange={(event) => (collection = event.currentTarget.value)}
        data-testid="theme-collection"
      >
        <option value="all">All collections</option>
        {#each collections as item (item)}
          <option value={item}>{item}</option>
        {/each}
      </select>
    </label>
    <label class="flex flex-col gap-1 text-xs text-muted">
      Mood
      <select
        class={selectClass}
        value={mood}
        onchange={(event) => (mood = event.currentTarget.value)}
        data-testid="theme-mood"
      >
        <option value="all">All moods</option>
        {#each moods as item (item)}
          <option value={item}>{item}</option>
        {/each}
      </select>
    </label>
  </div>

  <div class="flex flex-wrap items-center justify-between gap-3">
    <p class="text-sm text-muted" role="status" data-testid="theme-count">
      Showing {ready ? visibleCount : themeCount} of {themeCount} themes
    </p>
    <div class="flex flex-wrap items-center gap-3">
      {#if prototypes.length > 0}
        <label class="flex items-center gap-2 text-sm text-muted">
          Preview prototype
          <select
            class={selectClass}
            value={prototypeSlug}
            onchange={(event) => (prototypeSlug = event.currentTarget.value)}
            data-testid="theme-prototype"
          >
            {#each prototypes as prototype (prototype.slug)}
              <option value={prototype.slug}>{prototype.name}</option>
            {/each}
          </select>
        </label>
      {/if}
      <div class="inline-flex rounded-lg border border-line bg-surface p-1" role="group" aria-label="Theme preview mode">
        <button
          type="button"
          class={mode === 'light' ? 'rounded-md bg-accent px-3 py-1.5 text-sm text-on-accent' : 'rounded-md px-3 py-1.5 text-sm text-muted hover:text-fg'}
          aria-pressed={mode === 'light'}
          onclick={() => (mode = 'light')}
        >Light</button>
        <button
          type="button"
          class={mode === 'dark' ? 'rounded-md bg-accent px-3 py-1.5 text-sm text-on-accent' : 'rounded-md px-3 py-1.5 text-sm text-muted hover:text-fg'}
          aria-pressed={mode === 'dark'}
          onclick={() => (mode = 'dark')}
        >Dark</button>
      </div>
      {#if q || collection !== 'all' || mood !== 'all'}
        <button
          type="button"
          class="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg hover:bg-surface-2"
          onclick={clearFilters}
        >Clear filters</button>
      {/if}
    </div>
  </div>
</section>
