<script lang="ts" module>
import type { LibraryThemeMeta } from '@protoyard/themes/library';

/** Before a library theme loads, its card shows the seed and secondary colors. */
export function librarySwatches(meta: LibraryThemeMeta): string[] {
  return [meta.seed, meta.secondary ?? meta.seed];
}
</script>

<script lang="ts">
import { Check } from '@lucide/svelte';
import type { Theme } from '@protoyard/core';
import { BUILTIN_THEMES } from '@protoyard/themes';
import {
  listCollections,
  searchThemeLibrary,
  THEME_LIBRARY_META,
  type ThemeCollection,
} from '@protoyard/themes/library';
import Spinner from '../primitives/Spinner.svelte';
import type { DevtoolsState } from '../state.svelte.ts';

/**
 * Every theme a prototype can use, grouped: its own, the built-in presets,
 * saved custom themes and the whole theme library (searchable, by collection
 * and tag, collapsed behind "Browse N more themes"). Choosing a library theme
 * goes through the runtime's resolver, which loads its tokens on first use;
 * the card shows the pending spinner meanwhile. DevTools is its own chunk,
 * so prototypes without DevTools never ship this or the library metadata.
 */

interface Props {
  dt: DevtoolsState;
  /** The runtime's theme list (presets, prototype, custom and loaded library themes). */
  themes: readonly Theme[];
  /** Applies a theme id as an override or persona preference (AppearanceSection decides). */
  select: (themeId: string) => Promise<void>;
}

let { dt, themes, select }: Props = $props();

/** What the runtime can tell about a theme's origin (`@protoyard/runtime` extras). */
type ThemeOrigins = { isCustom?: (id: string) => boolean; isLibrary?: (id: string) => boolean };

const appearance = $derived(dt.appearance);
const applying = $derived(dt.isBusy('appearance'));
const origins = $derived(dt.runtime.theme as ThemeOrigins);

let query = $state('');
let collection = $state<ThemeCollection | ''>('');
let tag = $state('');
let libraryOpen = $state(false);

const BUILTIN_IDS = new Set(BUILTIN_THEMES.map((theme) => theme.id));
const LIBRARY_IDS = new Set(THEME_LIBRARY_META.map((meta) => meta.id));
const COLLECTIONS = listCollections().filter((entry) => entry.count > 0);
const TAGS = [...new Set(THEME_LIBRARY_META.flatMap((meta) => meta.tags))].sort();

const words = $derived(query.toLowerCase().split(/\s+/).filter(Boolean));
const filtering = $derived(words.length > 0 || collection !== '' || tag !== '');

function matches(theme: Theme): boolean {
  if (collection !== '' || tag !== '') return false;
  const text = `${theme.name} ${theme.id} ${theme.description}`.toLowerCase();
  return words.every((word) => text.includes(word));
}

const own = $derived(
  themes.filter(
    (theme) =>
      !BUILTIN_IDS.has(theme.id) &&
      !LIBRARY_IDS.has(theme.id) &&
      !origins.isCustom?.(theme.id) &&
      !origins.isLibrary?.(theme.id)
  )
);
const builtin = $derived(themes.filter((theme) => BUILTIN_IDS.has(theme.id)));
const custom = $derived(themes.filter((theme) => origins.isCustom?.(theme.id)));
const library = $derived(
  searchThemeLibrary(query).filter(
    (meta) =>
      (collection === '' || meta.collection === collection) &&
      (tag === '' || meta.tags.includes(tag))
  )
);
const groups = $derived(
  [
    { id: 'own', label: 'This prototype', themes: own.filter(matches) },
    { id: 'builtin', label: 'Built-in', themes: builtin.filter(matches) },
    { id: 'custom', label: 'Custom', themes: custom.filter(matches) },
  ].filter((group) => group.themes.length > 0)
);
const libraryVisible = $derived(libraryOpen || filtering);
const matchCount = $derived(
  groups.reduce((sum, group) => sum + group.themes.length, 0) + library.length
);

/** The loaded library theme, when the runtime already registered it (swatches from its tokens). */
const loaded = (id: string) => themes.find((theme) => theme.id === id);

function apply(themeId: string) {
  if (!applying) void select(themeId);
}

/** Arrow keys, Home and End move between the radios of one group (roving tabindex). */
function navigate(event: KeyboardEvent) {
  const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
  if (!keys.includes(event.key)) return;
  const group = event.currentTarget as HTMLElement;
  const radios = [...group.querySelectorAll<HTMLElement>('[role="radio"]')];
  const index = radios.indexOf(document.activeElement as HTMLElement);
  if (index === -1) return;
  event.preventDefault();
  const last = radios.length - 1;
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? last
        : event.key === 'ArrowRight' || event.key === 'ArrowDown'
          ? (index + 1) % radios.length
          : (index - 1 + radios.length) % radios.length;
  radios[next]?.focus();
}

/** The radio that takes Tab focus in a group: the selected one, else the first. */
function tabStop(ids: readonly string[], id: string): 0 | -1 {
  const current = appearance.theme.value;
  if (ids.includes(current)) return id === current ? 0 : -1;
  return id === ids[0] ? 0 : -1;
}
</script>

{#snippet card(id: string, name: string, description: string, swatches: readonly string[], groupIds: readonly string[])}
  {@const selected = appearance.theme.value === id}
  {@const pending = dt.isBusy(`appearance:theme:${id}`)}
  <button
    type="button"
    role="radio"
    aria-checked={selected}
    aria-busy={pending || undefined}
    tabindex={tabStop(groupIds, id)}
    disabled={applying && !pending}
    title={description}
    data-theme-id={id}
    class="group flex min-h-touch flex-col items-start gap-1.5 rounded-md border p-2 text-left focus-visible:outline-2 focus-visible:outline-ring {selected
      ? 'border-primary ring-1 ring-primary'
      : 'border-border hover:bg-muted/60'} disabled:opacity-60"
    onclick={() => apply(id)}
  >
    <span class="flex w-full overflow-hidden rounded border border-border/60" aria-hidden="true">
      {#each swatches as color, index (index)}
        <span class="h-5 flex-1" style:background-color={color}></span>
      {/each}
    </span>
    <span class="flex w-full items-center justify-between gap-1 text-[11px] font-medium">
      <span class="truncate">{name}</span>
      {#if pending}<Spinner class="text-primary" />{:else if selected}<Check class="size-3 shrink-0 text-primary" aria-hidden="true" />{/if}
    </span>
  </button>
{/snippet}

<div class="grid gap-3" data-testid="theme-browser">
  <label class="grid gap-1 text-[11px] text-muted-foreground">
    Search themes
    <input
      type="search"
      class="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
      placeholder="Name, mood, tag or category"
      bind:value={query}
      aria-label="Search themes"
    />
  </label>
  {#if filtering}
    <p class="text-[11px] text-muted-foreground" role="status">
      {matchCount === 1 ? '1 theme matches' : `${matchCount} themes match`}
    </p>
  {/if}

  {#each groups as group (group.id)}
    {@const ids = group.themes.map((theme) => theme.id)}
    <div class="grid gap-1.5">
      <p class="text-[11px] font-medium text-muted-foreground" id="theme-group-{group.id}">{group.label}</p>
      <div
        class="grid grid-cols-3 gap-1.5"
        role="radiogroup"
        aria-labelledby="theme-group-{group.id}"
        tabindex="-1"
        onkeydown={navigate}
      >
        {#each group.themes as theme (theme.id)}
          {@const palette = appearance.resolvedMode === 'dark' ? theme.dark : theme.light}
          {@render card(theme.id, theme.name, theme.description, [palette.primary, palette.accent, palette.surface, palette.foreground], ids)}
        {/each}
      </div>
    </div>
  {/each}

  <div class="grid gap-1.5">
    {#if !libraryVisible}
      <button
        type="button"
        class="min-h-touch rounded-md border border-dashed border-border px-2 py-1.5 text-xs font-medium hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring"
        aria-expanded="false"
        onclick={() => (libraryOpen = true)}
      >
        Browse {THEME_LIBRARY_META.length} more themes
      </button>
    {:else}
      <div class="flex items-center justify-between gap-2">
        <p class="text-[11px] font-medium text-muted-foreground" id="theme-group-library">Theme library</p>
        {#if libraryOpen && !filtering}
          <button
            type="button"
            class="rounded px-1.5 text-[11px] text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            aria-expanded="true"
            onclick={() => (libraryOpen = false)}
          >
            Hide library
          </button>
        {/if}
      </div>
      <div class="flex flex-wrap gap-1" role="group" aria-label="Collections">
        <button
          type="button"
          aria-pressed={collection === ''}
          class="rounded-full border px-2 py-0.5 text-[11px] {collection === '' ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground'}"
          onclick={() => (collection = '')}
        >
          All
        </button>
        {#each COLLECTIONS as entry (entry.id)}
          <button
            type="button"
            aria-pressed={collection === entry.id}
            class="rounded-full border px-2 py-0.5 text-[11px] {collection === entry.id ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground'}"
            onclick={() => (collection = collection === entry.id ? '' : entry.id)}
          >
            {entry.id} <span class="tabular-nums">{entry.count}</span>
          </button>
        {/each}
      </div>
      <label class="grid gap-1 text-[11px] text-muted-foreground">
        Tag
        <select
          class="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
          value={tag}
          onchange={(event) => (tag = (event.currentTarget as HTMLSelectElement).value)}
          aria-label="Filter by tag"
        >
          <option value="">Any tag</option>
          {#each TAGS as value (value)}
            <option {value}>{value}</option>
          {/each}
        </select>
      </label>
      {#if library.length === 0}
        <p class="text-xs text-muted-foreground">No library theme matches.</p>
      {:else}
        {@const ids = library.map((meta) => meta.id)}
        <div
          class="grid grid-cols-3 gap-1.5"
          role="radiogroup"
          aria-labelledby="theme-group-library"
          tabindex="-1"
          onkeydown={navigate}
        >
          {#each library as meta (meta.id)}
            {@const theme = loaded(meta.id)}
            {@const palette = theme ? (appearance.resolvedMode === 'dark' ? theme.dark : theme.light) : undefined}
            {@render card(
              meta.id,
              meta.name,
              `${meta.description} (${meta.collection}, ${meta.category})`,
              palette
                ? [palette.primary, palette.accent, palette.surface, palette.foreground]
                : librarySwatches(meta),
              ids
            )}
          {/each}
        </div>
      {/if}
    {/if}
  </div>
</div>
