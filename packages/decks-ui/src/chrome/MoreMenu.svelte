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

/** Escape closes the open menu and returns focus to "More"; the deck never sees it. */
function onkeydown(event: KeyboardEvent): void {
  const menu = event.currentTarget as HTMLDetailsElement;
  if (event.key !== 'Escape' || !menu.open) return;
  event.preventDefault();
  event.stopPropagation();
  menu.open = false;
  menu.querySelector('summary')?.focus();
}

/**
 * Where the open menu sits: fixed to the viewport, just above "More" and
 * right-aligned with it, never past a screen edge, and scrolling when the
 * space above is short. The toolbar is the deck's last row, so a menu that
 * opened downward (or lived inside the toolbar's box) left the screen.
 */
let place = $state('');
let details = $state<HTMLDetailsElement>();

/** Places the menu from the "More" button, as it opens (a click, Enter or Space). */
function placeFrom(summary: Element): void {
  const box = summary.getBoundingClientRect();
  place = `bottom:${window.innerHeight - box.top + 8}px;right:${Math.max(8, window.innerWidth - box.right)}px;max-height:${Math.max(96, box.top - 16)}px`;
}

/**
 * Choosing an item closes the menu, so the next Escape reaches what the item
 * opened (the overview, help). Focus goes back to "More" unless the item moved
 * it elsewhere.
 */
function onclick(event: MouseEvent): void {
  const menu = event.currentTarget as HTMLDetailsElement;
  const summary = (event.target as Element | null)?.closest('summary');
  if (summary && !menu.open) placeFrom(summary);
  const item = (event.target as Element | null)?.closest('button');
  if (!item || !menu.contains(item)) return;
  queueMicrotask(() => {
    const keep = menu.contains(document.activeElement);
    menu.open = false;
    if (keep) menu.querySelector('summary')?.focus();
  });
}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -- delegated from the summary and the menu's buttons. -->
<details class="relative" data-py-deck-more {onkeydown} {onclick} bind:this={details}>
  <summary
    class="inline-flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    aria-label="More presentation controls"
  >
    More
  </summary>
  <div
    class="fixed z-50 flex min-w-44 flex-col gap-1 overflow-y-auto rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-lg"
    style={place}
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

<!-- A resize or rotation would leave the fixed menu behind its button: close it. -->
<svelte:window onresize={() => details && (details.open = false)} />
