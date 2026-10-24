<script lang="ts">
import { Blocks, Palette, Shapes, Star } from '@lucide/svelte';
import { usePrincipal } from '@protoyard/renderer-svelte';
import { BUILTIN_THEMES } from '@protoyard/themes';
import { Button, CardGrid, StatCard } from '@protoyard/ui';
import { CATALOG, CATALOG_GROUPS, catalogEntry } from '../catalog/entries.ts';
import { useFavorites } from '../lib/favorites.svelte.ts';

const principal = usePrincipal();
const favorites = useFavorites();
const components = CATALOG.filter((e) => e.group !== 'patterns');
const patterns = CATALOG.filter((e) => e.group === 'patterns');
const recent = $derived(favorites.list.slice(0, 5).flatMap((f) => catalogEntry(f.entryId) ?? []));
</script>

<section class="rounded-2xl border border-border bg-surface p-6 shadow-soft sm:p-10">
  <p class="text-sm font-medium text-primary">@protoyard/ui</p>
  <h1 class="mt-2 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">The components behind every Protoyard prototype</h1>
  <p class="mt-3 max-w-2xl text-muted-foreground">
    Svelte 5 + Texuli + Tailwind 4, themed by tokens. Every demo here is live: open dialogs, sort tables,
    drag cards, switch themes. Use DevTools (<kbd class="rounded border border-border bg-muted px-1 font-mono text-xs">Ctrl</kbd>/<kbd class="rounded border border-border bg-muted px-1 font-mono text-xs">⌘</kbd> + <kbd class="rounded border border-border bg-muted px-1 font-mono text-xs">.</kbd>) to change persona, theme or mode.
  </p>
  <div class="mt-6 flex flex-wrap gap-2">
    <Button href="#/components/forms"><Blocks class="size-4" aria-hidden="true" />Browse components</Button>
    <Button variant="outline" href="#/themes"><Palette class="size-4" aria-hidden="true" />Open the theme lab</Button>
  </div>
</section>

<CardGrid class="mt-6" minItemWidth="12rem">
  <StatCard label="Components" value={components.length} hint={`${CATALOG_GROUPS.length - 1} groups`} icon={Blocks} />
  <StatCard label="Patterns" value={patterns.length} hint="Whole screens" icon={Shapes} />
  <StatCard label="Themes" value={BUILTIN_THEMES.length} hint="Light + dark each" icon={Palette} />
  <StatCard label="Your favorites" value={favorites.list.length} hint={principal.current?.persona.name ?? '—'} icon={Star} />
</CardGrid>

<div class="mt-10 grid gap-8 lg:grid-cols-[1fr_18rem]">
  <section aria-labelledby="groups-title">
    <h2 id="groups-title" class="mb-3 text-lg font-semibold">Groups</h2>
    <ul class="grid gap-3 sm:grid-cols-2">
      {#each CATALOG_GROUPS as group (group.id)}
        {@const count = CATALOG.filter((e) => e.group === group.id).length}
        <li>
          <a href={`#/components/${group.id}`} class="block h-full rounded-xl border border-border bg-surface p-4 transition-colors hover:border-primary/50">
            <span class="flex items-center justify-between font-medium">{group.name}<span class="text-xs text-muted-foreground">{count}</span></span>
            <span class="mt-1 block text-sm text-muted-foreground">{group.description}</span>
          </a>
        </li>
      {/each}
    </ul>
  </section>
  <aside aria-labelledby="recent-title">
    <h2 id="recent-title" class="mb-3 text-lg font-semibold">Recently starred</h2>
    {#if recent.length === 0}
      <p class="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Nothing starred yet. Use ☆ on any component.</p>
    {:else}
      <ul class="space-y-1">
        {#each recent as entry (entry.id)}
          <li><a href={`#/c/${entry.id}`} class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"><Star class="size-3.5 fill-current text-warning" aria-hidden="true" />{entry.name}</a></li>
        {/each}
      </ul>
      <a href="#/favorites" class="mt-2 inline-block text-sm font-medium text-primary hover:underline">All favorites →</a>
    {/if}
  </aside>
</div>
