<script lang="ts">
import { seriesColor } from '@protoyard/charts/palette';
import { toggleSeries } from './model.ts';

let {
  items,
  hidden = new Set<string>(),
  onchange,
  label = 'Series',
}: {
  items: readonly { id: string; label: string; color?: string }[];
  hidden?: ReadonlySet<string>;
  /** Receives the next hidden set; omit for a static legend. */
  onchange?: (hidden: Set<string>) => void;
  label?: string;
} = $props();

const ids = $derived(items.map((i) => i.id));
const visibleCount = $derived(ids.filter((id) => !hidden.has(id)).length);
</script>

<ul class="m-0 flex list-none flex-wrap gap-x-3 gap-y-1 p-0 text-xs" aria-label={label}>
  {#each items as item, i (item.id)}
    {@const shown = !hidden.has(item.id)}
    {@const locked = shown && visibleCount <= 1}
    <li>
      {#if onchange}
        <button
          type="button"
          class="inline-flex min-h-touch items-center gap-1.5 rounded-md px-1.5 py-1 text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:min-h-0 {shown
            ? ''
            : 'text-muted-foreground line-through'}"
          aria-pressed={shown}
          aria-disabled={locked ? 'true' : undefined}
          title={locked ? 'At least one series stays visible' : shown ? `Hide ${item.label}` : `Show ${item.label}`}
          onclick={() => {
            if (!locked) onchange(toggleSeries(hidden, item.id, ids));
          }}
        >
          <span
            class="size-2.5 shrink-0 rounded-sm"
            style:background={shown ? (item.color ?? seriesColor(i)) : 'transparent'}
            style:outline="1.5px solid {item.color ?? seriesColor(i)}"
            aria-hidden="true"
          ></span>
          {item.label}
        </button>
      {:else}
        <span class="inline-flex items-center gap-1.5 px-1.5 py-1 text-foreground">
          <span class="size-2.5 shrink-0 rounded-sm" style:background={item.color ?? seriesColor(i)} aria-hidden="true"></span>
          {item.label}
        </span>
      {/if}
    </li>
  {/each}
</ul>
