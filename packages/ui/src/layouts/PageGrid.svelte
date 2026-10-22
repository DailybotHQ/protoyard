<script lang="ts">
import type { Snippet } from 'svelte';

let {
  columns = 3,
  minItem = 280,
  gap = '1rem',
  label,
  children,
  class: className = '',
}: {
  columns?: 1 | 2 | 3 | 4;
  /** Minimum preferred item width in pixels; narrower containers use one column. */
  minItem?: number;
  gap?: string;
  /** Adds a named region landmark when the grid has a meaningful title. */
  label?: string;
  children: Snippet;
  class?: string;
} = $props();

const safeColumns = $derived(Math.min(4, Math.max(1, Math.floor(columns))));
const safeMinItem = $derived(Math.max(120, Math.floor(minItem)));
</script>

<div
  class="page-grid @container min-w-0 {className}"
  data-py-page-grid
  data-columns={safeColumns}
  role={label ? 'region' : undefined}
  aria-label={label}
  style={`--py-page-grid-columns: ${safeColumns}; --py-page-grid-min: ${safeMinItem}px; --py-page-grid-gap: ${gap}`}
>
  <div class="page-grid__items min-w-0">
    {@render children()}
  </div>
</div>

<style>
  .page-grid {
    min-width: 0;
    container-type: inline-size;
  }

  .page-grid__items {
    display: grid;
    min-width: 0;
    gap: var(--py-page-grid-gap, 1rem);
    grid-template-columns: repeat(
      auto-fit,
      minmax(
        min(
          100%,
          max(
            var(--py-page-grid-min, 280px),
            calc(
              (100% - (var(--py-page-grid-columns, 3) - 1) * var(--py-page-grid-gap, 1rem)) /
                var(--py-page-grid-columns, 3)
            )
          )
        ),
        1fr
      )
    );
  }

  .page-grid__items > :global(*) {
    min-width: 0;
  }
</style>
