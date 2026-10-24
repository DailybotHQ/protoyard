<script lang="ts" generics="T">
import { ArrowDown, ArrowUp } from '@lucide/svelte';
import { Button, Input } from '@protoyard/ui';
import {
  type ColumnState,
  defaultColumnState,
  type GridColumnDef,
  moveColumn,
  setColumnHidden,
  showAllColumns,
} from '@protoyard/views/grid';
import { cx } from 'texuli/cx';

/**
 * Chooses which columns show and in what order: a checkbox per column (the
 * last visible one cannot be hidden), move up/down buttons, "Show all" and
 * "Reset", and a search field once there are many columns. Controlled through
 * `onchange` with the next column state (plain data for a saved view).
 */
let {
  columns,
  value,
  onchange,
  label = 'Columns',
  class: className,
}: {
  columns: readonly GridColumnDef<T>[];
  /** Current column state; an empty list means every column in definition order. */
  value: ColumnState;
  onchange: (next: ColumnState) => void;
  label?: string;
  class?: string;
} = $props();

const uid = $props.id();
let query = $state('');
const entries = $derived(
  showAllColumns(value, columns).map((entry) => ({
    ...entry,
    hidden: value.find((v) => v.key === entry.key)?.hidden === true,
  }))
);
const byKey = $derived(new Map(columns.map((column) => [column.key, column])));
const visibleCount = $derived(entries.filter((entry) => !entry.hidden).length);
const shown = $derived(
  query.trim() === ''
    ? entries
    : entries.filter((entry) =>
        (byKey.get(entry.key)?.header ?? entry.key)
          .toLowerCase()
          .includes(query.trim().toLowerCase())
      )
);
/** Every column in the current order, keeping widths, pins and `hidden: true`. */
const listed = (): ColumnState =>
  entries.map(({ hidden, ...entry }) => (hidden ? { ...entry, hidden: true } : entry));

function move(key: string, step: -1 | 1) {
  const target = entries.findIndex((entry) => entry.key === key) + step;
  if (target < 0 || target >= entries.length) return;
  onchange(moveColumn(listed(), key, target));
}
</script>

<fieldset class={cx('grid gap-2', className)}>
  <legend class="mb-1 text-sm font-medium">{label}</legend>
  {#if columns.length > 8}
    <Input bind:value={query} aria-label={`Search ${label.toLowerCase()}`} placeholder="Search columns" class="h-8" />
  {/if}
  <ul class="grid max-h-72 gap-0.5 overflow-auto">
    {#each shown as entry (entry.key)}
      {@const header = byKey.get(entry.key)?.header ?? entry.key}
      {@const at = entries.findIndex((s) => s.key === entry.key)}
      {@const lastVisible = !entry.hidden && visibleCount <= 1}
      <li class="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-muted/50">
        <input
          id={`col-${uid}-${entry.key}`}
          type="checkbox"
          class="size-4 accent-primary"
          checked={!entry.hidden}
          disabled={lastVisible}
          aria-describedby={lastVisible ? `col-${uid}-last` : undefined}
          onchange={(event) => onchange(setColumnHidden(listed(), entry.key, !(event.currentTarget as HTMLInputElement).checked))}
        />
        <label for={`col-${uid}-${entry.key}`} class="min-w-0 flex-1 truncate text-sm">{header}</label>
        <button
          type="button"
          aria-label={`Move ${header} up`}
          disabled={at <= 0 || query.trim() !== ''}
          class="inline-flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40"
          onclick={() => move(entry.key, -1)}
        ><ArrowUp class="size-3.5" aria-hidden="true" /></button>
        <button
          type="button"
          aria-label={`Move ${header} down`}
          disabled={at >= entries.length - 1 || query.trim() !== ''}
          class="inline-flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40"
          onclick={() => move(entry.key, 1)}
        ><ArrowDown class="size-3.5" aria-hidden="true" /></button>
      </li>
    {:else}
      <li class="px-1 text-sm text-muted-foreground">No columns match.</li>
    {/each}
  </ul>
  <p id={`col-${uid}-last`} class="sr-only">At least one column stays visible.</p>
  <div class="flex gap-2">
    <Button variant="outline" size="sm" disabled={visibleCount === entries.length} onclick={() => onchange(showAllColumns(value, columns))}>Show all</Button>
    <Button variant="ghost" size="sm" onclick={() => onchange(defaultColumnState(columns))}>Reset</Button>
  </div>
</fieldset>
