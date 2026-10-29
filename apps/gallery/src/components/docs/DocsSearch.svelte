<script lang="ts">
import { Input } from '@protoyard/ui';
import { Icon } from 'texuli/icons';
import { type DocsSearchIndex, isDocsSearchIndex, searchDocs } from '../../lib/docs/search.ts';

interface Props {
  /** The build-time index (`/docs/search-index.json`, base path included). */
  indexUrl: string;
  /** Test seam; defaults to `fetch`. */
  fetchIndex?: (url: string) => Promise<unknown>;
  /** Test seam; defaults to `location.assign`. */
  navigate?: (href: string) => void;
}

let {
  indexUrl,
  fetchIndex = async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  },
  navigate = (href: string) => window.location.assign(href),
}: Props = $props();

let query = $state('');
let index = $state<DocsSearchIndex | null>(null);
let loading = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
let activeIndex = $state(-1);
let dismissed = $state(false);

const results = $derived(index ? searchDocs(index, query) : []);
const hasQuery = $derived(query.trim().length > 0);
const open = $derived(hasQuery && !dismissed && loading === 'ready');
const announcement = $derived(
  loading === 'loading'
    ? 'Loading documentation search…'
    : loading === 'error'
      ? 'Documentation search is unavailable right now.'
      : !hasQuery || loading !== 'ready'
        ? ''
        : results.length === 0
          ? `No results for “${query.trim()}”.`
          : `${results.length} result${results.length === 1 ? '' : 's'}. Use the arrow keys to choose one.`
);

/** Loads the index once, on the first focus or keystroke: the docs pages stay light. */
async function ensureIndex(): Promise<void> {
  if (loading === 'loading' || loading === 'ready') return;
  loading = 'loading';
  try {
    const value = await fetchIndex(indexUrl);
    if (!isDocsSearchIndex(value)) throw new Error('Invalid search index');
    index = value;
    loading = 'ready';
  } catch {
    loading = 'error';
  }
}

function onInput() {
  dismissed = false;
  activeIndex = -1;
  void ensureIndex();
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    if (open) {
      dismissed = true;
      activeIndex = -1;
    } else query = '';
    event.preventDefault();
    return;
  }
  if (!open || results.length === 0) return;
  if (event.key === 'ArrowDown') {
    activeIndex = (activeIndex + 1) % results.length;
    event.preventDefault();
  } else if (event.key === 'ArrowUp') {
    activeIndex = activeIndex <= 0 ? results.length - 1 : activeIndex - 1;
    event.preventDefault();
  } else if (event.key === 'Enter') {
    const chosen = results[activeIndex >= 0 ? activeIndex : 0];
    if (chosen) {
      event.preventDefault();
      navigate(chosen.entry.href);
    }
  }
}
</script>

<div class="relative" role="search">
  <label for="docs-search-input" class="sr-only">Search the documentation</label>
  <div class="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 focus-within:border-accent">
    <Icon icon="search" size={16} class="shrink-0 text-muted" aria-hidden="true" />
    <Input
      id="docs-search-input"
      type="search"
      autocomplete="off"
      spellcheck="false"
      placeholder="Search the docs"
      class="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={open}
      aria-controls="docs-search-results"
      aria-activedescendant={open && activeIndex >= 0 ? `docs-search-option-${activeIndex}` : undefined}
      bind:value={query}
      onfocus={() => void ensureIndex()}
      oninput={onInput}
      onkeydown={onKeydown}
    />
  </div>
  {#if open}
    <ul
      id="docs-search-results"
      role="listbox"
      aria-label="Documentation search results"
      class="absolute inset-x-0 top-full z-20 mt-2 max-h-[min(60vh,26rem)] overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-lg"
    >
      {#each results as result, i (result.entry.href)}
        <li id={`docs-search-option-${i}`} role="option" aria-selected={i === activeIndex}>
          <a
            href={result.entry.href}
            tabindex="-1"
            class="block rounded-md px-3 py-2 text-sm hover:bg-surface-2 aria-selected:bg-accent-soft"
            class:bg-accent-soft={i === activeIndex}
          >
            <span class="block font-medium text-fg">{result.entry.heading}</span>
            <span class="block text-xs text-muted">{result.entry.docTitle}</span>
            {#if result.snippet}
              <span class="mt-1 block text-xs text-muted">{result.snippet}</span>
            {/if}
          </a>
        </li>
      {:else}
        <li role="option" aria-selected="false" class="px-3 py-4 text-center text-sm text-muted">
          No matching sections.
        </li>
      {/each}
    </ul>
  {/if}
  <p class="sr-only" role="status" aria-live="polite">{announcement}</p>
  {#if loading === 'error' && hasQuery}
    <p class="mt-2 text-xs text-muted">Search is unavailable right now. Browse the guides below.</p>
  {/if}
</div>
