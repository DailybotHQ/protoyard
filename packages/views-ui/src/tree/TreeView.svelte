<script lang="ts" generics="T">
/**
 * Host adapter over `@texuli/data/tree-view` `TreeDataView`.
 * Keeps host selection as `string | null` (single-select) while Texuli uses
 * `string[]`; `onSelect` and layout props match the former host API.
 */
import { runService } from '@protoyard/renderer-svelte';
import type { TreeMove } from '@protoyard/views/tree';
import { TreeDataView } from '@texuli/data/tree-view';
import type { Snippet } from 'svelte';
import QueryState from '../states/QueryState.svelte';

let {
  query,
  getId,
  getParentId,
  getRank,
  getLabel,
  hasChildren,
  loadChildren,
  onMove,
  onSelect,
  onOpen: _onOpen,
  onRetry,
  selected = $bindable<string | null>(null),
  expanded = $bindable<string[]>([]),
  item,
  label = 'Tree',
  emptyTitle: _emptyTitle = 'Nothing here yet',
  height: _height,
  virtualizeAbove: _virtualizeAbove,
  rowHeight: _rowHeight,
  class: className,
}: {
  query: { readonly current: T[] | undefined; readonly loading: boolean; readonly error: unknown };
  getId: (item: T) => string;
  getParentId: (item: T) => string | null;
  getRank: (item: T) => string;
  getLabel?: (item: T) => string;
  hasChildren?: (item: T) => boolean;
  loadChildren?: (item: T) => Promise<readonly T[]> | unknown;
  onMove?: (move: TreeMove, item: T) => unknown;
  onSelect?: (item: T) => void;
  onOpen?: (item: T) => void;
  onRetry?: () => unknown;
  /** Single selection id (host API). */
  selected?: string | null;
  expanded?: string[];
  item?: Snippet<[T, { pending: boolean; selected: boolean }]>;
  label?: string;
  emptyTitle?: string;
  height?: string;
  virtualizeAbove?: number;
  rowHeight?: number;
  class?: string;
} = $props();

// Bridge single-id host selection ↔ Texuli multi-select array.
let selectedIds = $state<string[]>(selected ? [selected] : []);
$effect(() => {
  const next = selected ? [selected] : [];
  if (next.length !== selectedIds.length || next[0] !== selectedIds[0]) {
    selectedIds = next;
  }
});
$effect(() => {
  const id = selectedIds[0] ?? null;
  if (id !== selected) selected = id;
});

async function persist(move: TreeMove, row: T): Promise<void> {
  if (!onMove) return;
  await runService(() => onMove(move, row));
}

function onSelectedChange(ids: string[]): void {
  selectedIds = ids;
  const id = ids[0];
  if (id && onSelect && query.current) {
    const row = query.current.find((r) => getId(r) === id);
    if (row) onSelect(row);
  }
}
</script>

<QueryState {query} label={`Loading ${label.toLowerCase()}`} onRetry={onRetry ? () => { void onRetry(); } : undefined} isEmpty={() => false}>
  {#snippet children(items)}
    <TreeDataView
      {items}
      {getId}
      {getParentId}
      {getRank}
      {getLabel}
      {hasChildren}
      loadChildren={loadChildren as never}
      onMove={onMove ? persist : undefined}
      selected={selectedIds}
      onSelectedChange={onSelectedChange}
      bind:expanded
      class={className}
      labels={{ tree: label }}
      {item}
    />
  {/snippet}
</QueryState>
