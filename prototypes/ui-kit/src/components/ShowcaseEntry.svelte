<script lang="ts">
import { Accessibility } from '@lucide/svelte';
import { Badge } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import type { CatalogEntryMeta } from '../catalog/entries.ts';
import { DEMOS } from '../catalog/registry.ts';
import CodeBlock from './CodeBlock.svelte';
import FavoriteButton from './FavoriteButton.svelte';

let {
  entry,
  starred,
  headingLevel = 2,
}: { entry: CatalogEntryMeta; starred: boolean; headingLevel?: 1 | 2 } = $props();
const demo = $derived(DEMOS[entry.id]);
// Started once per entry; Svelte re-runs it only if the entry changes.
const loading = $derived(demo?.load());
</script>

<section id={`entry-${entry.id}`} class="scroll-mt-24 rounded-xl border border-border bg-surface shadow-soft" aria-labelledby={`entry-${entry.id}-title`}>
  <header class="flex items-start gap-3 border-b border-border px-5 py-4">
    <div class="min-w-0 flex-1">
      <svelte:element this={`h${headingLevel}`} id={`entry-${entry.id}-title`} class="flex items-center gap-2 text-lg font-semibold tracking-tight">
        {#if headingLevel === 2}
          <a href={`#/c/${entry.id}`} class="hover:underline">{entry.name}</a>
        {:else}
          {entry.name}
        {/if}
        <Badge variant="outline" class="font-mono text-[10px]">{entry.group}</Badge>
      </svelte:element>
      <p class="mt-0.5 text-sm text-muted-foreground">{entry.summary}</p>
    </div>
    <FavoriteButton entryId={entry.id} name={entry.name} {starred} />
  </header>
  <div class="px-5 py-5">
    {#if loading}
      {#await loading}
        <div class="h-24 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" aria-label={`Loading ${entry.name} demo`} role="status"></div>
      {:then Demo}
        <Demo />
      {:catch error}
        <p class="text-sm text-destructive" role="alert">Could not load the demo: {String(error)}</p>
      {/await}
    {:else}
      <p class="text-sm text-muted-foreground">No demo registered for “{entry.id}”.</p>
    {/if}
  </div>
  {#if demo}
    <div class="space-y-3 border-t border-border px-5 py-4">
      <CodeBlock code={demo.snippet} />
      {#if demo.a11y?.length}
        <ul class="space-y-1 text-sm text-muted-foreground" aria-label={`${entry.name} accessibility notes`}>
          {#each demo.a11y as note, i (i)}
            <li class="flex gap-2"><LucideIcon icon={Accessibility} class="mt-0.5 size-4 shrink-0 text-info" />{note}</li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</section>
