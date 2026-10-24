<script lang="ts">
import { cx } from 'texuli/cx';

/**
 * The selection checkbox of a DataGrid row, header or phone card. It loads
 * with the selection kit, only for grids that have bulk actions. The row and
 * header variants render their whole ARIA cell (column 1 of the grid).
 */
let {
  variant,
  checked,
  indeterminate = false,
  disabled = false,
  label,
  width = 40,
  onToggle,
}: {
  variant: 'header' | 'cell' | 'card';
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  label: string;
  width?: number;
  /** `range` is true for a shift-click (select from the anchor row). */
  onToggle: (range: boolean) => void;
} = $props();
</script>

{#snippet box(cls: string, tabindex: number | undefined)}
  <input
    type="checkbox"
    {tabindex}
    class={cls}
    aria-label={label}
    {checked}
    {indeterminate}
    {disabled}
    onclick={(event) => {
      event.preventDefault();
      onToggle(event.shiftKey);
    }}
  />
{/snippet}

{#if variant === 'card'}
  {@render box('mt-0.5 size-5 shrink-0 accent-primary', undefined)}
{:else}
  <div
    role={variant === 'header' ? 'columnheader' : 'gridcell'}
    aria-colindex={1}
    class={cx('sticky left-0 z-10 flex shrink-0 items-center justify-center', variant === 'header' ? 'bg-muted' : checked ? 'bg-primary/10' : 'bg-surface')}
    style:width={`${width}px`}
  >
    <!-- Rows: a pointer target; keyboard users press Space on any cell of the row. -->
    {@render box('size-4 accent-primary', variant === 'cell' ? -1 : undefined)}
  </div>
{/if}
