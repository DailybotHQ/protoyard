<script lang="ts">
import { DECK_CONTROL_GROUPS, type DeckControl } from '@protoyard/decks';
import type { Snippet } from 'svelte';

let {
  controls,
  children,
}: {
  controls: readonly DeckControl[];
  children: Snippet<[DeckControl]>;
} = $props();
</script>

<details class="relative" data-py-deck-more>
  <summary
    class="inline-flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    aria-label="More presentation controls"
  >
    More
  </summary>
  <div
    class="absolute right-0 top-full z-40 mt-2 flex min-w-44 flex-col gap-1 rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-lg"
    data-py-deck-more-menu
  >
    {#each DECK_CONTROL_GROUPS as group (group)}
      {@const grouped = controls.filter((control) => control.group === group)}
      {#if grouped.length > 0}
        <div class="flex flex-col gap-1" role="group" aria-label={group[0]!.toUpperCase() + group.slice(1)}>
          <p class="px-2 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{group}</p>
          {#each grouped as control (control.action)}
            {@render children(control)}
          {/each}
        </div>
      {/if}
    {/each}
  </div>
</details>
