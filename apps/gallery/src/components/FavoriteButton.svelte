<script lang="ts">
import Star from '@lucide/svelte/icons/star';
import { onMount } from 'svelte';
import { library } from '@/lib/library.svelte';

let {
  slug,
  name,
  withLabel = false,
}: { slug: string; name: string; withLabel?: boolean } = $props();
const active = $derived(library.isFavorite(slug));

onMount(() => library.load());
</script>

<button
  type="button"
  class={[
    'inline-flex items-center gap-1.5 rounded-md border border-transparent p-1.5 text-sm text-muted transition-colors hover:border-line hover:text-fg',
    active && 'text-warning hover:text-warning',
  ]}
  aria-pressed={active}
  aria-label={withLabel
    ? undefined
    : active
      ? `Remove ${name} from favorites`
      : `Add ${name} to favorites`}
  onclick={(event) => {
    event.preventDefault();
    event.stopPropagation();
    library.toggleFavorite(slug);
  }}
>
  <Star size={16} fill={active ? 'currentColor' : 'none'} aria-hidden="true" />
  <!-- With a visible label, the name starts with that label (WCAG 2.5.3) and
       aria-pressed carries the state, so the name never changes on toggle. -->
  {#if withLabel}<span>Favorite</span><span class="sr-only"> {name}</span>{/if}
</button>
