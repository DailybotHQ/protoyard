<script lang="ts">
import type { Snippet } from 'svelte';
import { CardGrid } from 'texuli/card';

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
  /**
   * Space between items: a step (`none`, `xs`, `sm`, `md`, `lg`, `xl`), a CSS
   * length (`0.75rem`, `12px`) or a custom property name (`--my-gutter`).
   * Anything else falls back to `md` (Texuli's CardGrid `gap`).
   */
  gap?: string;
  /** Adds a named region landmark when the grid has a meaningful title. */
  label?: string;
  children: Snippet;
  class?: string;
} = $props();

const safeColumns = $derived(Math.min(4, Math.max(1, Math.floor(columns))));
const safeMinItem = $derived(Math.max(120, Math.floor(minItem)));
</script>

<!--
  Texuli's CardGrid (`texuli/card`): auto-fill columns capped at `columns`.
  Items may shrink below their content, so a wide child never overflows a
  narrow column.
-->
<CardGrid
  maxColumns={safeColumns}
  minItemWidth={`${safeMinItem}px`}
  {gap}
  class={`min-w-0 [&>*]:min-w-0 ${className}`.trim()}
  role={label ? 'region' : undefined}
  aria-label={label}
  data-py-page-grid=""
  data-columns={safeColumns}
>
  {@render children()}
</CardGrid>
