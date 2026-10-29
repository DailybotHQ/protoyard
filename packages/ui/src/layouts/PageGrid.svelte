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
   * Space between items: `sm`, `md` or `lg`, or a CSS length mapped to the
   * nearest of those (0.5, 1 or 1.5rem). Texuli's CardGrid takes its gap
   * scale only (Texuli gap N22).
   */
  gap?: string;
  /** Adds a named region landmark when the grid has a meaningful title. */
  label?: string;
  children: Snippet;
  class?: string;
} = $props();

const safeColumns = $derived(Math.min(4, Math.max(1, Math.floor(columns))));
const safeMinItem = $derived(Math.max(120, Math.floor(minItem)));

/** The CardGrid gap step closest to a CSS length (rem or px; 16px = 1rem). */
function gapStep(value: string): 'sm' | 'md' | 'lg' {
  if (value === 'sm' || value === 'md' || value === 'lg') return value;
  const match = /^(\d*\.?\d+)(rem|px)$/.exec(value.trim());
  if (!match) return 'md';
  const rem = Number(match[1]) / (match[2] === 'px' ? 16 : 1);
  return rem <= 0.75 ? 'sm' : rem >= 1.25 ? 'lg' : 'md';
}
</script>

<!--
  Texuli's CardGrid (`texuli/card`): auto-fill columns capped at `columns`.
  Items may shrink below their content, so a wide child never overflows a
  narrow column.
-->
<CardGrid
  maxColumns={safeColumns}
  minItemWidth={`${safeMinItem}px`}
  gap={gapStep(gap)}
  class={`min-w-0 [&>*]:min-w-0 ${className}`.trim()}
  role={label ? 'region' : undefined}
  aria-label={label}
  data-py-page-grid=""
  data-columns={safeColumns}
>
  {@render children()}
</CardGrid>
