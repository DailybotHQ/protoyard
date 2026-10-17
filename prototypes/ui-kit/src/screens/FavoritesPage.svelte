<script lang="ts">
import { Star } from '@lucide/svelte';
import { can, runService, useClock } from '@protoyard/renderer-svelte';
import { AlertDialog, Button, EmptyState, Skeleton } from '@protoyard/ui';
import { catalogEntry } from '../catalog/entries.ts';
import FavoriteButton from '../components/FavoriteButton.svelte';
import { CAPABILITIES } from '../domain/policy.ts';
import { useFavorites } from '../lib/favorites.svelte.ts';
import { favoritesService } from '../lib/services.ts';

const favorites = useFavorites();
const clock = useClock();
let confirmClear = $state(false);
const rows = $derived(
  favorites.list.flatMap((f) => {
    const entry = catalogEntry(f.entryId);
    return entry ? [{ favorite: f, entry }] : [];
  })
);

function since(iso: string): string {
  const days = Math.floor((clock.now.getTime() - Date.parse(iso)) / 86_400_000);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}
</script>

<div class="mb-6 flex flex-wrap items-end justify-between gap-4">
  <div>
    <h1 class="text-2xl font-semibold tracking-tight">Favorites</h1>
    <p class="mt-1 text-muted-foreground">Starred components, saved per persona in this browser.</p>
  </div>
  {#if rows.length > 0 && can(CAPABILITIES.manage)}
    <Button variant="outline" onclick={() => (confirmClear = true)}>Clear all</Button>
  {/if}
</div>

{#if favorites.loading}
  <div class="space-y-2">{#each [0, 1, 2] as i (i)}<Skeleton class="h-14 w-full" />{/each}</div>
{:else if rows.length === 0}
  <EmptyState
    icon={Star}
    title="No favorites yet"
    description={can(CAPABILITIES.manage)
      ? 'Star components with the ☆ button to collect the ones you use most.'
      : 'Viewers can browse but not star. Switch to the designer persona in DevTools.'}
  >
    {#snippet action()}<Button href="#/components/forms">Browse components</Button>{/snippet}
  </EmptyState>
{:else}
  <ul class="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
    {#each rows as { favorite, entry } (favorite.id)}
      <li class="flex items-center gap-3 px-4 py-3">
        <div class="min-w-0 flex-1">
          <a href={`#/c/${entry.id}`} class="font-medium hover:underline">{entry.name}</a>
          <p class="truncate text-sm text-muted-foreground">{entry.summary}</p>
        </div>
        <span class="hidden text-xs text-muted-foreground sm:inline">starred {since(favorite.createdAt)}</span>
        <FavoriteButton entryId={entry.id} name={entry.name} starred />
      </li>
    {/each}
  </ul>
{/if}

<AlertDialog
  bind:open={confirmClear}
  destructive
  title="Clear all favorites?"
  description="Removes every star for the active persona. Other personas keep theirs."
  confirmLabel="Clear favorites"
  onConfirm={async () => {
    const result = await runService(() => favoritesService().clear(), { success: 'Favorites cleared' });
    if (!result.ok) throw result.error instanceof Error ? result.error : new Error('Could not clear');
  }}
/>
